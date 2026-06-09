import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../src/storage/sqlite.js';
import { ChunksQueueRepo } from '../../src/storage/repositories/ChunksQueueRepo.js';
import { IndexerDoctor } from '../../src/health/doctor.js';
import { SCHEMA_VERSION } from '../../src/constants.js';
import type Database from 'better-sqlite3';

describe('IndexerDoctor', () => {
  let projectDir: string;
  let db: Database.Database;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmi-doctor-'));
    db = openDb(projectDir);
  });

  afterEach(() => {
    try { db.close(); } catch { /* noop */ }
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('auto-fixes bad schema_version in SQLite', async () => {
    const chunks = new ChunksQueueRepo(db);
    const now = Date.now();
    chunks.insertBatch([{
      chunk_id: 'c1',
      project_path: projectDir,
      file_path: `${projectDir}/a.ts`,
      raw_text: 'code',
      embedding_status: 'embedded',
      priority: 1,
      created_at: now,
      updated_at: now,
      schema_version: 'unknown',
    }]);

    const doctor = new IndexerDoctor(db);
    const result = await doctor.run(projectDir, true);

    expect(result.auto_fixed.some((f) => f.name === 'sqlite_schema_version')).toBe(true);

    const row = db.prepare('SELECT schema_version, embedding_status FROM chunks_queue WHERE chunk_id = ?').get('c1') as {
      schema_version: string;
      embedding_status: string;
    };
    expect(row.schema_version).toBe(SCHEMA_VERSION);
    expect(row.embedding_status).toBe('pending');
  });

  it('reports queue health with errored chunks', async () => {
    const chunks = new ChunksQueueRepo(db);
    const now = Date.now();
    chunks.insertBatch([{
      chunk_id: 'c2',
      project_path: projectDir,
      file_path: `${projectDir}/b.ts`,
      raw_text: 'x',
      embedding_status: 'error',
      priority: 1,
      created_at: now,
      updated_at: now,
      schema_version: SCHEMA_VERSION,
    }]);

    const doctor = new IndexerDoctor(db);
    const before = await doctor.run(projectDir, false);
    expect(before.issues.some((i) => i.name === 'pending_queue')).toBe(true);

    const after = await doctor.run(projectDir, true);
    expect(after.auto_fixed.some((f) => f.name === 'pending_queue')).toBe(true);
    expect(chunks.countPending(projectDir)).toBe(1);
  });
});
