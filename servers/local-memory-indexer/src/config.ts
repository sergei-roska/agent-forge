import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { SCHEMA_VERSION, DEFAULT_EMBED_MODEL, DEFAULT_ENRICH_MODEL, DEFAULT_MAX_FILE_SIZE_KB, DEFAULT_CHUNK_MAX_LINES, LOCK_TTL_MS } from './constants.js';

export interface IndexerConfig {
  /** Root dir for all per-project LanceDB + SQLite data. Shared with local-memory-search. */
  dataRoot: string;
  defaultProjectPath: string;
  ollamaBaseUrl: string;
  embedModel: string;
  enrichModel: string;
  maxFileSizeKb: number;
  chunkMaxLines: number;
  lockTtlMs: number;
  schemaVersion: string;
}

export function getConfig(): IndexerConfig {
  return {
    dataRoot: resolve(
      process.env['LOCAL_VECTOR_SEARCH_DATA_ROOT'] ??
        `${homedir()}/.agent-forge/local-memory-search`,
    ),
    defaultProjectPath: resolve(
      process.env['LOCAL_VECTOR_SEARCH_DEFAULT_PROJECT'] ?? process.cwd(),
    ),
    ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434',
    embedModel: process.env['EMBED_MODEL'] ?? DEFAULT_EMBED_MODEL,
    enrichModel: process.env['ENRICH_MODEL'] ?? DEFAULT_ENRICH_MODEL,
    maxFileSizeKb: Number(process.env['MAX_FILE_SIZE_KB'] ?? DEFAULT_MAX_FILE_SIZE_KB),
    chunkMaxLines: DEFAULT_CHUNK_MAX_LINES,
    lockTtlMs: LOCK_TTL_MS,
    schemaVersion: SCHEMA_VERSION,
  };
}
