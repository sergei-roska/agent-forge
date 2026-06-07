import { describe, it, expect } from 'vitest';
import { extractTechnicalIdentifiers } from '../src/search/IdentifierExtractor.js';
import { normalizeQuery } from '../src/search/normalize.js';
import { fuseRrf } from '../src/search/rrf.js';
import { applyRecencyBoost } from '../src/search/recency.js';
import { applyGapFilter } from '../src/search/gapFilter.js';
import { truncateText, toFullRecord, projectRecord } from '../src/search/projection.js';
import { ResultCache } from '../src/search/resultCache.js';
import type { RawHit } from '../src/storage/LanceReader.js';
import type { ChunkRow, ScoredResult } from '../src/search/types.js';
import { IDENTIFIER_BOOST_CAP } from '../src/constants.js';

function row(id: string, text: string, mtimeNs: number | null = null): ChunkRow {
  return {
    chunk_id: id, project_path: '/p', file_path: `src/${id}.ts`,
    start_line: 1, end_line: 10, text, raw_text: text,
    language: 'typescript', class_name: null, function_name: null,
    mtime_ns: mtimeNs, schema_version: '1.0',
  };
}
function hit(id: string, text: string): RawHit {
  return { row: row(id, text), rawScore: 0 };
}

describe('IdentifierExtractor', () => {
  it('extracts camelCase, snake_case, PascalCase, dotted, versions, quoted', () => {
    const ids = extractTechnicalIdentifiers('fix useEffect in user_profile for HttpClient v1.2.3 "exact phrase"');
    expect(ids).toContain('useEffect');
    expect(ids).toContain('user_profile');
    expect(ids).toContain('HttpClient');
    expect(ids).toContain('v1.2.3');
    expect(ids).toContain('exact phrase');
  });
});

describe('normalizeQuery', () => {
  it('strips stop words from keyword path but keeps identifiers', () => {
    const n = normalizeQuery('how does the useEffect hook work');
    expect(n.keyword).toContain('useeffect');
    expect(n.keyword).not.toContain('the');
    expect(n.semantic).toBe('how does the useEffect hook work');
  });
});

describe('fuseRrf', () => {
  it('fuses ranks deterministically and is order-stable across runs', () => {
    const v = [hit('a', 'alpha'), hit('b', 'beta'), hit('c', 'gamma')];
    const f = [hit('b', 'beta'), hit('a', 'alpha'), hit('d', 'delta')];
    const r1 = fuseRrf(v, f, [], 0.65, 60).map((x) => x.row.chunk_id);
    const r2 = fuseRrf(v, f, [], 0.65, 60).map((x) => x.row.chunk_id);
    expect(r1).toEqual(r2);
    // 'a' (vec rank1 + fts rank2) should outrank 'd' (fts only).
    expect(r1.indexOf('a')).toBeLessThan(r1.indexOf('d'));
  });

  it('applies identifier boost capped at +0.30', () => {
    const v = [hit('x', 'no match here')];
    const f = [hit('y', 'foo bar baz qux quux')];
    const scored = fuseRrf(v, f, ['foo', 'bar', 'baz', 'qux'], 0.5, 60);
    const y = scored.find((s) => s.row.chunk_id === 'y')!;
    expect(y.identifier_boost).toBeCloseTo(IDENTIFIER_BOOST_CAP, 6);
  });

  it('boost uses whole-word matching', () => {
    const v = [hit('w', 'prefoobar should not match foo as whole word')];
    const scored = fuseRrf(v, [], ['foo'], 1, 60);
    // 'foo' appears as whole word ("match foo as") → boosted once.
    expect(scored[0]!.identifier_boost).toBeGreaterThan(0);
  });
});

