import * as lancedb from '@lancedb/lancedb';
import fs from 'node:fs';
import { lanceDbDir } from './paths.js';
import { CHUNKS_TABLE } from '../constants.js';
import type { ChunkRow } from '../search/types.js';
import { ReadOnlyViolationError } from '../errors/codes.js';
import { withReadLockRetry } from '../errors/retry.js';

/** Columns returned for search results (excludes the heavy `vector` column). */
const PROJECTION_COLUMNS = [
  'chunk_id', 'project_path', 'file_path', 'start_line', 'end_line',
  'text', 'raw_text', 'language', 'node_type', 'class_name', 'function_name',
  'symbol_path', 'content_hash', 'mtime_ns', 'last_commit_hash', 'tags',
  'summary', 'schema_version', 'indexed_at',
] as const;

/** Mutating Table methods that are forbidden in the read-only service (§2.2). */
const FORBIDDEN_TABLE_METHODS = new Set([
  'add', 'update', 'delete', 'mergeInsert', 'createIndex', 'dropIndex',
  'dropColumns', 'addColumns', 'alterColumns', 'optimize', 'createScalarIndex',
  'restore', 'checkout', 'checkoutLatest', 'dropTable',
]);

/**
 * Wrap a LanceDB Table in a Proxy that throws ReadOnlyViolationError on any
 * mutating call. This is the process-level enforcement mandated by Spec 08.2
 * §2.2 ("wrap all LanceDB connection initialization with a monkey-patch that
 * throws on any mutating operation"), since the SDK has no native readonly flag.
 */
export function guardReadOnly(table: lancedb.Table): lancedb.Table {
  return new Proxy(table, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && FORBIDDEN_TABLE_METHODS.has(prop)) {
        return () => {
          throw new ReadOnlyViolationError(`Table.${prop}`);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function toTags(v: unknown): string[] | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x) => String(x));
  // Arrow list columns sometimes surface as objects with toArray()
  if (typeof (v as { toArray?: () => unknown[] }).toArray === 'function') {
    return (v as { toArray: () => unknown[] }).toArray().map((x) => String(x));
  }
  return null;
}

/** Normalize a raw LanceDB row (Arrow-backed) into a plain ChunkRow. */
export function normalizeRow(raw: Record<string, unknown>): ChunkRow {
  return {
    chunk_id:         String(raw['chunk_id'] ?? ''),
    project_path:     String(raw['project_path'] ?? ''),
    file_path:        String(raw['file_path'] ?? ''),
    start_line:       toNum(raw['start_line']),
    end_line:         toNum(raw['end_line']),
    text:             toStr(raw['text']),
    raw_text:         toStr(raw['raw_text']),
    language:         toStr(raw['language']),
    node_type:        toStr(raw['node_type']),
    class_name:       toStr(raw['class_name']),
    function_name:    toStr(raw['function_name']),
    symbol_path:      toStr(raw['symbol_path']),
    content_hash:     toStr(raw['content_hash']),
    mtime_ns:         toNum(raw['mtime_ns']),
    last_commit_hash: toStr(raw['last_commit_hash']),
    tags:             toTags(raw['tags']),
    summary:          toStr(raw['summary']),
    schema_version:   toStr(raw['schema_version']),
    indexed_at:       toNum(raw['indexed_at']),
  };
}

function nativeScore(raw: Record<string, unknown>): number {
  // FTS exposes _score; vector exposes _distance. Both surfaced for diagnostics.
  if (raw['_score'] !== undefined) return toNum(raw['_score']) ?? 0;
  if (raw['_relevance_score'] !== undefined) return toNum(raw['_relevance_score']) ?? 0;
  if (raw['_distance'] !== undefined) return toNum(raw['_distance']) ?? 0;
  return 0;
}

export interface RawHit {
  row: ChunkRow;
  rawScore: number;
}

/**
 * Read-only accessor over the shared LanceDB `chunks` table.
 *
 * Open with {@link LanceReader.open}, which returns `null` if the database
 * cannot be reached — callers degrade to the SQLite fallback (Spec 08.2 §5.4).
 */
