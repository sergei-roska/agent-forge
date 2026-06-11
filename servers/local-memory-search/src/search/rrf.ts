import type { RawHit } from '../storage/LanceReader.js';
import type { ScoredResult } from './types.js';
import { IDENTIFIER_BOOST, IDENTIFIER_BOOST_CAP } from '../constants.js';

/**
 * Reciprocal Rank Fusion + Exact Identifier Boost (Spec 08.2 §2.3 step 3).
 *
 *   RRF_score = alpha * 1/(k + rank_vector) + (1-alpha) * 1/(k + rank_fts)
 *
 * Ranks are 1-based. A chunk present in only one leg contributes only that
 * leg's term. The identifier boost (+0.15 per whole-word hit, capped at +0.30)
 * is applied AFTER fusion. Output is sorted by final score descending, ties
 * broken by chunk_id for determinism (Spec 08.2 §6 Determinism).
 */
export function fuseRrf(
  vectorHits: RawHit[],
  ftsHits: RawHit[],
  identifiers: string[],
  alpha: number,
  rrfK: number,
): ScoredResult[] {
  const rankVector = new Map<string, number>();
  const rankFts = new Map<string, number>();
  const rows = new Map<string, RawHit['row']>();

  vectorHits.forEach((h, i) => {
    rankVector.set(h.row.chunk_id, i + 1);
    rows.set(h.row.chunk_id, h.row);
  });
  ftsHits.forEach((h, i) => {
    rankFts.set(h.row.chunk_id, i + 1);
    if (!rows.has(h.row.chunk_id)) rows.set(h.row.chunk_id, h.row);
  });

  const boostMatchers = identifiers.map((id) => ({
    id,
    re: new RegExp(`\\b${escapeRegExp(id)}\\b`, 'i'),
  }));

  const results: ScoredResult[] = [];
  for (const [chunkId, row] of rows) {
    const rv = rankVector.get(chunkId) ?? null;
    const rf = rankFts.get(chunkId) ?? null;

    const scoreVector = rv !== null ? 1 / (rrfK + rv) : 0;
    const scoreFts    = rf !== null ? 1 / (rrfK + rf) : 0;
    const rrf = alpha * scoreVector + (1 - alpha) * scoreFts;

    // Exact identifier boost on raw_text, capped per chunk.
    const hay = row.raw_text ?? row.text ?? '';
    let boost = 0;
    for (const { re } of boostMatchers) {
      if (re.test(hay)) boost += IDENTIFIER_BOOST;
    }
    boost = Math.min(boost, IDENTIFIER_BOOST_CAP);

    results.push({
      row,
      score: rrf + boost,
      score_vector: scoreVector,
      score_fts: scoreFts,
      identifier_boost: boost,
      recency_multiplier: 1,
      rank_vector: rv,
      rank_fts: rf,
    });
  }

  results.sort((a, b) => b.score - a.score || cmp(a.row.chunk_id, b.row.chunk_id));
  return results;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
