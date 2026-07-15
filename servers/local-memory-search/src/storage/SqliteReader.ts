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
  private readonly stmts = new Map<string, Database.Statement>();

  private constructor(private readonly db: Database.Database) {}

  private getStmt(key: string, sql: string): Database.Statement {
    let stmt = this.stmts.get(key);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.stmts.set(key, stmt);
    }
    return stmt;
  }

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

    const likeClause = cleanTerms.map(() => '(LOWER(raw_text) LIKE ? OR LOWER(file_path) LIKE ? OR LOWER(ast_metadata) LIKE ?)').join(' OR ');
    const params: string[] = [];
    for (const t of cleanTerms) {
      params.push(`%${t}%`, `%${t}%`, `%${t}%`);
    }

    const rows = this.db
      .prepare(
        `SELECT * FROM chunks_queue
         WHERE project_path = ? AND schema_version = ? AND (${likeClause})`
      )
      .all(
        projectPath,
        SCHEMA_VERSION,
        ...params
      ) as QueueRow[];

    const hits = rows.map((r) => {
      const chunk = queueRowToChunk(r);
      const hay = (chunk.text ?? '').toLowerCase();
      const path = (chunk.file_path ?? '').toLowerCase();
      const func = (chunk.function_name ?? '').toLowerCase();
      const cls = (chunk.class_name ?? '').toLowerCase();
      
      let score = 0;
      for (const t of cleanTerms) {
        let weight = 0;
        if (hay.includes(t)) weight += 1;
        if (path.includes(t)) weight += 5;
        if (func.includes(t) || cls.includes(t)) weight += 3;
        
        const isExactIdentifier = func === t || cls === t;
        const escapedT = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const isExactPath = path.endsWith(`/${t}`) || path === t || new RegExp(`/${escapedT}\\.[a-z0-9]+$`).test(path);
        if (isExactIdentifier) weight += 10;
        if (isExactPath) weight += 10;

        score += weight;
      }

      return { row: chunk, rawScore: score };
    });

    hits.sort((a, b) => b.rawScore - a.rawScore || (b.row.indexed_at ?? 0) - (a.row.indexed_at ?? 0));
    return hits.slice(0, limit);
  }

  /** Fetch a single chunk from the queue by id (get_chunk fallback). */
  getChunkById(projectPath: string, chunkId: string): ChunkRow | null {
    const r = this.getStmt('getChunkById',
        `SELECT * FROM chunks_queue WHERE project_path = ? AND chunk_id = ? AND schema_version = ?`,
      )
      .get(projectPath, chunkId, SCHEMA_VERSION) as QueueRow | undefined;
    return r ? queueRowToChunk(r) : null;
  }

  /** All queue chunks for a file ordered by start_line (neighbor fallback). */
  chunksForFile(projectPath: string, filePath: string): ChunkRow[] {
    const rows = this.getStmt('chunksForFile',
        `SELECT * FROM chunks_queue
         WHERE project_path = ? AND file_path = ? AND schema_version = ?
         ORDER BY start_line ASC`,
      )
      .all(projectPath, filePath, SCHEMA_VERSION) as QueueRow[];
    return rows.map(queueRowToChunk);
  }

  /** Recency mtime for a file from file_fingerprints (Spec 08.2 §3 recency). */
  mtimeForFile(projectPath: string, filePath: string): number | null {
    const r = this.getStmt('mtimeForFile',
        `SELECT mtime_ns FROM file_fingerprints WHERE project_path = ? AND file_path = ?`,
      )
      .get(projectPath, filePath) as { mtime_ns: number | null } | undefined;
    return r?.mtime_ns ?? null;
  }

  /** Aggregate index statistics for index_status / doctor_index / health_check. */
  stats(projectPath: string): IndexStatsSnapshot {
    const statsRow = this.getStmt('stats_index', 'SELECT vector_count, last_ivf_rebuild_at FROM index_stats WHERE project_path = ?')
      .get(projectPath) as { vector_count: number; last_ivf_rebuild_at: number } | undefined;

    const files = this.getStmt('stats_files', 'SELECT COUNT(*) AS n, MAX(last_indexed_at) AS last FROM file_fingerprints WHERE project_path = ?')
      .get(projectPath) as { n: number; last: number | null };

    const chunks = this.getStmt('stats_chunks', `
      SELECT 
        SUM(CASE WHEN embedding_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN embedding_status = 'embedded' THEN 1 ELSE 0 END) as embedded
      FROM chunks_queue 
      WHERE project_path = ?
    `).get(projectPath) as { pending: number | null; embedded: number | null } | undefined;

    return {
      vector_count:        statsRow?.vector_count ?? 0,
      last_ivf_rebuild_at: statsRow?.last_ivf_rebuild_at ?? 0,
      indexed_files:       files.n ?? 0,
      pending_chunks:      chunks?.pending ?? 0,
      embedded_chunks:     chunks?.embedded ?? 0,
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
    const row = this.getStmt('countChunksWithText',
        `SELECT COUNT(*) AS n FROM chunks_queue
         WHERE project_path = ? AND raw_text IS NOT NULL AND raw_text != ''`,
      )
      .get(projectPath) as { n: number };
    return row.n;
  }

  countAllChunks(projectPath: string): number {
    const row = this.getStmt('countAllChunks', `SELECT COUNT(*) AS n FROM chunks_queue WHERE project_path = ?`)
      .get(projectPath) as { n: number };
    return row.n;
  }

  distinctSchemaVersions(projectPath: string): string[] {
    const rows = this.getStmt('distinctSchemaVersions',
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

  findCallers(projectPath: string, symbolName: string, depth = 1): any[] {
    const results: any[] = [];
    const visited = new Set<string>();
    const queue: { name: string; currentDepth: number }[] = [{ name: symbolName, currentDepth: 1 }];

    while (queue.length > 0) {
      const { name, currentDepth } = queue.shift()!;
      if (visited.has(name) || currentDepth > depth) continue;
      visited.add(name);

      try {
        const rows = this.getStmt('findCallers',
            `SELECT ge.*, gn.symbol_name as source_name, gn.symbol_type as source_type, gn.symbol_path as source_path, gn.file_path
             FROM graph_edges ge
             JOIN graph_nodes gn ON ge.source_node_id = gn.node_id
             WHERE ge.project_path = ? AND ge.target_node_name = ?`
          )
          .all(projectPath, name) as any[];

        for (const row of rows) {
          results.push({
            source_symbol: row.source_path,
            source_type: row.source_type,
            file_path: row.file_path,
            target_symbol: name,
            relationship_type: row.relationship_type,
            depth: currentDepth,
          });
          if (currentDepth < depth) {
            queue.push({ name: row.source_name, currentDepth: currentDepth + 1 });
          }
        }
      } catch (err) {
        // Fallback if table doesn't exist yet
        console.warn('findCallers failed:', err);
        break;
      }
    }
    return results;
  }

  findCallees(projectPath: string, symbolPath: string, depth = 1): any[] {
    const results: any[] = [];
    const visited = new Set<string>();

    try {
      // Look up the node ID for symbolPath first
      const rootNode = this.getStmt('findCallees_root', `SELECT node_id, symbol_name FROM graph_nodes WHERE project_path = ? AND (symbol_path = ? OR symbol_name = ?)`)
        .get(projectPath, symbolPath, symbolPath) as { node_id: string; symbol_name: string } | undefined;

      if (!rootNode) return [];

      const queue: { nodeId: string; name: string; currentDepth: number }[] = [
        { nodeId: rootNode.node_id, name: rootNode.symbol_name, currentDepth: 1 }
      ];

      while (queue.length > 0) {
        const { nodeId, name, currentDepth } = queue.shift()!;
        if (visited.has(nodeId) || currentDepth > depth) continue;
        visited.add(nodeId);

        const rows = this.getStmt('findCallees_edges',
            `SELECT ge.*, gn.symbol_path as target_path, gn.symbol_type as target_type, gn.file_path as target_file_path
             FROM graph_edges ge
             LEFT JOIN graph_nodes gn ON ge.target_node_id = gn.node_id
             WHERE ge.project_path = ? AND ge.source_node_id = ?`
          )
          .all(projectPath, nodeId) as any[];

        for (const row of rows) {
          results.push({
            source_symbol: name,
            target_symbol: row.target_path || row.target_node_name,
            target_type: row.target_type || 'unresolved',
            file_path: row.target_file_path || 'external',
            relationship_type: row.relationship_type,
            depth: currentDepth,
          });
          if (currentDepth < depth && row.target_node_id) {
            queue.push({
              nodeId: row.target_node_id,
              name: row.target_path || row.target_node_name,
              currentDepth: currentDepth + 1
            });
          }
        }
      }
    } catch (err) {
      console.warn('findCallees failed:', err);
    }
    return results;
  }

  getImportGraph(projectPath: string, filePath?: string): any[] {
    try {
      let query = `
        SELECT gn.file_path as source_file, ge.target_node_name as imported_module
        FROM graph_edges ge
        JOIN graph_nodes gn ON ge.source_node_id = gn.node_id
        WHERE ge.project_path = ? AND ge.relationship_type = 'imports'
      `;
      const params: any[] = [projectPath];
      if (filePath) {
        query += ` AND gn.file_path = ?`;
        params.push(filePath);
      }
      return this.getStmt('getImportGraph_' + (filePath ? 'withFile' : 'all'), query).all(...params) as any[];
    } catch (err) {
      console.warn('getImportGraph failed:', err);
      return [];
    }
  }

  tracePath(projectPath: string, sourceSymbol: string, targetSymbol: string): any[] {
    try {
      const queue: { current: string; path: any[] }[] = [];
      const visited = new Set<string>();

      // Resolve source node(s)
      const sources = this.getStmt('tracePath_sources', `SELECT node_id, symbol_path FROM graph_nodes WHERE project_path = ? AND (symbol_path = ? OR symbol_name = ?)`)
        .all(projectPath, sourceSymbol, sourceSymbol) as { node_id: string; symbol_path: string }[];

      for (const src of sources) {
        queue.push({ current: src.node_id, path: [{ symbol: src.symbol_path, type: 'start' }] });
      }

      while (queue.length > 0) {
        const { current, path: currentPath } = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        // Get current symbol name/path
        const nodeInfo = this.getStmt('tracePath_nodeInfo', `SELECT symbol_path, symbol_name FROM graph_nodes WHERE node_id = ?`)
          .get(current) as { symbol_path: string; symbol_name: string } | undefined;
        
        if (!nodeInfo) continue;

        if (nodeInfo.symbol_path === targetSymbol || nodeInfo.symbol_name === targetSymbol) {
          return currentPath;
        }

        const outgoing = this.getStmt('tracePath_outgoing',
            `SELECT ge.target_node_id, ge.target_node_name, gn.symbol_path
             FROM graph_edges ge
             LEFT JOIN graph_nodes gn ON ge.target_node_id = gn.node_id
             WHERE ge.project_path = ? AND ge.source_node_id = ? AND ge.relationship_type = 'calls'`
          )
          .all(projectPath, current) as any[];

        for (const edge of outgoing) {
          const nextNode = edge.target_node_id;
          const nextName = edge.symbol_path || edge.target_node_name;
          const newPath = [...currentPath, { symbol: nextName, edge_target_id: nextNode }];
          
          if (nextName === targetSymbol) {
            return newPath;
          }
          
          if (nextNode) {
            queue.push({ current: nextNode, path: newPath });
          }
        }
      }
    } catch (err) {
      console.warn('tracePath failed:', err);
    }
    return [];
  }

  /** Guard: prove read-only enforcement (Spec 08.2 §6 Read-Only Enforcement test). */
  assertNoWrite(operation: string): never {
    throw new ReadOnlyViolationError(`SQLite.${operation}`);
  }

  close(): void {
    this.db.close();
  }
}
