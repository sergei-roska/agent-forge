import type { ScoredResult } from './types.js';
import { RECENCY_DECAY_HALF_LIFE_DAYS } from '../constants.js';

const MS_PER_DAY = 86_400_000;

/**
 * Recency boost (Spec 08.2 §2.3 step 4). Applied after RRF to the top-50 only:
 *
 *   recency_multiplier = 1 + recency_weight * exp(-age_days / decay_half_life)
 *   age_days = (now_ms - mtime_ns / 1e6) / 86_400_000
 *
 * `recency_weight = 0` disables the boost (multiplier stays 1.0). Results are
 * re-sorted by the adjusted score, ties broken by chunk_id for determinism.
 */
export function applyRecencyBoost(
  results: ScoredResult[],
  recencyWeight: number,
  nowMs: number = Date.now(),
  topN = 50,
): ScoredResult[] {
  if (recencyWeight <= 0) return results;

  const boosted = results.slice(0, topN).map((r) => {
    const mtimeNs = r.row.mtime_ns;
    if (mtimeNs === null || mtimeNs === undefined) return r;
    const ageDays = Math.max(0, (nowMs - mtimeNs / 1_000_000) / MS_PER_DAY);
    const multiplier = 1 + recencyWeight * Math.exp(-ageDays / RECENCY_DECAY_HALF_LIFE_DAYS);
    return { ...r, score: r.score * multiplier, recency_multiplier: multiplier };
  });

  const tail = results.slice(topN);
  const merged = [...boosted, ...tail];
  merged.sort((a, b) => b.score - a.score || cmp(a.row.chunk_id, b.row.chunk_id));
  return merged;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
