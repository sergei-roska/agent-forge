import type Database from 'better-sqlite3';
import type * as lancedb from '@lancedb/lancedb';
import { ChunksQueueRepo, type ChunkQueueRow } from '../../storage/repositories/ChunksQueueRepo.js';
import { IndexRunsRepo } from '../../storage/repositories/IndexRunsRepo.js';
import { IndexStatsRepo } from '../../storage/repositories/IndexStatsRepo.js';
import { FingerprintsRepo } from '../../storage/repositories/FingerprintsRepo.js';
import { openChunksTable } from '../../storage/lancedb.js';
import { probeVectorDim, type BackendOption } from './EmbeddingBackendFactory.js';
import { createEmbeddingBackend } from './EmbeddingBackendFactory.js';
import { GraniteEnricher } from '../enrichment/GraniteEnricher.js';
import type { EmbeddingBackend } from './EmbeddingBackend.js';
import { SCHEMA_VERSION } from '../../constants.js';
import { getConfig } from '../../config.js';
import { IndexerError, ErrorCode } from '../../errors/codes.js';
import { withLanceDbRetry, isLockError } from '../../errors/retry.js';
import { assertSchemaVersion } from '../../storage/lancedb.js';
import { rootLogger } from '../../observability/logger.js';

// ── LanceDB record builder ────────────────────────────────────────────────────

interface AstMeta {
  language?: string;
  node_type?: string;
  class_name?: string;
  function_name?: string;
  symbol_path?: string;
}

function buildRecord(
  chunk: ChunkQueueRow,
  vector: number[],
  enrichResult: { summary: string; tags: string[] } | null,
  mtimeNs: bigint,
): Record<string, unknown> {
  let meta: AstMeta = {};
  try { meta = JSON.parse(chunk.ast_metadata ?? '{}') as AstMeta; } catch { /* noop */ }

  const text = chunk.enriched_text ?? chunk.raw_text ?? '';

  return {
    chunk_id:         chunk.chunk_id,
    project_path:     chunk.project_path,
    file_path:        chunk.file_path,
    start_line:       chunk.start_line ?? 0,
    end_line:         chunk.end_line ?? 0,
    text,
    raw_text:         chunk.raw_text ?? '',
    vector:           Float32Array.from(vector),
    language:         meta.language ?? '',
    node_type:        meta.node_type ?? '',
    class_name:       meta.class_name ?? '',
    function_name:    meta.function_name ?? '',
    symbol_path:      meta.symbol_path ?? '',
    content_hash:     chunk.content_hash ?? '',
    mtime_ns:         mtimeNs,
    last_commit_hash: '',
    tags:             enrichResult?.tags ?? [],
    summary:          enrichResult?.summary ?? '',
    schema_version:   SCHEMA_VERSION,
    indexed_at:       BigInt(Date.now()),
  };
}

// ── Consumer options & stats ─────────────────────────────────────────────────

export interface ConsumerOptions {
  backend?: BackendOption;
  batchSize?: number;
  enrich?: boolean;
}

export interface ConsumerStats {
  chunks_embedded: number;
  chunks_errored: number;
  batches_processed: number;
  backend_used: 'ollama' | 'transformers_js';
  paused: boolean;
  interrupted: boolean;
}

// ── EmbedConsumer ─────────────────────────────────────────────────────────────

export class EmbedConsumer {
  private pauseRequested = false;
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;
  private activeBackend: EmbeddingBackend | null = null;

  private readonly chunks:  ChunksQueueRepo;
  private readonly runs:    IndexRunsRepo;
  private readonly stats:   IndexStatsRepo;
  private readonly fps:     FingerprintsRepo;
  private readonly mtimeCache = new Map<string, bigint>();

  constructor(
    private readonly db: Database.Database,
    private readonly projectPath: string,
    /** Inject a pre-built backend (used in tests to avoid Ollama dependency). */
    private readonly _backendOverride?: EmbeddingBackend,
  ) {
    this.chunks = new ChunksQueueRepo(db);
    this.runs   = new IndexRunsRepo(db);
    this.stats  = new IndexStatsRepo(db);
    this.fps    = new FingerprintsRepo(db);
  }

  /** Signal the loop to stop after the current batch completes. */
  requestPause(): void {
    if (this.pauseRequested) return;
    this.pauseRequested = true;
    this.activeBackend?.cancel?.();
    if (!this.pausePromise) {
      this.pausePromise = new Promise<void>((resolve) => {
        this.pauseResolve = resolve;
      });
    }
  }

  /** Resolves once pause takes effect (current batch finished or loop exited). */
  waitForPause(): Promise<void> {
    return this.pausePromise ?? Promise.resolve();
  }

