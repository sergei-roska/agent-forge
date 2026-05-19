import { randomUUID } from 'node:crypto';
import { openDb } from '../storage/sqlite.js';
import { openChunksTable } from '../storage/lancedb.js';
import { IndexRunsRepo } from '../storage/repositories/IndexRunsRepo.js';
import { IndexStatsRepo } from '../storage/repositories/IndexStatsRepo.js';
import { ChunksQueueRepo } from '../storage/repositories/ChunksQueueRepo.js';
import { scanProject } from './scanner/FileScanner.js';
import { FingerprintDiffer } from './scanner/FingerprintDiffer.js';
import { ChunkerDispatcher } from './chunking/ChunkerDispatcher.js';
import { EmbedConsumer } from './embedding/EmbedConsumer.js';
import { probeVectorDim, createEmbeddingBackend } from './embedding/EmbeddingBackendFactory.js';
import { IvfRebuild } from './optimization/IvfRebuild.js';
import { ConcurrencyLock } from './ConcurrencyLock.js';
import { SCHEMA_VERSION } from '../constants.js';
import type { StartIndexingInput, StartIndexingOutput } from '../contracts/startIndexing.schema.js';
import type { PauseIndexingOutput } from '../contracts/pauseIndexing.schema.js';
import type { GetIndexingStatusOutput } from '../contracts/getIndexingStatus.schema.js';
import { IndexerError, ErrorCode } from '../errors/codes.js';

// ── Priority mapping ──────────────────────────────────────────────────────────

const PRIORITY_MAP: Record<string, number> = {
  user_focus: 3,
  recent:     2,
  background: 1,
};

// ── Progress bar ──────────────────────────────────────────────────────────────

function buildProgressBar(percent: number, width = 20): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled  = Math.floor((clamped / 100) * width);
  const hasArrow = filled < width;
  const arrow   = hasArrow ? '>' : '';
  const empty   = width - filled - (hasArrow ? 1 : 0);
  return `[${'='.repeat(filled)}${arrow}${' '.repeat(Math.max(0, empty))}] ${Math.round(clamped)}%`;
}

// ── RunCoordinator ────────────────────────────────────────────────────────────

export class RunCoordinator {
  private readonly lock = new ConcurrencyLock();
  /** runId → active EmbedConsumer (for pause support) */
  private readonly activeConsumers = new Map<string, EmbedConsumer>();
  /** runId → projectPath (for getStatus without projectPath) */
  private readonly runProjectIndex = new Map<string, string>();

  // ── Public API ─────────────────────────────────────────────────────────────

  async start(opts: StartIndexingInput): Promise<StartIndexingOutput> {
    const projectPath = opts.project_path;
    const db = openDb(projectPath);

    // Concurrency check
    const lockResult = this.lock.tryAcquire(projectPath, db);
    if (!lockResult.acquired) {
      db.close();
      return {
        run_id:           lockResult.existing_run_id,
        status:           'already_running',
        project_path:     projectPath,
        phases:           opts.phases ?? ['discovery', 'embedding'],
        message:          `Indexing already running (run_id: ${lockResult.existing_run_id}, age: ${lockResult.lock_age_seconds}s).`,
        lock_owner:       lockResult.existing_run_id,
        lock_age_seconds: lockResult.lock_age_seconds,
      };
    }

    const runId  = randomUUID();
    const phases = opts.phases ?? ['discovery', 'embedding'];

    const runsRepo = new IndexRunsRepo(db);
    runsRepo.create({
      run_id:               runId,
      project_path:         projectPath,
      phase:                phases[0] ?? 'discovery',
      status:               'running',
      started_at:           Date.now(),
      updated_at:           Date.now(),
      schema_version:       SCHEMA_VERSION,
    });
    db.close();

    this.lock.acquire(projectPath, runId);
    this.runProjectIndex.set(runId, projectPath);

    // Fire-and-forget — tools return immediately
    this._runPipeline(runId, projectPath, phases, opts).catch((err) => {
      const db2 = openDb(projectPath);
      new IndexRunsRepo(db2).update(runId, {
        status:     'error',
        error:      err instanceof Error ? err.message : String(err),
        updated_at: Date.now(),
      });
      db2.close();
      this.lock.release(projectPath);
      this.activeConsumers.delete(runId);
    });

    return {
      run_id:       runId,
      status:       'started',
      project_path: projectPath,
      phases,
      message:      `Indexing started. Poll with get_indexing_status(run_id: "${runId}").`,
    };
  }

