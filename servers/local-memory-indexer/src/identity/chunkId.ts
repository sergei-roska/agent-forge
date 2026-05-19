import { createHash } from 'node:crypto';

export interface ChunkIdParams {
  project_path: string;
  file_path: string;
  start_line: number;
  end_line: number;
  /** SHA-256 hex of the chunk's raw_text — pass the full hash, prefix is taken internally. */
  content_hash: string;
}

/**
 * Deterministic chunk identifier.
 * Formula: sha256(project_path|file_path|start_line|end_line|content_hash_prefix)
 * where content_hash_prefix = first 16 hex chars of sha256(raw_text).
 */
export function computeChunkId(params: ChunkIdParams): string {
  const { project_path, file_path, start_line, end_line, content_hash } = params;
  const content_hash_prefix = content_hash.slice(0, 16);
  const input = `${project_path}|${file_path}|${start_line}|${end_line}|${content_hash_prefix}`;
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Convenience: hash raw_text, then compute the chunk ID. */
export function computeChunkIdFromText(params: Omit<ChunkIdParams, 'content_hash'> & { raw_text: string }): {
  chunk_id: string;
  content_hash: string;
} {
  const content_hash = createHash('sha256').update(params.raw_text, 'utf8').digest('hex');
  const chunk_id = computeChunkId({ ...params, content_hash });
  return { chunk_id, content_hash };
}
