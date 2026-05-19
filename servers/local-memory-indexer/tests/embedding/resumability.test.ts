import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../src/storage/sqlite.js';
import { ChunksQueueRepo } from '../../src/storage/repositories/ChunksQueueRepo.js';
import { IndexRunsRepo } from '../../src/storage/repositories/IndexRunsRepo.js';
import { FingerprintsRepo } from '../../src/storage/repositories/FingerprintsRepo.js';
import { EmbedConsumer } from '../../src/indexer/embedding/EmbedConsumer.js';
import type { EmbeddingBackend } from '../../src/indexer/embedding/EmbeddingBackend.js';
import { SCHEMA_VERSION } from '../../src/constants.js';
import type Database from 'better-sqlite3';

/** Lightweight deterministic mock backend — returns 64-dim unit vectors. */
class MockBackend implements EmbeddingBackend {
  readonly name = 'ollama' as const;
  readonly batchSize: number;
  embedCount = 0;
  /** If set, throws on the Nth embed() call. */
  throwOnCall?: number;

  constructor(batchSize = 2) { this.batchSize = batchSize; }

  async embed(texts: string[]): Promise<number[][]> {
    this.embedCount++;
    if (this.throwOnCall !== undefined && this.embedCount === this.throwOnCall) {
      throw new Error('simulated embed failure');
    }
    return texts.map((t, i) => Array.from({ length: 64 }, (_, j) => (i + j + this.embedCount) * 0.001));
  }

  async healthCheck(): Promise<boolean> { return true; }
}

function seedChunks(repo: ChunksQueueRepo, projectPath: string, count: number): string[] {
  const now = Date.now();
  const ids: string[] = [];
  const rows = Array.from({ length: count }, (_, i) => {
    const id = `chunk-${i + 1}`;
    ids.push(id);
    return {
      chunk_id:         id,
      project_path:     projectPath,
      file_path:        `${projectPath}/src.ts`,
      start_line:       i * 5 + 1,
      end_line:         i * 5 + 5,
      raw_text:         `export function fn${i}() { return ${i}; }`,
      content_hash:     `hash-${i}`,
      embedding_status: 'pending' as const,
      priority:         1,
      created_at:       now + i,
      updated_at:       now + i,
      schema_version:   SCHEMA_VERSION,
    };
  });
  repo.insertBatch(rows);
  return ids;
}

