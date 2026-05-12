import { describe, expect, it } from 'vitest';
import { chunkFile } from '../src/indexing/chunker.js';

describe('chunkFile', () => {
  it('creates deterministic overlapping chunks', () => {
    const text = Array.from({ length: 260 }, (_, index) => `line ${index + 1}`).join('\n');
    const chunks = chunkFile({
      projectPath: '/tmp/project',
      absolutePath: '/tmp/project/example.ts',
      filePath: 'example.ts',
      text,
      chunkLines: 120,
      overlapLines: 20,
    });

    expect(chunks.length).toBe(3);
    expect(chunks[0]?.startLine).toBe(1);
    expect(chunks[0]?.endLine).toBe(120);
    expect(chunks[1]?.startLine).toBe(101);
    expect(chunks[2]?.endLine).toBe(260);
    expect(chunks[0]?.chunkId).toBeTypeOf('string');
  });
});
