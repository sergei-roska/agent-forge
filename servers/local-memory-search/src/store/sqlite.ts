import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ChunkRecord, FileFingerprint } from '../types.js';
import { nowIso } from '../utils.js';

export interface IndexRunRecord {
  runId: string;
  projectPath: string;
  phase: 'discovery' | 'embedding' | 'ivf_rebuild' | 'completed';
  status: 'running' | 'paused' | 'completed' | 'interrupted' | 'error';
  startedAt: string;
  updatedAt: string;
  filesDiscovered?: number;
  filesParsed?: number;
  chunksCreated?: number;
  chunksUpdated?: number;
  chunksEmbedded?: number;
  chunksTotalPending?: number;
  warningsJson?: string | null;
  error?: string | null;
  backendUsed?: string | null;
  schemaVersion: string;
}

export interface MatchAuditRecord {
  resultId: string;
  chunkId: string;
  query: string;
  semanticScore: number;
  keywordScore: number;
  hybridScore: number;
  lexicalHits: string[];
  semanticTerms: string[];
}

export class ProjectStateStore {
  readonly dbPath: string;
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.createSchema();
  }

  close(): void {
    this.db.close();
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS index_runs (
        run_id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        phase TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        files_discovered INTEGER DEFAULT 0,
        files_parsed INTEGER DEFAULT 0,
        chunks_created INTEGER DEFAULT 0,
        chunks_updated INTEGER DEFAULT 0,
        chunks_embedded INTEGER DEFAULT 0,
        chunks_total_pending INTEGER DEFAULT 0,
        warnings TEXT, -- JSON array
        error TEXT,
        backend_used TEXT,
        schema_version TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS file_fingerprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        file_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        mtime_ns INTEGER NOT NULL,
        content_hash_sha256 TEXT NOT NULL,
        status TEXT NOT NULL, -- 'up_to_date', 'pending_parse', 'parsed', 'parse_error'
        retry_count INTEGER DEFAULT 0,
        last_indexed_at INTEGER NOT NULL,
        schema_version TEXT NOT NULL,
        UNIQUE(project_path, file_path)
      );

      CREATE TABLE IF NOT EXISTS chunks_queue (
        chunk_id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        raw_text TEXT NOT NULL,
        enriched_text TEXT,
        content_hash TEXT NOT NULL,
        ast_metadata TEXT, -- JSON: { language, node_type, class_name, function_name, symbol_path }
        embedding_status TEXT NOT NULL, -- 'pending', 'embedded', 'stale', 'error'
        priority INTEGER DEFAULT 1, -- 1=background, 2=recent, 3=user_focus
        retry_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        schema_version TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_queue_pending ON chunks_queue(project_path, embedding_status, priority DESC, created_at ASC);

      CREATE TABLE IF NOT EXISTS index_stats (
        project_path TEXT PRIMARY KEY,
        vector_count INTEGER DEFAULT 0,
        last_ivf_rebuild_at INTEGER DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS locks (
        name TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS match_audit (
        result_id TEXT PRIMARY KEY,
        chunk_id TEXT NOT NULL,
        query TEXT NOT NULL,
        semantic_score REAL NOT NULL,
        keyword_score REAL NOT NULL,
        hybrid_score REAL NOT NULL,
        lexical_hits_json TEXT NOT NULL,
        semantic_terms_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  // --- Run Management ---

  startRun(record: IndexRunRecord): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO index_runs (
        run_id, project_path, phase, status, started_at, updated_at, 
        schema_version, files_discovered, files_parsed, chunks_created, 
        chunks_updated, chunks_embedded, chunks_total_pending
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.runId,
      record.projectPath,
      record.phase,
      record.status,
      now,
      now,
      record.schemaVersion,
      record.filesDiscovered ?? 0,
      record.filesParsed ?? 0,
      record.chunksCreated ?? 0,
      record.chunksUpdated ?? 0,
      record.chunksEmbedded ?? 0,
      record.chunksTotalPending ?? 0
    );
  }

  updateRun(runId: string, updates: Partial<IndexRunRecord>): void {
    const now = Date.now();
    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.status) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.phase) { fields.push('phase = ?'); values.push(updates.phase); }
    if (updates.filesDiscovered !== undefined) { fields.push('files_discovered = ?'); values.push(updates.filesDiscovered); }
    if (updates.filesParsed !== undefined) { fields.push('files_parsed = ?'); values.push(updates.filesParsed); }
    if (updates.chunksCreated !== undefined) { fields.push('chunks_created = ?'); values.push(updates.chunksCreated); }
    if (updates.chunksUpdated !== undefined) { fields.push('chunks_updated = ?'); values.push(updates.chunksUpdated); }
    if (updates.chunksEmbedded !== undefined) { fields.push('chunks_embedded = ?'); values.push(updates.chunksEmbedded); }
    if (updates.chunksTotalPending !== undefined) { fields.push('chunks_total_pending = ?'); values.push(updates.chunksTotalPending); }
    if (updates.error !== undefined) { fields.push('error = ?'); values.push(updates.error); }
    if (updates.warningsJson !== undefined) { fields.push('warnings = ?'); values.push(updates.warningsJson); }
    if (updates.backendUsed !== undefined) { fields.push('backend_used = ?'); values.push(updates.backendUsed); }

    values.push(runId);
    this.db.prepare(`UPDATE index_runs SET ${fields.join(', ')} WHERE run_id = ?`).run(...values);
  }

  getRun(runId: string): IndexRunRecord | null {
    const row = this.db.prepare(`SELECT * FROM index_runs WHERE run_id = ?`).get(runId) as any;
    if (!row) return null;
    return {
      runId: row.run_id,
      projectPath: row.project_path,
      phase: row.phase,
      status: row.status,
      startedAt: new Date(row.started_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      filesDiscovered: row.files_discovered,
      filesParsed: row.files_parsed,
      chunksCreated: row.chunks_created,
      chunksUpdated: row.chunks_updated,
      chunksEmbedded: row.chunks_embedded,
      chunksTotalPending: row.chunks_total_pending,
      warningsJson: row.warnings,
      error: row.error,
      backendUsed: row.backend_used,
      schemaVersion: row.schema_version
    };
  }

  // --- Fingerprints ---

  upsertFingerprint(f: { projectPath: string; filePath: string; sizeBytes: number; mtimeNs: number; contentHash: string; status: string; schemaVersion: string }): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO file_fingerprints (project_path, file_path, size_bytes, mtime_ns, content_hash_sha256, status, last_indexed_at, schema_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_path, file_path) DO UPDATE SET
        size_bytes = excluded.size_bytes,
        mtime_ns = excluded.mtime_ns,
        content_hash_sha256 = excluded.content_hash_sha256,
        status = excluded.status,
        last_indexed_at = excluded.last_indexed_at,
        schema_version = excluded.schema_version,
        retry_count = 0
    `).run(f.projectPath, f.filePath, f.sizeBytes, f.mtimeNs, f.contentHash, f.status, now, f.schemaVersion);
  }

  getFingerprint(projectPath: string, filePath: string): any {
    return this.db.prepare(`SELECT * FROM file_fingerprints WHERE project_path = ? AND file_path = ?`).get(projectPath, filePath);
  }

  listFingerprints(projectPath: string): any[] {
    return this.db.prepare(`SELECT * FROM file_fingerprints WHERE project_path = ?`).all(projectPath);
  }

  // --- Queue Management ---

  upsertQueueChunk(c: { 
    chunkId: string; projectPath: string; filePath: string; startLine: number; endLine: number; 
    rawText: string; contentHash: string; astMetadata: any; status: string; priority: number; schemaVersion: string 
  }): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO chunks_queue (
        chunk_id, project_path, file_path, start_line, end_line, raw_text, content_hash, 
        ast_metadata, embedding_status, priority, created_at, updated_at, schema_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chunk_id) DO UPDATE SET
        embedding_status = excluded.embedding_status,
        priority = excluded.priority,
        updated_at = excluded.updated_at,
        schema_version = excluded.schema_version
    `).run(
      c.chunkId, c.projectPath, c.filePath, c.startLine, c.endLine, c.rawText, c.contentHash,
      JSON.stringify(c.astMetadata), c.status, c.priority, now, now, c.schemaVersion
    );
  }

  getPendingChunks(projectPath: string, limit: number): any[] {
    return this.db.prepare(`
      SELECT * FROM chunks_queue 
      WHERE project_path = ? AND embedding_status = 'pending' 
      ORDER BY priority DESC, created_at ASC 
      LIMIT ?
    `).all(projectPath, limit);
  }

  markChunksEmbedded(chunkIds: string[]): void {
    const now = Date.now();
    const stmt = this.db.prepare(`UPDATE chunks_queue SET embedding_status = 'embedded', updated_at = ? WHERE chunk_id = ?`);
    for (const id of chunkIds) {
      stmt.run(now, id);
    }
  }

  markChunksStale(projectPath: string, filePath: string): void {
    const now = Date.now();
    this.db.prepare(`
      UPDATE chunks_queue 
      SET embedding_status = 'stale', updated_at = ? 
      WHERE project_path = ? AND file_path = ? AND embedding_status != 'stale'
    `).run(now, projectPath, filePath);
  }

  // --- Stats ---

  getStats(projectPath: string): any {
    return this.db.prepare(`SELECT * FROM index_stats WHERE project_path = ?`).get(projectPath);
  }

  updateStats(projectPath: string, vectorCount: number, rebuildAt?: number): void {
    const now = Date.now();
    if (rebuildAt !== undefined) {
      this.db.prepare(`
        INSERT INTO index_stats (project_path, vector_count, last_ivf_rebuild_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(project_path) DO UPDATE SET
          vector_count = excluded.vector_count,
          last_ivf_rebuild_at = excluded.last_ivf_rebuild_at,
          updated_at = excluded.updated_at
      `).run(projectPath, vectorCount, rebuildAt, now);
    } else {
      this.db.prepare(`
        INSERT INTO index_stats (project_path, vector_count, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(project_path) DO UPDATE SET
          vector_count = excluded.vector_count,
          updated_at = excluded.updated_at
      `).run(projectPath, vectorCount, now);
    }
  }

  // --- Locks ---

  tryAcquireLock(name: string, owner: string, ttlMs: number): { acquired: boolean; lockOwner: string | null; lockAgeMs: number | null } {
    const now = Date.now();
    const existing = this.db.prepare('SELECT owner, acquired_at, expires_at FROM locks WHERE name = ?').get(name) as
      | { owner: string; acquired_at: string; expires_at: string }
      | undefined;

    if (existing) {
      const expiresAt = new Date(existing.expires_at).getTime();
      if (expiresAt > now && existing.owner !== owner) {
        return {
          acquired: false,
          lockOwner: existing.owner,
          lockAgeMs: now - new Date(existing.acquired_at).getTime(),
        };
      }
    }

    const acquiredAt = new Date(now).toISOString();
    const expiresAt = new Date(now + ttlMs).toISOString();
    this.db.prepare(`
      INSERT INTO locks (name, owner, acquired_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        owner = excluded.owner,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
    `).run(name, owner, acquiredAt, expiresAt);

    return { acquired: true, lockOwner: owner, lockAgeMs: 0 };
  }

  releaseLock(name: string, owner: string): void {
    this.db.prepare('DELETE FROM locks WHERE name = ? AND owner = ?').run(name, owner);
  }

  refreshLock(name: string, owner: string, ttlMs: number): boolean {
    const now = Date.now();
    const expiresAt = new Date(now + ttlMs).toISOString();
    const result = this.db.prepare(`UPDATE locks SET expires_at = ? WHERE name = ? AND owner = ?`).run(expiresAt, name, owner);
    return result.changes > 0;
  }

  // --- Meta & Cleanup ---

  setProjectMeta(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO project_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  getProjectMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM project_meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  reset(projectPath: string): { filesRemoved: number; chunksRemoved: number } {
    const files = this.db.prepare('SELECT COUNT(*) as count FROM file_fingerprints WHERE project_path = ?').get(projectPath) as any;
    const chunks = this.db.prepare('SELECT COUNT(*) as count FROM chunks_queue WHERE project_path = ?').get(projectPath) as any;
    
    this.db.prepare('DELETE FROM file_fingerprints WHERE project_path = ?').run(projectPath);
    this.db.prepare('DELETE FROM chunks_queue WHERE project_path = ?').run(projectPath);
    this.db.prepare('DELETE FROM index_stats WHERE project_path = ?').run(projectPath);
    this.db.prepare('DELETE FROM index_runs WHERE project_path = ?').run(projectPath);
    
    return { filesRemoved: files.count, chunksRemoved: chunks.count };
  }
}

export function createProjectDbPath(projectDataDir: string): string {
  return join(projectDataDir, 'state.sqlite');
}
