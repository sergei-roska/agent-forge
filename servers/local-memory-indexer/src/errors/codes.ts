export const ErrorCode = {
  DATABASE_LOCKED: 'DATABASE_LOCKED',
  SCHEMA_MISMATCH: 'SCHEMA_MISMATCH',
  PHASE1_PARSE_ERROR: 'PHASE1_PARSE_ERROR',
  EMBEDDING_BACKEND_UNAVAILABLE: 'EMBEDDING_BACKEND_UNAVAILABLE',
  CONCURRENT_INDEXING_REJECTED: 'CONCURRENT_INDEXING_REJECTED',
  PROJECT_PATH_REQUIRED: 'PROJECT_PATH_REQUIRED',
  RUN_NOT_FOUND: 'RUN_NOT_FOUND',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class IndexerError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'IndexerError';
  }
}
