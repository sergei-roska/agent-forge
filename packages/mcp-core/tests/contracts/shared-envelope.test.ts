import { describe, it, expect } from 'vitest';
import {
  buildEnvelope,
  applyWindowing,
  applyProjection,
} from '../../src/contracts/response.js';

describe('MCP Response Envelope', () => {
  it('builds a standard envelope summary-first', () => {
    const result = buildEnvelope({
      summary: 'Found 2 items.',
      data: [{ id: 1 }, { id: 2 }],
      total: 2,
      source: 'runtime',
      warnings: ['Cache miss'],
    });

    expect(result.summary).toBe('Found 2 items.');
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.pagination).toBeDefined();
    expect(result.pagination?.total).toBe(2);
    expect(result.source_of_truth).toBe('runtime');
    expect(result.warnings).toEqual(['Cache miss']);
  });

  describe('Projection', () => {
    const data = [
      { id: 1, name: 'Node 1', _meta: { secret: 'hidden' } },
      { id: 2, name: 'Node 2', _meta: { secret: 'hidden' } },
    ];

    it('returns original data if no projection args passed', () => {
      const result = applyProjection(data);
      expect(result).toEqual(data);
    });

    it('includes only specified fields', () => {
      const result = applyProjection(data, ['id']);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('excludes specified noise fields', () => {
      const result = applyProjection(data, undefined, ['_meta']);
      expect(result).toEqual([
        { id: 1, name: 'Node 1' },
        { id: 2, name: 'Node 2' },
      ]);
    });
  });

  describe('Windowing', () => {
    it('truncates at head', () => {
      const text = '1234567890';
      const result = applyWindowing(text, 5, 0, undefined, 'head');
      expect(result.text).toBe('12345');
      expect(result.window.truncated).toBe(true);
      expect(result.window.truncate_strategy).toBe('head');
    });

    it('truncates at tail', () => {
      const text = '1234567890';
      const result = applyWindowing(text, 5, 0, undefined, 'tail');
      expect(result.text).toBe('67890');
    });

    it('truncates in middle', () => {
      const text = '1234567890';
      const result = applyWindowing(text, 6, 0, undefined, 'middle');
      expect(result.text).toBe('123\n… [truncated] …\n890');
    });

    it('does not truncate if under limit', () => {
      const text = '12345';
      const result = applyWindowing(text, 10);
      expect(result.text).toBe('12345');
      expect(result.window.truncated).toBe(false);
    });
  });
});
