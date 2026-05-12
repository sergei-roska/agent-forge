import { homedir } from 'node:os';
import { resolve } from 'node:path';

export interface ServerConfig {
  dataRoot: string;
  defaultProjectPath: string;
  ollamaBaseUrl: string;
  lockTtlMs: number;
  chunkLines: number;
  chunkOverlapLines: number;
  maxIndexedFileSizeKb: number;
  topKBeforeRerank: number;
  schemaVersion: string;
}

export const DEFAULT_EMBED_MODEL = 'qwen3-embedding:8b';
export const DEFAULT_ENRICH_MODEL = 'granite4:3b-h';
export const DEFAULT_RERANK_MODEL = 'qwen3.5:9b';
export const SCHEMA_VERSION = '1.0';

export function getServerConfig(): ServerConfig {
  return {
    dataRoot: resolve(
      process.env.LOCAL_VECTOR_SEARCH_DATA_ROOT
        ?? `${homedir()}/.agent-forge/local-memory-search`,
    ),
    defaultProjectPath: resolve(
      process.env.LOCAL_VECTOR_SEARCH_DEFAULT_PROJECT ?? process.cwd(),
    ),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    lockTtlMs: 5 * 60 * 1000,
    chunkLines: 120,
    chunkOverlapLines: 20,
    maxIndexedFileSizeKb: 512,
    topKBeforeRerank: 50,
    schemaVersion: SCHEMA_VERSION,
  };
}
