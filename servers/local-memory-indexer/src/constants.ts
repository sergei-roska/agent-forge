export const SCHEMA_VERSION = '1.0';

export const DEFAULT_EMBED_MODEL = 'qwen3-embedding:8b';
export const DEFAULT_ENRICH_MODEL = 'granite4:3b-h';

export const DEFAULT_BATCH_SIZE_OLLAMA = 100;
export const DEFAULT_BATCH_SIZE_TRANSFORMERS = 50;

export const DEFAULT_MAX_FILE_SIZE_KB = 512;
export const DEFAULT_CHUNK_MAX_LINES = 120;
export const DEFAULT_MAX_CHUNK_CHARS = 4000;
export const DEFAULT_TOP_K_BEFORE_RERANK = 50;

export const IVF_REBUILD_THRESHOLD = 5000;
export const LOCK_TTL_MS = 10 * 60 * 1000;
export const MAX_PARSE_RETRIES = 3;

export const LOCK_NAME = (projectPath: string) => `indexer:${projectPath}`;