export class LanceReader {
  private constructor(
    private readonly conn: lancedb.Connection,
    private readonly table: lancedb.Table,
  ) {}

  /** Returns true if the LanceDB directory exists on disk. */
  static exists(projectPath: string): boolean {
    return fs.existsSync(lanceDbDir(projectPath));
  }

  /**
   * Open the chunks table read-only. Returns null on any connect/open failure
   * (missing dir, permission denied, corrupted) so the caller can fall back.
   */
  static async open(projectPath: string): Promise<LanceReader | null> {
    const dir = lanceDbDir(projectPath);
    if (!fs.existsSync(dir)) return null;
    try {
      const conn = await lancedb.connect(dir);
      const names = await conn.tableNames();
      if (!names.includes(CHUNKS_TABLE)) return null;
      const table = guardReadOnly(await conn.openTable(CHUNKS_TABLE));
      return new LanceReader(conn, table);
    } catch {
      return null;
    }
  }

  /** Count rows matching the predicate (used for empty-index detection). */
  async count(where: string): Promise<number> {
    return withReadLockRetry(() => this.table.countRows(where));
  }

  /**
   * Vector ANN search. When `bruteForce` is true, bypasses the IVF index
   * (Spec 08.2 §5.1 brute-force fallback). Returns hits in rank order.
   */
  async vectorSearch(
    vector: number[],
    where: string,
    topK: number,
    bruteForce = false,
  ): Promise<RawHit[]> {
    return withReadLockRetry(async () => {
      let q = this.table
        .query()
        .nearestTo(vector)
        .distanceType('cosine')
        .where(where)
        .select([...PROJECTION_COLUMNS])
        .limit(topK);
      if (bruteForce) q = q.bypassVectorIndex();
      const rows = (await q.toArray()) as Record<string, unknown>[];
      return rows.map((r) => ({ row: normalizeRow(r), rawScore: nativeScore(r) }));
    });
  }

  /**
   * BM25/FTS search over the `text` column. Throws if the FTS index is missing
   * (Spec 08.2 §5.7) so the caller can fall back to SQLite LIKE.
   */
  async ftsSearch(queryText: string, where: string, topK: number): Promise<RawHit[]> {
    return withReadLockRetry(async () => {
      const rows = (await this.table
        .query()
        .fullTextSearch(queryText, { columns: ['text'] })
        .where(where)
        .select([...PROJECTION_COLUMNS])
        .limit(topK)
        .toArray()) as Record<string, unknown>[];
      return rows.map((r) => ({ row: normalizeRow(r), rawScore: nativeScore(r) }));
    });
  }

