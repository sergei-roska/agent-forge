import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../src/storage/sqlite.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lmi-test-'));
}

describe('SQLite migrations', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function freshDb(projectPath: string): Database.Database {
    dirs.push(projectPath);
    return openDb(projectPath);
  }

  it('creates all four tables on a fresh database', () => {
    const db = freshDb(tmpDir());
    const tables = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations' ORDER BY name`,
    ).all() as { name: string }[]).map((r) => r.name);

    expect(tables).toContain('index_runs');
    expect(tables).toContain('file_fingerprints');
    expect(tables).toContain('chunks_queue');
    expect(tables).toContain('index_stats');
    db.close();
  });

  it('creates idx_chunks_queue_pending index', () => {
    const db = freshDb(tmpDir());
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_chunks_queue_pending'`)
      .get() as { name: string } | undefined;

    expect(idx?.name).toBe('idx_chunks_queue_pending');
    db.close();
  });

  it('chunks_queue has all required columns', () => {
    const db = freshDb(tmpDir());
    const cols = (db.prepare(`PRAGMA table_info(chunks_queue)`).all() as { name: string }[]).map((r) => r.name);

    expect(cols).toContain('chunk_id');
    expect(cols).toContain('project_path');
    expect(cols).toContain('file_path');
    expect(cols).toContain('start_line');
    expect(cols).toContain('end_line');
    expect(cols).toContain('raw_text');
    expect(cols).toContain('enriched_text');
    expect(cols).toContain('content_hash');
    expect(cols).toContain('ast_metadata');
    expect(cols).toContain('embedding_status');
    expect(cols).toContain('priority');
    expect(cols).toContain('retry_count');
    expect(cols).toContain('schema_version');
    db.close();
  });

  it('file_fingerprints enforces UNIQUE(project_path, file_path)', () => {
    const db = freshDb(tmpDir());
    db.prepare(`INSERT INTO file_fingerprints (project_path, file_path, status) VALUES (?, ?, ?)`).run('/p', '/f', 'pending_parse');

    expect(() =>
      db.prepare(`INSERT INTO file_fingerprints (project_path, file_path, status) VALUES (?, ?, ?)`).run('/p', '/f', 'parsed'),
    ).toThrow();
    db.close();
  });

  it('migrations are idempotent — openDb twice does not throw', () => {
    const dir = tmpDir();
    dirs.push(dir);
    const db1 = openDb(dir);
    db1.close();
    const db2 = openDb(dir);
    db2.close();
    // no assertion needed — would throw on duplicate migration
  });

  it('WAL journal mode is set', () => {
    const db = freshDb(tmpDir());
    const mode = (db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode;
    expect(mode).toBe('wal');
    db.close();
  });
});
