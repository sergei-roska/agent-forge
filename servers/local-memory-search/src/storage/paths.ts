import path from 'node:path';
import { getConfig } from '../config.js';

/**
 * Per-project storage layout (shared with local-memory-indexer):
 *   $LOCAL_VECTOR_SEARCH_DATA_ROOT/<project_slug>/lancedb
 *   $LOCAL_VECTOR_SEARCH_DATA_ROOT/<project_slug>/state.db
 *
 * Slug derivation MUST match the indexer (Spec 08.1) byte-for-byte, otherwise
 * the search service would look in the wrong directory.
 */
export function slugify(projectPath: string): string {
  return projectPath
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 128);
}

export function projectDataRoot(projectPath: string): string {
  return path.join(getConfig().dataRoot, slugify(projectPath));
}

export function sqliteDbPath(projectPath: string): string {
  return path.join(projectDataRoot(projectPath), 'state.db');
}

export function lanceDbDir(projectPath: string): string {
  return path.join(projectDataRoot(projectPath), 'lancedb');
}