  pause(runId: string): PauseIndexingOutput {
    const consumer    = this.activeConsumers.get(runId);
    const projectPath = this.runProjectIndex.get(runId);

    if (!consumer || !projectPath) {
      return {
        run_id:                runId,
        status:                'not_found',
        chunks_embedded_so_far: 0,
        chunks_remaining:       0,
        message:               `No active run found for run_id: ${runId}`,
      };
    }

    const db       = openDb(projectPath);
    const run      = new IndexRunsRepo(db).getById(runId);
    const embedded = run?.chunks_embedded ?? 0;
    const pending  = new ChunksQueueRepo(db).countPending(projectPath);
    db.close();

    if (run?.status === 'paused') {
      return { run_id: runId, status: 'already_paused', chunks_embedded_so_far: embedded, chunks_remaining: pending, message: 'Run is already paused.' };
    }

    consumer.requestPause();
    return {
      run_id:                 runId,
      status:                 'pausing',
      chunks_embedded_so_far: embedded,
      chunks_remaining:       pending,
      message:                'Pause requested. Current batch will complete before stopping.',
    };
  }

  getStatus(runId?: string, projectPath?: string): GetIndexingStatusOutput {
    // Resolve projectPath from in-memory index or from SQLite
    let resolvedProject = projectPath;
    let resolvedRunId   = runId;

    if (runId) {
      resolvedProject = this.runProjectIndex.get(runId) ?? projectPath;
    }

    if (!resolvedProject && !runId) {
      throw new IndexerError(ErrorCode.PROJECT_PATH_REQUIRED, 'Provide run_id or project_path.');
    }

    // Need a DB to read from — infer project_path from run if still unknown
    if (!resolvedProject) {
      // Last resort: scan all known projects for this run_id
      throw new IndexerError(ErrorCode.RUN_NOT_FOUND, `Cannot resolve project_path for run_id: ${runId}`);
    }

    const db  = openDb(resolvedProject);
    const repo = new IndexRunsRepo(db);

    const run = resolvedRunId
      ? repo.getById(resolvedRunId)
      : repo.getMostRecent(resolvedProject);

    if (!run) {
      db.close();
      throw new IndexerError(ErrorCode.RUN_NOT_FOUND, `No run found for ${resolvedRunId ?? resolvedProject}`);
    }

    resolvedRunId = run.run_id;

    const chunksRepo = new ChunksQueueRepo(db);
    const statsRepo  = new IndexStatsRepo(db);

    const pending    = chunksRepo.countPending(resolvedProject);
    const embedded   = run.chunks_embedded ?? 0;
    const total      = (run.chunks_total_pending ?? 0) || (embedded + pending);
    const percent    = total > 0 ? Math.min(100, (embedded / total) * 100) : 0;

    const elapsedMs  = run.started_at ? Date.now() - run.started_at : 0;
    const elapsedSec = elapsedMs / 1000;
    const throughput = elapsedSec > 5 && embedded > 0 ? embedded / elapsedSec : 0;
    const eta        = throughput > 0 && pending > 0 ? Math.round(pending / throughput) : -1;

    const vectorCount = statsRepo.get(resolvedProject)?.vector_count ?? 0;
    const warnings    = JSON.parse((run.warnings ?? '[]') as string) as string[];

    db.close();

    return {
      run_id:        resolvedRunId,
      project_path:  resolvedProject,
      phase:         (run.phase ?? 'discovery') as GetIndexingStatusOutput['phase'],
      status:        (run.status ?? 'running') as GetIndexingStatusOutput['status'],
      progress: {
        files_discovered:        run.files_discovered  ?? 0,
        files_parsed:            run.files_parsed      ?? 0,
        files_total:             run.files_discovered  ?? 0,
        chunks_pending:          pending,
        chunks_embedded:         embedded,
        chunks_total:            total,
        percent_complete:        Math.round(percent * 10) / 10,
        progress_bar:            buildProgressBar(percent),
        eta_seconds:             eta,
        throughput_chunks_per_sec: Math.round(throughput * 10) / 10,
      },
      backend_used:   run.backend_used ?? undefined,
      enrich_enabled: undefined,
      started_at:     run.started_at ? new Date(run.started_at).toISOString() : '',
      updated_at:     run.updated_at ? new Date(run.updated_at).toISOString() : '',
      warnings,
      error:          run.error ?? undefined,
      schema_version: run.schema_version ?? SCHEMA_VERSION,
    };
  }

