import Database from 'better-sqlite3';
import fs from 'node:fs';
import { sqliteDbPath } from './paths.js';
import { SCHEMA_VERSION } from '../constants.js';
import type { ChunkRow } from '../search/types.js';
import { ReadOnlyViolationError } from '../errors/codes.js';

interface QueueRow {
  chunk_id: string;
  project_path: string;
  file_path: string;
  start_line: number | null;
  end_line: number | null;
  raw_text: string | null;
  enriched_text: string | null;
  content_hash: string | null;
  ast_metadata: string | null;
  embedding_status: string | null;
  mtime_ns?: number | null;
  created_at: number | null;
  schema_version: string;
}

interface AstMeta {
  language?: string;
  node_type?: string;
  class_name?: string;
  function_name?: string;
  symbol_path?: string;
}

function parseAst(json: string | null): AstMeta {
  if (!json) return {};
  try {
    return JSON.parse(json) as AstMeta;
  } catch {
    return {};
  }
}

function queueRowToChunk(r: QueueRow): ChunkRow {
  const ast = parseAst(r.ast_metadata);
  return {
    chunk_id:         r.chunk_id,
    project_path:     r.project_path,
    file_path:        r.file_path,
    start_line:       r.start_line,
    end_line:         r.end_line,
    text:             r.enriched_text ?? r.raw_text,
    raw_text:         r.raw_text,
    language:         ast.language ?? null,
    node_type:        ast.node_type ?? null,
    class_name:       ast.class_name ?? null,
    function_name:    ast.function_name ?? null,
    symbol_path:      ast.symbol_path ?? null,
    content_hash:     r.content_hash,
    mtime_ns:         r.mtime_ns ?? null,
    last_commit_hash: null,
    tags:             null,
    summary:          null,
    schema_version:   r.schema_version,
    indexed_at:       r.created_at,
  };
}

export interface SqliteHit {
  row: ChunkRow;
  /** Number of distinct query terms found in raw_text (LIKE fallback score). */
  rawScore: number;
}

export interface IndexStatsSnapshot {
  vector_count: number;
  last_ivf_rebuild_at: number;
  indexed_files: number;
  pending_chunks: number;
  embedded_chunks: number;
  last_indexed_at: number | null;
}

/**
 * Read-only accessor over the shared SQLite `state.db` (Spec 08.2 §2.2 / §3).
 *
 * Opened with `{ readonly: true }` plus `PRAGMA query_only = ON` as
 * belt-and-suspenders. Used for the keyword fallback (chunks_queue.raw_text),
 * recency mtime, and index statistics. Never writes.
 */
export class SqliteReader {
  private constructor(private readonly db: Database.Database) {}

  static exists(projectPath: string): boolean {
    return fs.existsSync(sqliteDbPath(projectPath));
  }

  /** Open read-only; returns null if the state DB is missing or unopenable. */
  static open(projectPath: string): SqliteReader | null {
    const dbPath = sqliteDbPath(projectPath);
    if (!fs.existsSync(dbPath)) return null;
    try {
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      db.pragma('query_only = ON');
      return new SqliteReader(db);
    } catch {
      return null;
    }
  }

  /**
   * SQLite LIKE fallback over chunks_queue.raw_text (Spec 08.2 §5.4 / §5.7).
   * Scores each row by the count of distinct query terms it contains.
   */
  ftsFallback(projectPath: string, terms: string[], limit: number): SqliteHit[] {
    const cleanTerms = [...new Set(terms.map((t) => t.toLowerCase()).filter((t) => t.length > 1))];
    if (cleanTerms.length === 0) return [];

    // Build a guarded OR predicate; bind every term as a LIKE parameter.
    const likeClause = cleanTerms.map(() => 'LOWER(raw_text) LIKE ?').join(' OR ');
    const rows = this.db
      .prepare(
        `SELECT * FROM chunks_queue
         WHERE project_path = ? AND schema_version = ? AND (${likeClause})
         LIMIT ?`,
      )
      .all(
        projectPath,
        SCHEMA_VERSION,
        ...cleanTerms.map((t) => `%${t}%`),
        // Over-fetch so the term-count ranking has room before truncation.
        Math.max(limit * 4, limit),
      ) as QueueRow[];

    const hits = rows.map((r) => {
      const hay = (r.raw_text ?? '').toLowerCase();
      const score = cleanTerms.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
      return { row: queueRowToChunk(r), rawScore: score };
    });

    hits.sort((a, b) => b.rawScore - a.rawScore || (b.row.indexed_at ?? 0) - (a.row.indexed_at ?? 0));
    return hits.slice(0, limit);
  }

