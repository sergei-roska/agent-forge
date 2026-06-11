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
import { probeVectorDim, createEmbeddingBackend, probeBackendCapabilities } from './embedding/EmbeddingBackendFactory.js';
import { IvfRebuild } from './optimization/IvfRebuild.js';
import { ConcurrencyLock } from './ConcurrencyLock.js';
import { getConfig } from '../config.js';
import { SCHEMA_VERSION } from '../constants.js';
import type { StartIndexingInput, StartIndexingOutput } from '../contracts/startIndexing.schema.js';
import type { PauseIndexingOutput } from '../contracts/pauseIndexing.schema.js';
import type { ResumeIndexingOutput } from '../contracts/resumeIndexing.schema.js';
import type { GetIndexingStatusOutput } from '../contracts/getIndexingStatus.schema.js';
import { IndexerError, ErrorCode } from '../errors/codes.js';
import { rootLogger } from '../observability/logger.js';

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

  async pause(runId: string): Promise<PauseIndexingOutput> {
    const consumer    = this.activeConsumers.get(runId);
    const projectPath = this.runProjectIndex.get(runId);

    if (!projectPath) {
      return {
        run_id:                runId,
        status:                'not_found',
        chunks_embedded_so_far: 0,
        chunks_remaining:       0,
        message:               `No run found for run_id: ${runId}`,
      };
    }

    const db       = openDb(projectPath);
    const run      = new IndexRunsRepo(db).getById(runId);
    const embedded = run?.chunks_embedded ?? 0;
    const pending  = new ChunksQueueRepo(db).countPending(projectPath);
    db.close();

    if (!run) {
      return {
        run_id: runId,
        status: 'not_found',
        chunks_embedded_so_far: 0,
        chunks_remaining: pending,
        message: `No run found for run_id: ${runId}`,
      };
    }

    if (run.status === 'paused') {
      return {
        run_id: runId,
        status: 'already_paused',
        chunks_embedded_so_far: embedded,
        chunks_remaining: pending,
        message: 'Run is already paused.',
      };
    }

    if (!consumer) {
      if (run.status === 'running' && run.phase === 'embedding') {
        const pauseDb = openDb(projectPath);
        new IndexRunsRepo(pauseDb).update(runId, { status: 'paused', updated_at: Date.now() });
        pauseDb.close();
      }
      return {
        run_id: runId,
        status: run.status === 'paused' ? 'already_paused' : 'paused',
        chunks_embedded_so_far: embedded,
        chunks_remaining: pending,
        message: 'Run marked paused. Resume with start_indexing or resume_indexing.',
      };
    }

    consumer.requestPause();
    await consumer.waitForPause();

    const db2 = openDb(projectPath);
    const updated = new IndexRunsRepo(db2).getById(runId);
    const embeddedNow = updated?.chunks_embedded ?? embedded;
    const pendingNow  = new ChunksQueueRepo(db2).countPending(projectPath);
    db2.close();

    return {
      run_id:                 runId,
      status:                 'paused',
      chunks_embedded_so_far: embeddedNow,
      chunks_remaining:       pendingNow,
      message:                'Embedding paused after current batch. Resume with start_indexing or resume_indexing.',
    };
  }

  async resume(runId: string, projectPath?: string): Promise<ResumeIndexingOutput> {
    let resolvedProject = projectPath ?? this.runProjectIndex.get(runId) ?? getConfig().defaultProjectPath;

    const db = openDb(resolvedProject);
    let run = new IndexRunsRepo(db).getById(runId);
    db.close();

    if (!run && projectPath == null) {
      throw new IndexerError(
        ErrorCode.RUN_NOT_FOUND,
        `No run found for run_id: ${runId}. Provide project_path to resume after restart.`,
      );
    }

    if (!run) {
      throw new IndexerError(ErrorCode.RUN_NOT_FOUND, `No run found for run_id: ${runId} in ${resolvedProject}`);
    }

    resolvedProject = run.project_path;

    const db2 = openDb(resolvedProject);
    const pending = new ChunksQueueRepo(db2).countPending(resolvedProject);
    db2.close();

    if (run.status !== 'paused') {
      return {
        run_id: runId,
        status: 'not_paused',
        project_path: resolvedProject,
        chunks_remaining: pending,
        message: `Run is "${run.status ?? 'unknown'}", not paused. Use start_indexing to begin a new run.`,
      };
    }

    const startResult = await this.start({
      project_path: resolvedProject,
      phases: ['embedding'],
      force: false,
      max_file_size_kb: 512,
      batch_size: 100,
      enrich: true,
      backend: 'auto',
      priority: 'background',
    });

    if (startResult.status === 'already_running') {
      return {
        run_id: startResult.run_id,
        status: 'already_running',
        project_path: resolvedProject,
        chunks_remaining: pending,
        message: startResult.message,
      };
    }

    return {
      run_id: startResult.run_id,
      status: 'resumed',
      project_path: resolvedProject,
      chunks_remaining: pending,
      message: `Embedding resumed (new run_id: ${startResult.run_id}). ${pending} chunks pending.`,
    };
  }

  async getStatus(runId?: string, projectPath?: string): Promise<GetIndexingStatusOutput> {
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

    let backend_capabilities: GetIndexingStatusOutput['backend_capabilities'];
    if (run.backend_used === 'ollama' || run.backend_used === 'transformers_js') {
      const caps = await probeBackendCapabilities(run.backend_used);
      if (caps) {
        backend_capabilities = {
          name: caps.name,
          model: caps.model,
          gpu_accelerated: caps.gpuAccelerated,
          max_batch_size: caps.maxBatchSize,
          dimensions: caps.dimensions,
          estimated_throughput: caps.estimatedThroughput,
        };
      }
    }

    const phaseDetail =
      run.phase === 'embedding'
        ? `Embedding ${embedded}/${total} chunks (${run.backend_used ?? 'auto'})`
        : run.phase === 'discovery'
          ? `Scanning files ${run.files_parsed ?? 0}/${run.files_discovered ?? 0}`
          : undefined;

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
        phase_detail:            phaseDetail,
      },
      backend_used:   run.backend_used ?? undefined,
      backend_capabilities,
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
    const log       = rootLogger.child({ run_id: runId });

    log.info('pipeline started', { project_path: projectPath, phases });

    try {
      // ── Phase 1: Discovery ───────────────────────────────────────────────
      if (phases.includes('discovery')) {
        const t0 = Date.now();
        runsRepo.update(runId, { phase: 'discovery', status: 'running', updated_at: t0 });
        log.info('phase discovery started', { phase: 'discovery' });

        const files = await scanProject(projectPath, {
          maxFileSizeKb: opts.max_file_size_kb,
          includeGlobs:  opts.include_globs,
          excludeGlobs:  opts.exclude_globs,
        });

        runsRepo.update(runId, { files_discovered: files.length, updated_at: Date.now() });
        log.info('scan complete', { phase: 'discovery', files_discovered: files.length });

        const differ  = new FingerprintDiffer(db, projectPath);
        const diffs   = await differ.diff(files, opts.force ?? false);
        const pending = diffs.filter((d) => d.status !== 'up_to_date').length;
        const upToDate = diffs.length - pending;

        runsRepo.update(runId, { files_parsed: pending, updated_at: Date.now() });
        log.info('fingerprint diff complete', { phase: 'discovery', pending_parse: pending, up_to_date: upToDate });

        const dispatcher    = new ChunkerDispatcher(db, projectPath);
        const dispatchStats = await dispatcher.dispatch(runId, priority);

        runsRepo.update(runId, { chunks_created: dispatchStats.chunks_created, updated_at: Date.now() });
        log.info('chunking complete', {
          phase:          'discovery',
          duration_ms:    Date.now() - t0,
          files_processed: dispatchStats.files_processed,
          files_errored:  dispatchStats.files_errored,
          chunks_created: dispatchStats.chunks_created,
          warning_count:  dispatchStats.warnings.length,
        });
      }

      // ── Phase 2: Embedding ───────────────────────────────────────────────
      if (phases.includes('embedding')) {
        const t0 = Date.now();
        runsRepo.update(runId, { phase: 'embedding', updated_at: t0 });

        const chunksRepo   = new ChunksQueueRepo(db);
        const totalPending = chunksRepo.countPending(projectPath);
        runsRepo.update(runId, { chunks_total_pending: totalPending, updated_at: Date.now() });
        log.info('phase embedding started', { phase: 'embedding', chunks_total_pending: totalPending });

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

        const embeddingDuration = Date.now() - t0;
        log.info('embedding complete', {
          phase:           'embedding',
          duration_ms:     embeddingDuration,
          chunks_embedded: consumerStats.chunks_embedded,
          chunks_errored:  consumerStats.chunks_errored,
          batches:         consumerStats.batches_processed,
          backend_used:    consumerStats.backend_used,
          paused:          consumerStats.paused,
          interrupted:     consumerStats.interrupted,
        });

        this.activeConsumers.delete(runId);

        // ── IVF-PQ rebuild (after writes, never during) ────────────────
        if (!consumerStats.paused && !consumerStats.interrupted) {
          try {
            const backend   = await createEmbeddingBackend({ backend: opts.backend as 'ollama' | 'transformers_js' | 'auto' | undefined });
            const vectorDim = await probeVectorDim(backend);
            const table     = await openChunksTable(projectPath, vectorDim);
            const rebuilder = new IvfRebuild(db, projectPath);
            const rebuildResult = await rebuilder.maybeRebuild(table, vectorDim);
            if (rebuildResult.triggered) {
              log.info('ivf-pq rebuild complete', {
                phase:           'ivf_rebuild',
                duration_ms:     rebuildResult.duration_ms,
                vector_count:    rebuildResult.vector_count,
                num_partitions:  rebuildResult.num_partitions,
                num_sub_vectors: rebuildResult.num_sub_vectors,
              });
            } else {
              log.debug('ivf-pq rebuild skipped', { phase: 'ivf_rebuild', reason: rebuildResult.reason });
            }
          } catch (ivfErr) {
            log.warn('ivf-pq rebuild failed (non-fatal)', {
              phase: 'ivf_rebuild',
              msg:   ivfErr instanceof Error ? ivfErr.message : String(ivfErr),
            });
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