  private resolvePauseWaiters(): void {
    this.pauseResolve?.();
    this.pauseResolve = null;
    this.pausePromise = null;
  }

  async run(runId: string, opts: ConsumerOptions = {}): Promise<ConsumerStats> {
    const cfg = getConfig();
    const log = rootLogger.child({ run_id: runId, phase: 'embedding' });
    const runStart = Date.now();

    const result: ConsumerStats = {
      chunks_embedded: 0,
      chunks_errored:  0,
      batches_processed: 0,
      backend_used: 'ollama',
      paused: false,
      interrupted: false,
    };

    // Resolve backend and probe vector dimension
    let backend: EmbeddingBackend;
    try {
      backend = this._backendOverride ?? await createEmbeddingBackend({ backend: opts.backend });
    } catch (err) {
      this.runs.update(runId, {
        status: 'paused',
        error: err instanceof Error ? err.message : String(err),
        updated_at: Date.now(),
      });
      throw new IndexerError(
        ErrorCode.EMBEDDING_BACKEND_UNAVAILABLE,
        err instanceof Error ? err.message : String(err),
      );
    }
    this.activeBackend = backend;
    result.backend_used = backend.name;

    const vectorDim = await probeVectorDim(backend);
    const batchSize = opts.batchSize ?? backend.batchSize;

    // Open LanceDB table (create with correct dims if new)
    let table: lancedb.Table;
    try {
      table = await withLanceDbRetry(() => openChunksTable(this.projectPath, vectorDim));
    } catch (err) {
      this.runs.update(runId, { status: 'interrupted', error: String(err), updated_at: Date.now() });
      result.interrupted = true;
      return result;
    }

    // Optional enricher
    const enricher =
      opts.enrich !== false
        ? new GraniteEnricher(cfg.enrichModel, cfg.ollamaBaseUrl)
        : null;

    this.runs.update(runId, {
      status: 'running',
      backend_used: backend.name,
      updated_at: Date.now(),
    });

    let currentVectorCount = this.chunks.countEmbedded(this.projectPath);

    // ── Main loop ────────────────────────────────────────────────────────────
    const maxConsecutiveErrors = 3;
    let consecutiveErrors = 0;

    while (true) {
      if (this.pauseRequested) {
        this.runs.update(runId, { status: 'paused', updated_at: Date.now() });
        result.paused = true;
        this.resolvePauseWaiters();
        break;
      }

      const batch = this.chunks.getPendingBatch(this.projectPath, batchSize);
      if (batch.length === 0) break; // all embedded

      log.info('processing batch', {
        batch_size: batch.length,
        batches_processed: result.batches_processed,
        chunks_embedded_so_far: result.chunks_embedded,
        backend: backend.name,
      });

      try {
        const enrichResults = await this.enrichBatch(batch, enricher, cfg.enrichConcurrency);
        const vectors       = await this.embedBatch(batch, enrichResults, backend, { timeoutMs: 60_000 });
        await this.upsertBatch(table, batch, vectors, enrichResults);
        this.markEmbedded(batch, result.chunks_embedded);

        result.chunks_embedded    += batch.length;
        result.batches_processed  += 1;
        consecutiveErrors = 0;

        const elapsedSec = (Date.now() - runStart) / 1000;
        const throughput = elapsedSec > 0 ? Math.round(result.chunks_embedded / elapsedSec * 10) / 10 : 0;
        log.info('batch embedded', {
          batch_size:             batch.length,
          chunks_embedded_total:  result.chunks_embedded,
          batches_processed:      result.batches_processed,
          throughput_chunks_per_sec: throughput,
          backend:                backend.name,
        });

        this.runs.update(runId, {
          chunks_embedded: result.chunks_embedded,
          updated_at: Date.now(),
        });
        currentVectorCount += batch.length;
        this.stats.setVectorCount(this.projectPath, currentVectorCount);

        if (this.pauseRequested) {
          this.runs.update(runId, { status: 'paused', updated_at: Date.now() });
          result.paused = true;
          this.resolvePauseWaiters();
          break;
        }
      } catch (err) {
        const ids = batch.map((c) => c.chunk_id);
        this.chunks.markError(ids);
        result.chunks_errored += batch.length;
        result.batches_processed += 1;
        consecutiveErrors++;

        const errorMsg = err instanceof Error ? err.message : String(err);
        const warnings = JSON.parse(
          (this.runs.getById(runId)?.warnings ?? '[]') as string,
        ) as string[];
        warnings.push(`batch error: ${errorMsg}`);
        this.runs.update(runId, { warnings: JSON.stringify(warnings), updated_at: Date.now() });

        // DATABASE_LOCKED after all retries → interrupt
        if (isLockError(err)) {
          log.error('batch failed: DATABASE_LOCKED, interrupting run', { warning_count: result.chunks_errored });
          this.runs.update(runId, { status: 'interrupted', error: errorMsg, updated_at: Date.now() });
          result.interrupted = true;
          this.resolvePauseWaiters();
          return result;
        }

        if (this.pauseRequested && errorMsg.includes('Embedding cancelled')) {
          this.runs.update(runId, { status: 'paused', updated_at: Date.now() });
          result.paused = true;
          this.resolvePauseWaiters();
          break;
        }

        log.warn('batch failed', { consecutive: consecutiveErrors, max: maxConsecutiveErrors, error: errorMsg });

        // Too many consecutive failures → attempt backend re-selection
        if (consecutiveErrors >= maxConsecutiveErrors) {
          log.warn('max consecutive errors reached, attempting backend re-selection via auto');
          try {
            backend = await createEmbeddingBackend({ backend: 'auto' });
            this.activeBackend = backend;
            result.backend_used = backend.name;
            consecutiveErrors = 0;
            log.info('backend re-selected', { new_backend: backend.name });
          } catch (fallbackErr) {
            const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            log.error('backend re-selection failed, interrupting run', { error: fbMsg });
            this.runs.update(runId, { status: 'interrupted', error: fbMsg, updated_at: Date.now() });
            result.interrupted = true;
            this.resolvePauseWaiters();
            return result;
          }
        }
      }
    }

    if (!result.interrupted && !result.paused) {
      this.runs.update(runId, { status: 'completed', updated_at: Date.now() });
    }

    return result;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async enrichBatch(
    batch: ChunkQueueRow[],
    enricher: GraniteEnricher | null,
    concurrency: number,
  ): Promise<(ReturnType<GraniteEnricher['enrich']> extends Promise<infer T> ? T : never)[]> {
    if (!enricher) return batch.map(() => null);

    const results = new Array(batch.length).fill(null);
    const updates: { chunkId: string; enrichedText: string }[] = [];

    let currentIndex = 0;
    const worker = async () => {
      while (currentIndex < batch.length) {
        const index = currentIndex++;
        const chunk = batch[index]!;
        let meta = {};
        try { meta = JSON.parse(chunk.ast_metadata ?? '{}'); } catch { /* noop */ }
        const r = await enricher.enrich(chunk.raw_text ?? '', meta as never);
        if (r) {
          updates.push({ chunkId: chunk.chunk_id, enrichedText: r.enriched_text });
        }
        results[index] = r;
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, batch.length) },
      () => worker()
    );
    await Promise.all(workers);

    if (updates.length > 0) {
      this.chunks.setEnrichedTextBatch(updates);
    }

    return results as any;
  }