describe('EmbedConsumer — resumability', () => {
  let projectDir: string;
  let db: Database.Database;
  let chunksRepo: ChunksQueueRepo;
  let runsRepo: IndexRunsRepo;
  let fpsRepo: FingerprintsRepo;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmi-resume-'));
    db = openDb(projectDir);
    chunksRepo = new ChunksQueueRepo(db);
    runsRepo   = new IndexRunsRepo(db);
    fpsRepo    = new FingerprintsRepo(db);
    fpsRepo.upsert({ project_path: projectDir, file_path: `${projectDir}/src.ts`, status: 'parsed', schema_version: SCHEMA_VERSION });
  });

  afterEach(() => {
    try { db.close(); } catch { /* may already be closed */ }
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('all chunks embedded on a clean run', async () => {
    seedChunks(chunksRepo, projectDir, 4);
    runsRepo.create({ run_id: 'run-1', project_path: projectDir, status: 'running', started_at: Date.now() });

    const backend = new MockBackend(2);
    const consumer = new EmbedConsumer(db, projectDir, backend);
    const stats = await consumer.run('run-1', { enrich: false });

    expect(stats.chunks_embedded).toBe(4);
    expect(stats.chunks_errored).toBe(0);
    expect(chunksRepo.countPending(projectDir)).toBe(0);
    expect(chunksRepo.countEmbedded(projectDir)).toBe(4);
  });

  it('restart after partial completion embeds only remaining chunks', async () => {
    // Seed 6 chunks. MockBackend with batchSize=2 processes 3 batches.
    // throwOnCall=2 → batch 2 (chunks 3-4) fails → those 2 are marked 'error'.
    // Batches 1 and 3 succeed → 4 embedded total.
    // Restart: reset the 2 errored chunks to pending → 2 more embedded.
    seedChunks(chunksRepo, projectDir, 6);
    runsRepo.create({ run_id: 'run-2', project_path: projectDir, status: 'running', started_at: Date.now() });

    const backend1 = new MockBackend(2);
    backend1.throwOnCall = 2; // fail on 2nd embed() call (batch 2 of 3)
    const consumer1 = new EmbedConsumer(db, projectDir, backend1);
    const stats1 = await consumer1.run('run-2', { enrich: false });

    // Batches 1 and 3 succeeded; batch 2 errored
    expect(stats1.chunks_embedded).toBe(4);
    expect(stats1.chunks_errored).toBe(2);
    expect(chunksRepo.countEmbedded(projectDir)).toBe(4);

    // Simulate restart: reset errored chunks to pending (mimics process kill + resume)
    db.prepare(`UPDATE chunks_queue SET embedding_status='pending', retry_count=0 WHERE embedding_status='error'`).run();
    expect(chunksRepo.countPending(projectDir)).toBe(2);

    // Second run: only the 2 previously errored chunks are pending
    runsRepo.create({ run_id: 'run-3', project_path: projectDir, status: 'running', started_at: Date.now() });
    const consumer2 = new EmbedConsumer(db, projectDir, new MockBackend(2));
    const stats2 = await consumer2.run('run-3', { enrich: false });

    expect(stats2.chunks_embedded).toBe(2);
    expect(stats2.chunks_errored).toBe(0);
    expect(chunksRepo.countPending(projectDir)).toBe(0);
    expect(chunksRepo.countEmbedded(projectDir)).toBe(6); // all 6 total
  });

  it('re-run on fully embedded project embeds 0 chunks', async () => {
    seedChunks(chunksRepo, projectDir, 3);
    runsRepo.create({ run_id: 'run-4', project_path: projectDir, status: 'running', started_at: Date.now() });

    const backend = new MockBackend(10);
    const consumer1 = new EmbedConsumer(db, projectDir, backend);
    await consumer1.run('run-4', { enrich: false });

    // Re-run
    runsRepo.create({ run_id: 'run-5', project_path: projectDir, status: 'running', started_at: Date.now() });
    const consumer2 = new EmbedConsumer(db, projectDir, new MockBackend(10));
    const stats = await consumer2.run('run-5', { enrich: false });

    expect(stats.chunks_embedded).toBe(0);
  });

  it('LanceDB upsert by chunk_id prevents duplicates on re-embed', async () => {
    const ids = seedChunks(chunksRepo, projectDir, 2);
    runsRepo.create({ run_id: 'run-6', project_path: projectDir, status: 'running', started_at: Date.now() });

    // First full run
    const b1 = new MockBackend(10);
    const c1 = new EmbedConsumer(db, projectDir, b1);
    await c1.run('run-6', { enrich: false });

    // Force chunks back to pending to simulate re-embed scenario
    db.prepare(`UPDATE chunks_queue SET embedding_status='pending'`).run();

    runsRepo.create({ run_id: 'run-7', project_path: projectDir, status: 'running', started_at: Date.now() });
    const b2 = new MockBackend(10);
    const c2 = new EmbedConsumer(db, projectDir, b2);
    await c2.run('run-7', { enrich: false });

    // LanceDB should still have exactly 2 records (upsert idempotency)
    const { openChunksTable } = await import('../../src/storage/lancedb.js');
    const table = await openChunksTable(projectDir, 64);
    const safePath = projectDir.replace(/'/g, "''");
    const rows = await table.query().where(`project_path = '${safePath}'`).toArray();
    expect(rows.length).toBe(2);
  });

  it('pause mid-run stops after current batch', async () => {
    seedChunks(chunksRepo, projectDir, 10);
    runsRepo.create({ run_id: 'run-8', project_path: projectDir, status: 'running', started_at: Date.now() });

    const backend = new MockBackend(2);
    const consumer = new EmbedConsumer(db, projectDir, backend);

    // Request pause immediately — consumer will complete current batch then stop
    consumer.requestPause();
    const stats = await consumer.run('run-8', { enrich: false });

    expect(stats.paused).toBe(true);
    // At most one batch (batchSize=2) was processed before the pause check
    expect(stats.chunks_embedded).toBeLessThanOrEqual(2);
    expect(runsRepo.getById('run-8')?.status).toBe('paused');
  });
});