  /** Fetch a single chunk from the queue by id (get_chunk fallback). */
  getChunkById(projectPath: string, chunkId: string): ChunkRow | null {
    const r = this.db
      .prepare(
        `SELECT * FROM chunks_queue WHERE project_path = ? AND chunk_id = ? AND schema_version = ?`,
      )
      .get(projectPath, chunkId, SCHEMA_VERSION) as QueueRow | undefined;
    return r ? queueRowToChunk(r) : null;
  }

  /** All queue chunks for a file ordered by start_line (neighbor fallback). */
  chunksForFile(projectPath: string, filePath: string): ChunkRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM chunks_queue
         WHERE project_path = ? AND file_path = ? AND schema_version = ?
         ORDER BY start_line ASC`,
      )
      .all(projectPath, filePath, SCHEMA_VERSION) as QueueRow[];
    return rows.map(queueRowToChunk);
  }

  /** Recency mtime for a file from file_fingerprints (Spec 08.2 §3 recency). */
  mtimeForFile(projectPath: string, filePath: string): number | null {
    const r = this.db
      .prepare(
        `SELECT mtime_ns FROM file_fingerprints WHERE project_path = ? AND file_path = ?`,
      )
      .get(projectPath, filePath) as { mtime_ns: number | null } | undefined;
    return r?.mtime_ns ?? null;
  }

  /** Aggregate index statistics for index_status / doctor_index / health_check. */
  stats(projectPath: string): IndexStatsSnapshot {
    const statsRow = this.db
      .prepare('SELECT vector_count, last_ivf_rebuild_at FROM index_stats WHERE project_path = ?')
      .get(projectPath) as { vector_count: number; last_ivf_rebuild_at: number } | undefined;

    const files = this.db
      .prepare('SELECT COUNT(*) AS n, MAX(last_indexed_at) AS last FROM file_fingerprints WHERE project_path = ?')
      .get(projectPath) as { n: number; last: number | null };

    const pending = this.db
      .prepare(`SELECT COUNT(*) AS n FROM chunks_queue WHERE project_path = ? AND embedding_status = 'pending'`)
      .get(projectPath) as { n: number };

    const embedded = this.db
      .prepare(`SELECT COUNT(*) AS n FROM chunks_queue WHERE project_path = ? AND embedding_status = 'embedded'`)
      .get(projectPath) as { n: number };

    return {
      vector_count:        statsRow?.vector_count ?? 0,
      last_ivf_rebuild_at: statsRow?.last_ivf_rebuild_at ?? 0,
      indexed_files:       files.n ?? 0,
      pending_chunks:      pending.n ?? 0,
      embedded_chunks:     embedded.n ?? 0,
      last_indexed_at:     files.last ?? null,
    };
  }

  /**
   * Count chunks for a project that have non-empty raw_text.
   * Used by index_status to report `fts_ready_chunks` — the number of chunks
   * that can serve keyword search (SQLite LIKE or LanceDB FTS) right now,
   * independent of embedding status (Task 3.5 — partial index awareness).
   */
  countChunksWithText(projectPath: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM chunks_queue
         WHERE project_path = ? AND raw_text IS NOT NULL AND raw_text != ''`,
      )
      .get(projectPath) as { n: number };
    return row.n;
  }

  countAllChunks(projectPath: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM chunks_queue WHERE project_path = ?`)
      .get(projectPath) as { n: number };
    return row.n;
  }

  distinctSchemaVersions(projectPath: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT schema_version FROM chunks_queue
         WHERE project_path = ? AND schema_version IS NOT NULL`,
      )
      .all(projectPath) as { schema_version: string }[];
    return rows.map((r) => r.schema_version);
  }

  getEmbeddedChunkIds(projectPath: string, limit = 500): string[] {
    const rows = this.db
      .prepare(
        `SELECT chunk_id FROM chunks_queue
         WHERE project_path = ? AND embedding_status = 'embedded'
         LIMIT ?`,
      )
      .all(projectPath, limit) as { chunk_id: string }[];
    return rows.map((r) => r.chunk_id);
  }

  getEmbeddingStatusMap(chunkIds: string[]): Map<string, string> {
    if (chunkIds.length === 0) return new Map();
    const placeholders = chunkIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT chunk_id, embedding_status FROM chunks_queue WHERE chunk_id IN (${placeholders})`,
      )
      .all(...chunkIds) as { chunk_id: string; embedding_status: string | null }[];
    return new Map(rows.map((r) => [r.chunk_id, r.embedding_status ?? '']));
  }

  /** Guard: prove read-only enforcement (Spec 08.2 §6 Read-Only Enforcement test). */
  assertNoWrite(operation: string): never {
    throw new ReadOnlyViolationError(`SQLite.${operation}`);
  }

  close(): void {
    this.db.close();
  }
}
