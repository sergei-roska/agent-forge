import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../src/storage/sqlite.js';
import { ChunksQueueRepo } from '../../src/storage/repositories/ChunksQueueRepo.js';
import { SCHEMA_VERSION } from '../../src/constants.js';
import type Database from 'better-sqlite3';

function chunk(id: string, project: string, priority: number, createdAt: number) {
  return {
    chunk_id:         id,
    project_path:     project,
    file_path:        `${project}/file.ts`,
    raw_text:         `content of chunk ${id}`,
    content_hash:     `hash-${id}`,
    embedding_status: 'pending' as const,
    priority,
    created_at:       createdAt,
    updated_at:       createdAt,
    schema_version:   SCHEMA_VERSION,
  };
}

describe('ChunksQueueRepo — priority ordering', () => {
  let projectDir: string;
  let db: Database.Database;
  let repo: ChunksQueueRepo;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmi-pri-'));
    db = openDb(projectDir);
    repo = new ChunksQueueRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('user_focus (3) comes before recent (2) before background (1)', () => {
    const now = Date.now();
    repo.insertBatch([
      chunk('bg-1',    projectDir, 1, now),
      chunk('recent-1', projectDir, 2, now + 1),
      chunk('focus-1', projectDir, 3, now + 2),
    ]);

    const batch = repo.getPendingBatch(projectDir, 10);
    expect(batch[0]!.chunk_id).toBe('focus-1');
    expect(batch[1]!.chunk_id).toBe('recent-1');
    expect(batch[2]!.chunk_id).toBe('bg-1');
  });

  it('within same priority, earlier created_at comes first (FIFO)', () => {
    const t = Date.now();
    repo.insertBatch([
      chunk('c-3', projectDir, 2, t + 200),
      chunk('c-1', projectDir, 2, t),
      chunk('c-2', projectDir, 2, t + 100),
    ]);

    const batch = repo.getPendingBatch(projectDir, 10);
    const ids = batch.map((b) => b.chunk_id);
    expect(ids).toEqual(['c-1', 'c-2', 'c-3']);
  });

  it('mixed priorities: user_focus first regardless of creation order', () => {
    const t = Date.now();
    repo.insertBatch([
      chunk('old-focus', projectDir, 3, t - 1000),
      chunk('new-bg',    projectDir, 1, t + 1000),
      chunk('new-focus', projectDir, 3, t + 1000),
    ]);

    const batch = repo.getPendingBatch(projectDir, 10);
    // Both priority-3 items first
    expect(batch[0]!.priority).toBe(3);
    expect(batch[1]!.priority).toBe(3);
    // Within priority 3, older first
    expect(batch[0]!.chunk_id).toBe('old-focus');
    // Then background
    expect(batch[2]!.priority).toBe(1);
  });

  it('getPendingBatch respects LIMIT', () => {
    const t = Date.now();
    repo.insertBatch([
      chunk('x1', projectDir, 1, t),
      chunk('x2', projectDir, 1, t + 1),
      chunk('x3', projectDir, 1, t + 2),
    ]);

    expect(repo.getPendingBatch(projectDir, 2)).toHaveLength(2);
  });

  it('already-embedded chunks are excluded from pending batch', () => {
    const t = Date.now();
    repo.insertBatch([
      chunk('done', projectDir, 1, t),
      chunk('todo', projectDir, 1, t + 1),
    ]);
    repo.markEmbedded(['done']);

    const batch = repo.getPendingBatch(projectDir, 10);
    expect(batch.map((b) => b.chunk_id)).toEqual(['todo']);
  });

  it('stale chunks are excluded from pending batch', () => {
    const t = Date.now();
    repo.insertBatch([chunk('stale', projectDir, 1, t)]);
    repo.markStaleByFile(projectDir, `${projectDir}/file.ts`);

    const batch = repo.getPendingBatch(projectDir, 10);
    expect(batch).toHaveLength(0);
  });
});
