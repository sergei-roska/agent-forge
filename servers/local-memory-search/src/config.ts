import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { SCHEMA_VERSION, DEFAULT_EMBED_MODEL, DEFAULT_RERANK_MODEL } from './constants.js';

export interface SearchConfig {
  /** Root dir for all per-project LanceDB + SQLite data. Shared with local-memory-indexer. */
  dataRoot: string;
  defaultProjectPath: string;
  ollamaBaseUrl: string;
  /** Embedding model — must match the model the indexer embedded with. */
  embedModel: string;
  /** LLM used for optional query-time re-ranking. */
  rerankModel: string;
  schemaVersion: string;
}

export function getConfig(): SearchConfig {
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
    rerankModel: process.env['RERANK_MODEL'] ?? DEFAULT_RERANK_MODEL,
    schemaVersion: SCHEMA_VERSION,
  };
}

/** Resolve the effective project path: explicit arg → default → throw-friendly empty. */
export function resolveProjectPath(projectPath?: string): string {
  const raw = projectPath?.trim();
  if (raw) return resolve(raw);
  return getConfig().defaultProjectPath;
}