describe('applyRecencyBoost', () => {
  it('boosts newer chunks and disables at weight 0', () => {
    const now = Date.now();
    const fresh: ScoredResult = { row: row('fresh', 't', now * 1e6), score: 0.5, score_vector: 0.5, score_fts: 0, identifier_boost: 0, recency_multiplier: 1, rank_vector: 1, rank_fts: null };
    const old: ScoredResult = { row: row('old', 't', (now - 365 * 86_400_000) * 1e6), score: 0.5, score_vector: 0.5, score_fts: 0, identifier_boost: 0, recency_multiplier: 1, rank_vector: 2, rank_fts: null };
    const boosted = applyRecencyBoost([fresh, old], 0.1, now);
    expect(boosted[0]!.row.chunk_id).toBe('fresh');
    expect(boosted[0]!.recency_multiplier).toBeGreaterThan(boosted[1]!.recency_multiplier);

    const disabled = applyRecencyBoost([fresh, old], 0, now);
    expect(disabled[0]!.recency_multiplier).toBe(1);
  });
});

describe('applyGapFilter', () => {
  it('cuts the tail at the first large relevance gap', () => {
    const mk = (id: string, score: number): ScoredResult => ({ row: row(id, 't'), score, score_vector: score, score_fts: 0, identifier_boost: 0, recency_multiplier: 1, rank_vector: 1, rank_fts: null });
    const results = [mk('a', 1.0), mk('b', 0.95), mk('c', 0.2), mk('d', 0.1)];
    const { results: kept, applied } = applyGapFilter(results, 0.25);
    expect(applied).toBe(true);
    expect(kept.map((r) => r.row.chunk_id)).toEqual(['a', 'b']);
  });

  it('keeps all when no gap exceeds threshold', () => {
    const mk = (id: string, score: number): ScoredResult => ({ row: row(id, 't'), score, score_vector: score, score_fts: 0, identifier_boost: 0, recency_multiplier: 1, rank_vector: 1, rank_fts: null });
    const { applied } = applyGapFilter([mk('a', 1), mk('b', 0.9), mk('c', 0.85)], 0.25);
    expect(applied).toBe(false);
  });
});

describe('truncateText', () => {
  const long = 'A'.repeat(50) + 'MIDDLE' + 'B'.repeat(50);
  it('middle keeps head and tail', () => {
    const t = truncateText(long, 40, 'middle');
    expect(t.length).toBeLessThanOrEqual(40 + 4);
    expect(t.startsWith('A')).toBe(true);
    expect(t.endsWith('B')).toBe(true);
    expect(t).toContain('…');
  });
  it('head keeps the start; tail keeps the end', () => {
    expect(truncateText(long, 30, 'head').startsWith('A')).toBe(true);
    expect(truncateText(long, 30, 'tail').endsWith('B')).toBe(true);
  });
  it('returns text unchanged when under budget', () => {
    expect(truncateText('short', 100)).toBe('short');
  });
});

describe('projection', () => {
  it('honors fields allowlist and exclude denylist', () => {
    const scored: ScoredResult = { row: row('p', 'hello world'), score: 0.9, score_vector: 0.9, score_fts: 0, identifier_boost: 0, recency_multiplier: 1, rank_vector: 1, rank_fts: null };
    const full = toFullRecord(scored, 800);
    const onlyTwo = projectRecord(full, ['chunk_id', 'score']);
    expect(Object.keys(onlyTwo).sort()).toEqual(['chunk_id', 'score']);
    const noText = projectRecord(full, undefined, ['text']);
    expect(noText).not.toHaveProperty('text');
    expect(noText).toHaveProperty('file_path');
  });
});

describe('ResultCache', () => {
  it('returns cached value within TTL and expires after', () => {
    const c = new ResultCache<number>(1000, 4);
    const k = ResultCache.key({ projectPath: '/p', query: 'q', alpha: 0.65, limit: 10 });
    c.set(k, 42, 1000);
    expect(c.get(k, 1500)).toBe(42);
    expect(c.get(k, 2500)).toBeUndefined();
  });
  it('evicts least-recently-used beyond capacity', () => {
    const c = new ResultCache<number>(10_000, 2);
    c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3);
    expect(c.get('b')).toBeUndefined(); // 'b' evicted (LRU)
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
  });
});
