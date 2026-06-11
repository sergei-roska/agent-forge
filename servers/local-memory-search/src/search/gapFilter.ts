import type { ScoredResult } from './types.js';

export interface GapFilterResult {
  results: ScoredResult[];
  /** True if a relevance gap actually truncated the list. */
  applied: boolean;
}

/**
 * Relevance Gap Filtering (Spec 08.2 §2.3 step 5).
 *
 * Walk the score-sorted list and find the first consecutive gap that exceeds
 * `gap_threshold * score[0]`. Everything after that index is discarded. This
 * trims an irrelevant tail when the top hits are strongly relevant.
 *
 * `gapThreshold <= 0` disables filtering. Assumes `results` is already sorted
 * by score descending.
 */
export function applyGapFilter(
  results: ScoredResult[],
  gapThreshold: number,
): GapFilterResult {
  if (gapThreshold <= 0 || results.length <= 1) {
    return { results, applied: false };
  }

  const topScore = results[0]!.score;
  if (topScore <= 0) return { results, applied: false };

  const cutoff = gapThreshold * topScore;
  for (let i = 0; i < results.length - 1; i++) {
    const gap = results[i]!.score - results[i + 1]!.score;
    if (gap > cutoff) {
      return { results: results.slice(0, i + 1), applied: true };
    }
  }

  return { results, applied: false };
}
