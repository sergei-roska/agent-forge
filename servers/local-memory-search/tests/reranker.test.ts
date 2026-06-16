import { describe, it, expect } from 'vitest';
import { parseOrder } from '../src/search/reranker.js';

describe('Reranker parser', () => {
  it('parses direct JSON arrays correctly', () => {
    const res = parseOrder('[0, 2]', 3);
    expect(res).toEqual([0, 2]);
  });

  it('parses wrapped JSON objects correctly', () => {
    const res = parseOrder('{"indices": [1, 2, 0]}', 3);
    expect(res).toEqual([1, 2, 0]);
  });

  it('extracts arrays from markdown prose', () => {
    const res = parseOrder('Here is the ranking:\n[2, 0]\nHope this helps!', 3);
    expect(res).toEqual([2, 0]);
  });

  it('filters out indices that are out of bounds', () => {
    const res = parseOrder('[0, 99, 1]', 3);
    expect(res).toEqual([0, 1]);
  });

  it('returns null if no valid JSON array can be parsed', () => {
    const res = parseOrder('no arrays here', 3);
    expect(res).toBeNull();
  });
});