  /** Fetch a single chunk by stable id (within the project + schema filter). */
  async getByChunkId(chunkId: string, where: string): Promise<ChunkRow | null> {
    const safeId = chunkId.replace(/'/g, "''");
    const rows = (await withReadLockRetry(() =>
      this.table
        .query()
        .where(`${where} AND chunk_id = '${safeId}'`)
        .select([...PROJECTION_COLUMNS])
        .limit(1)
        .toArray(),
    )) as Record<string, unknown>[];
    return rows[0] ? normalizeRow(rows[0]) : null;
  }

  /** Fetch the stored embedding vector for a chunk (for search_similar). */
  async getVectorByChunkId(chunkId: string, where: string): Promise<number[] | null> {
    const safeId = chunkId.replace(/'/g, "''");
    const rows = (await withReadLockRetry(() =>
      this.table
        .query()
        .where(`${where} AND chunk_id = '${safeId}'`)
        .select(['vector'])
        .limit(1)
        .toArray(),
    )) as Record<string, unknown>[];
    const v = rows[0]?.['vector'];
    if (!v) return null;
    if (Array.isArray(v)) return v.map(Number);
    if (typeof (v as { toArray?: () => unknown[] }).toArray === 'function') {
      return (v as { toArray: () => unknown[] }).toArray().map(Number);
    }
    return null;
  }

  /**
   * Neighbor window lookup (Spec 08.2 §4.3). Returns all chunks in the file
   * whose start_line falls within the widened window, ordered by start_line.
   */
  async neighborWindow(
    where: string,
    filePath: string,
    lineLow: number,
    lineHigh: number,
    limit: number,
  ): Promise<ChunkRow[]> {
    const safePath = filePath.replace(/'/g, "''");
    const rows = (await withReadLockRetry(() =>
      this.table
        .query()
        .where(
          `${where} AND file_path = '${safePath}' ` +
            `AND start_line >= ${lineLow} AND start_line <= ${lineHigh}`,
        )
        .select([...PROJECTION_COLUMNS])
        .limit(limit)
        .toArray(),
    )) as Record<string, unknown>[];
    return rows
      .map(normalizeRow)
      .sort((a, b) => (a.start_line ?? 0) - (b.start_line ?? 0));
  }

  /**
   * List chunks belonging to a file (matched by exact path or path suffix),
   * optionally narrowed to a function. Used to pick a seed for search_similar.
   */
  async chunksByFile(
    where: string,
    filePath: string,
    functionName: string | undefined,
    limit: number,
  ): Promise<ChunkRow[]> {
    const safe = filePath.replace(/'/g, "''");
    let predicate = `${where} AND (file_path = '${safe}' OR file_path LIKE '%${safe}')`;
    if (functionName) predicate += ` AND function_name = '${functionName.replace(/'/g, "''")}'`;
    const rows = (await withReadLockRetry(() =>
      this.table.query().where(predicate).select([...PROJECTION_COLUMNS]).limit(limit).toArray(),
    )) as Record<string, unknown>[];
    return rows.map(normalizeRow).sort((a, b) => (a.start_line ?? 0) - (b.start_line ?? 0));
  }

  /** Distinct schema_version values present for a project (for §5.2 / doctor). */
  async distinctSchemaVersions(projectPath: string): Promise<string[]> {
    const safe = projectPath.replace(/'/g, "''");
    const rows = (await withReadLockRetry(() =>
      this.table
        .query()
        .where(`project_path = '${safe}'`)
        .select(['schema_version'])
        .limit(1000)
        .toArray(),
    )) as Record<string, unknown>[];
    return [...new Set(rows.map((r) => String(r['schema_version'])))];
  }

  /** Distinct file_path values for a project (doctor stale-chunk check). */
  async distinctFilePaths(where: string): Promise<string[]> {
    const rows = (await withReadLockRetry(() =>
      this.table.query().where(where).select(['file_path']).limit(10_000).toArray(),
    )) as Record<string, unknown>[];
    return [...new Set(rows.map((r) => String(r['file_path'] ?? '')).filter(Boolean))];
  }

  /** Returns chunk_ids from LanceDB that exist in the given id list. */
  async filterExistingChunkIds(where: string, chunkIds: string[]): Promise<Set<string>> {
    if (chunkIds.length === 0) return new Set();
    const safeIds = chunkIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
    const rows = (await withReadLockRetry(() =>
      this.table
        .query()
        .where(`${where} AND chunk_id IN (${safeIds})`)
        .select(['chunk_id'])
        .limit(chunkIds.length)
        .toArray(),
    )) as Record<string, unknown>[];
    return new Set(rows.map((r) => String(r['chunk_id'])));
  }

  /** Sample chunk_ids from LanceDB (doctor vector consistency). */
  async sampleChunkIds(where: string, limit: number): Promise<string[]> {
    const rows = (await withReadLockRetry(() =>
      this.table.query().where(where).select(['chunk_id']).limit(limit).toArray(),
    )) as Record<string, unknown>[];
    return rows.map((r) => String(r['chunk_id']));
  }

  /** Raw query for doctor diagnostics (selected columns only). */
  async queryRaw(where: string, columns: string[], limit: number): Promise<Record<string, unknown>[]> {
    return withReadLockRetry(() =>
      this.table.query().where(where).select(columns).limit(limit).toArray(),
    ) as Promise<Record<string, unknown>[]>;
  }
}
