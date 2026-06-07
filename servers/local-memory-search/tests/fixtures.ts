import * as lancedb from '@lancedb/lancedb';
import { Index } from '@lancedb/lancedb';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const VECTOR_DIM = 8;

export interface SeedChunk {
  chunk_id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  text: string;
  vector: number[];
  language?: string;
  function_name?: string | null;
  class_name?: string | null;
  mtime_ns?: number;
}

/** Build a LanceDB `chunks` table + FTS index for a project under dataRoot. */
export async function seedLanceDb(
  dataRoot: string,
  projectPath: string,
  chunks: SeedChunk[],
  withFts = true,
): Promise<void> {
  const dir = path.join(dataRoot, slugify(projectPath), 'lancedb');
  fs.mkdirSync(dir, { recursive: true });
  const conn = await lancedb.connect(dir);

  const now = Date.now();
  const records = chunks.map((c) => ({
    chunk_id: c.chunk_id,
    project_path: projectPath,
    file_path: c.file_path,
    start_line: c.start_line,
    end_line: c.end_line,
    text: c.text,
    raw_text: c.text,
    vector: c.vector,
    language: c.language ?? 'typescript',
    node_type: 'function_declaration',
    class_name: c.class_name ?? '',
    function_name: c.function_name ?? '',
    symbol_path: '',
    content_hash: c.chunk_id,
    mtime_ns: c.mtime_ns ?? now * 1_000_000,
    last_commit_hash: '',
    tags: ['t'],
    summary: '',
    schema_version: '1.0',
    indexed_at: now,
  }));

  const table = await conn.createTable('chunks', records, { mode: 'overwrite' });
  if (withFts) {
    await table.createIndex('text', { config: Index.fts() });
  }
}

/** Build a state.db with chunks_queue + file_fingerprints + index_stats. */
export function seedSqlite(
  dataRoot: string,
  projectPath: string,
  chunks: SeedChunk[],
  vectorCount?: number,
): void {
  const projDir = path.join(dataRoot, slugify(projectPath));
  fs.mkdirSync(projDir, { recursive: true });
  const db = new Database(path.join(projDir, 'state.db'));
  db.exec(`
    CREATE TABLE chunks_queue (
      chunk_id TEXT PRIMARY KEY, project_path TEXT, file_path TEXT,
      start_line INTEGER, end_line INTEGER, raw_text TEXT, enriched_text TEXT,
      content_hash TEXT, ast_metadata TEXT, embedding_status TEXT, priority INTEGER,
      retry_count INTEGER, created_at INTEGER, updated_at INTEGER, schema_version TEXT NOT NULL);
    CREATE TABLE file_fingerprints (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_path TEXT, file_path TEXT,
      size_bytes INTEGER, mtime_ns INTEGER, content_hash_sha256 TEXT, status TEXT,
      retry_count INTEGER, last_indexed_at INTEGER, schema_version TEXT, UNIQUE(project_path, file_path));
    CREATE TABLE index_stats (
      project_path TEXT PRIMARY KEY, vector_count INTEGER, last_ivf_rebuild_at INTEGER, updated_at INTEGER);
  `);

  const now = Date.now();
  const insertChunk = db.prepare(
    `INSERT INTO chunks_queue (chunk_id, project_path, file_path, start_line, end_line, raw_text,
      enriched_text, content_hash, ast_metadata, embedding_status, priority, retry_count, created_at, updated_at, schema_version)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'embedded', 1, 0, ?, ?, '1.0')`,
  );
  const files = new Set<string>();
  for (const c of chunks) {
    insertChunk.run(
      c.chunk_id, projectPath, c.file_path, c.start_line, c.end_line, c.text,
      c.chunk_id, JSON.stringify({ language: c.language ?? 'typescript', function_name: c.function_name ?? null }),
      now, now,
    );
    files.add(c.file_path);
  }
  const insertFp = db.prepare(
    `INSERT INTO file_fingerprints (project_path, file_path, size_bytes, mtime_ns, content_hash_sha256, status, retry_count, last_indexed_at, schema_version)
     VALUES (?, ?, 100, ?, 'h', 'indexed', 0, ?, '1.0')`,
  );
  for (const f of files) insertFp.run(projectPath, f, now * 1_000_000, now);

  db.prepare(`INSERT INTO index_stats (project_path, vector_count, last_ivf_rebuild_at, updated_at) VALUES (?, ?, 0, ?)`)
    .run(projectPath, vectorCount ?? chunks.length, now);
  db.close();
}

// Must match src/storage/paths.ts slugify byte-for-byte.
export function slugify(projectPath: string): string {
  return projectPath
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 128);
}