  // ── Pipeline ───────────────────────────────────────────────────────────────

  private async _runPipeline(
    runId:       string,
    projectPath: string,
    phases:      string[],
    opts:        StartIndexingInput,
  ): Promise<void> {
    const db        = openDb(projectPath);
    const runsRepo  = new IndexRunsRepo(db);
    const priority  = PRIORITY_MAP[opts.priority ?? 'background'] ?? 1;

    try {
      // ── Phase 1: Discovery ───────────────────────────────────────────────
      if (phases.includes('discovery')) {
        runsRepo.update(runId, { phase: 'discovery', status: 'running', updated_at: Date.now() });

        const files = await scanProject(projectPath, {
          maxFileSizeKb: opts.max_file_size_kb,
          includeGlobs:  opts.include_globs,
          excludeGlobs:  opts.exclude_globs,
        });

        runsRepo.update(runId, { files_discovered: files.length, updated_at: Date.now() });

        const differ  = new FingerprintDiffer(db, projectPath);
        const diffs   = await differ.diff(files, opts.force ?? false);
        const pending = diffs.filter((d) => d.status !== 'up_to_date').length;

        runsRepo.update(runId, { files_parsed: pending, updated_at: Date.now() });

        const dispatcher   = new ChunkerDispatcher(db, projectPath);
        const dispatchStats = await dispatcher.dispatch(runId, priority);

        runsRepo.update(runId, {
          chunks_created: dispatchStats.chunks_created,
          updated_at:     Date.now(),
        });
      }

      // ── Phase 2: Embedding ───────────────────────────────────────────────
      if (phases.includes('embedding')) {
        runsRepo.update(runId, { phase: 'embedding', updated_at: Date.now() });

        const chunksRepo = new ChunksQueueRepo(db);
        const totalPending = chunksRepo.countPending(projectPath);
        runsRepo.update(runId, { chunks_total_pending: totalPending, updated_at: Date.now() });

        const consumer = new EmbedConsumer(db, projectPath);
        this.activeConsumers.set(runId, consumer);

        const consumerStats = await consumer.run(runId, {
          backend:   (opts.backend ?? 'auto') as 'ollama' | 'transformers_js' | 'auto',
          batchSize: opts.batch_size,
          enrich:    opts.enrich ?? true,
        });

        runsRepo.update(runId, {
          backend_used:    consumerStats.backend_used,
          chunks_embedded: consumerStats.chunks_embedded,
          updated_at:      Date.now(),
        });

        this.activeConsumers.delete(runId);

        // ── IVF-PQ rebuild (after writes, never during) ────────────────
        if (!consumerStats.paused && !consumerStats.interrupted) {
          try {
            const backend   = await createEmbeddingBackend({ backend: opts.backend as 'ollama' | 'transformers_js' | 'auto' | undefined });
            const vectorDim = await probeVectorDim(backend);
            const table     = await openChunksTable(projectPath, vectorDim);
            const rebuilder = new IvfRebuild(db, projectPath);
            await rebuilder.maybeRebuild(table, vectorDim);
          } catch {
            // IVF-PQ failure is non-fatal — run still completes
          }
        }

        const embeddingFinalStatus =
          consumerStats.interrupted ? 'interrupted'
          : consumerStats.paused    ? 'paused'
          :                           'completed';
        runsRepo.update(runId, { status: embeddingFinalStatus, updated_at: Date.now() });
      }

      // Phase 1-only run completes here
      if (!phases.includes('embedding')) {
        runsRepo.update(runId, { status: 'completed', updated_at: Date.now() });
      }
    } finally {
      db.close();
      this.lock.release(projectPath);
      this.activeConsumers.delete(runId);
    }
  }
}