  private async embedBatch(
    batch: ChunkQueueRow[],
    enrichResults: (unknown | null)[],
    backend: EmbeddingBackend,
    opts?: { timeoutMs?: number },
  ): Promise<number[][]> {
    const texts = batch.map((chunk, i) => {
      const enriched = (enrichResults[i] as { enriched_text?: string } | null)?.enriched_text;
      return enriched ?? chunk.raw_text ?? '';
    });
    return backend.embed(texts, opts);
  }

  private async upsertBatch(
    table: lancedb.Table,
    batch: ChunkQueueRow[],
    vectors: number[][],
    enrichResults: (unknown | null)[],
  ): Promise<void> {
    // Schema guard before every write batch (spec §5.2)
    assertSchemaVersion(SCHEMA_VERSION);

    const records = batch.map((chunk, i) => {
      const enriched = enrichResults[i] as { summary: string; tags: string[] } | null;
      const mtimeNs  = this.getMtimeNs(chunk.file_path);
      return buildRecord(chunk, vectors[i]!, enriched, mtimeNs);
    });

    await withLanceDbRetry(async () => {
      await table
        .mergeInsert('chunk_id')
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute(records);
    });
  }

  private markEmbedded(batch: ChunkQueueRow[], _prevEmbedded: number): void {
    this.chunks.markEmbedded(batch.map((c) => c.chunk_id));
  }

  private getMtimeNs(filePath: string): bigint {
    if (this.mtimeCache.has(filePath)) return this.mtimeCache.get(filePath)!;
    const fp = this.fps.getByPath(this.projectPath, filePath);
    const ns = BigInt(fp?.mtime_ns ?? 0);
    this.mtimeCache.set(filePath, ns);
    return ns;
  }
}
