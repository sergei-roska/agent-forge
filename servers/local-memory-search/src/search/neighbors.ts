import type { SearchEngine } from './SearchEngine.js';
import type { ChunkRow } from './types.js';
import { buildWherePredicate } from '../storage/filters.js';
import { AVG_CHUNK_LINES } from '../constants.js';

export interface NeighborResult {
  target: ChunkRow | null;
  before: ChunkRow[];
  after: ChunkRow[];
  warnings: string[];
}

/**
 * Resolve adjacent chunks for a hit (Spec 08.2 §4.3). Prefers LanceDB; falls
 * back to the SQLite queue when LanceDB is unavailable. The target chunk is
 * located by id, then neighbors are taken from the same file ordered by
 * start_line — `before` chunks precede the target, `after` chunks follow it.
 */
export async function getNeighbors(
  engine: SearchEngine,
  projectPath: string,
  chunkId: string,
  before: number,
  after: number,
): Promise<NeighborResult> {
  const warnings: string[] = [];
  const where = buildWherePredicate(projectPath);
  const lance = await engine.lance(projectPath);

  let target: ChunkRow | null = null;
  let fileChunks: ChunkRow[] = [];

  if (lance) {
    target = await lance.getByChunkId(chunkId, where);
    if (target) {
      const span = Math.max(before, after) + 1;
      const low = (target.start_line ?? 0) - span * AVG_CHUNK_LINES;
      const high = (target.end_line ?? target.start_line ?? 0) + span * AVG_CHUNK_LINES;
      fileChunks = await lance.neighborWindow(
        where, target.file_path, Math.max(0, low), high, (before + after + 1) * 4,
      );
    }
  }

  if (!target) {
    // LanceDB miss → try the SQLite queue.
    const sqlite = engine.sqlite(projectPath);
    if (sqlite) {
      target = sqlite.getChunkById(projectPath, chunkId);
      if (target) fileChunks = sqlite.chunksForFile(projectPath, target.file_path);
    }
  }

  if (!target) return { target: null, before: [], after: [], warnings };

  // Deduplicate & order the file's chunks, then slice around the target.
  const ordered = dedupeOrdered(fileChunks, target);
  const idx = ordered.findIndex((c) => c.chunk_id === target!.chunk_id);
  const beforeChunks = idx > 0 ? ordered.slice(Math.max(0, idx - before), idx) : [];
  const afterChunks = idx >= 0 ? ordered.slice(idx + 1, idx + 1 + after) : [];

  return { target, before: beforeChunks, after: afterChunks, warnings };
}

function dedupeOrdered(chunks: ChunkRow[], target: ChunkRow): ChunkRow[] {
  const map = new Map<string, ChunkRow>();
  for (const c of chunks) map.set(c.chunk_id, c);
  map.set(target.chunk_id, target);
  return [...map.values()].sort((a, b) => (a.start_line ?? 0) - (b.start_line ?? 0));
}
