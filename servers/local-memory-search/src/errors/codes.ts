/**
 * Error / warning vocabulary for the read-only search service (Spec 08.2 §5).
 *
 * Most of these are NOT thrown to the agent — they are surfaced as `warnings[]`
 * entries while the pipeline degrades. The thrown `SearchError` class is reserved
 * for internal control flow (caught and converted to warnings or structured
 * errors before returning).
 */
export const ErrorCode = {
  DATABASE_LOCKED: 'DATABASE_LOCKED',
  SCHEMA_MISMATCH: 'SCHEMA_MISMATCH',
  INDEX_EMPTY: 'INDEX_EMPTY',
  INDEX_UNAVAILABLE: 'INDEX_UNAVAILABLE',
  EMBEDDING_BACKEND_UNAVAILABLE: 'EMBEDDING_BACKEND_UNAVAILABLE',
  CHUNK_NOT_FOUND: 'CHUNK_NOT_FOUND',
  FTS_INDEX_MISSING: 'FTS_INDEX_MISSING',
  READONLY_VIOLATION: 'READONLY_VIOLATION',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Canonical warning strings emitted in `warnings[]` (Spec 08.2 §2.4 / §5).
 * Centralised so tests can assert on stable substrings.
 */
export const Warn = {
  vectorIndexUnavailable: 'vector_index_unavailable: degraded to keyword-only',
  lancedbConnectFailed:   'vector_index_unavailable: lancedb_connect_failed. Using SQLite fallback.',
  vectorIndexLockedBrute: 'vector_index_locked: brute_force_ann_used',
  vectorIndexLockedFts:   'vector_index_locked: degraded_to_fts. Retry in ~30s for full hybrid results.',
  indexEmpty:             'index_empty: run start_indexing to populate',
  embeddingUnavailable:   'embedding_unavailable: query_vectorization_failed. Semantic search disabled.',
  ftsIndexMissing:        'fts_index_missing: fallback_to_sqlite_like. Performance degraded.',
  rerankUnavailable:      'rerank_unavailable: falling back to RRF order',
  schemaMismatch:         (pct: number, found: string) =>
    `schema_version_mismatch: ${pct}% of vectors excluded (version '${found}' found). Re-run start_indexing to refresh.`,
} as const;

export class SearchError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SearchError';
  }
}

/** Thrown immediately if any mutating LanceDB/SQLite path is reached (read-only guard). */
export class ReadOnlyViolationError extends SearchError {
  constructor(operation: string) {
    super(
      ErrorCode.READONLY_VIOLATION,
      `Read-only search service attempted a mutating operation: ${operation}. This is forbidden by Spec 08.2 §2.2.`,
      { operation },
    );
    this.name = 'ReadOnlyViolationError';
  }
}
