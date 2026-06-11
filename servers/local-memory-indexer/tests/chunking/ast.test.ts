import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AstChunker } from '../../src/indexer/chunking/AstChunker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TS_FIXTURE = path.join(__dirname, '../fixtures/repos/ts-sample/src/math.ts');
const PY_FIXTURE = path.join(__dirname, '../fixtures/repos/py-sample/math.py');

describe('AstChunker — TypeScript', () => {
  const chunker = new AstChunker({ maxLines: 120, maxChars: 4000 });

  it('produces multiple chunks when maxLines is smaller than the file', async () => {
    // The fixture is ~37 lines; with maxLines=8 it must produce multiple chunks
    const small = new AstChunker({ maxLines: 8, maxChars: 4000 });
    const chunks = await small.chunkFile(TS_FIXTURE);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('all chunks have language=typescript', async () => {
    const chunks = await chunker.chunkFile(TS_FIXTURE);
    expect(chunks.every((c) => c.ast_metadata.language === 'typescript')).toBe(true);
  });

  it('no chunk exceeds maxLines (+2 snap tolerance)', async () => {
    const maxLines = 120;
    const chunks = await new AstChunker({ maxLines, maxChars: 4000 }).chunkFile(TS_FIXTURE);
    for (const chunk of chunks) {
      expect(chunk.end_line - chunk.start_line + 1).toBeLessThanOrEqual(maxLines + 2);
    }
  });

  it('no chunk exceeds maxChars', async () => {
    const chunks = await chunker.chunkFile(TS_FIXTURE);
    for (const chunk of chunks) {
      expect(chunk.raw_text.length).toBeLessThanOrEqual(4000);
    }
  });

  it('start_line is 1-based and end_line >= start_line', async () => {
    const chunks = await chunker.chunkFile(TS_FIXTURE);
    for (const chunk of chunks) {
      expect(chunk.start_line).toBeGreaterThanOrEqual(1);
      expect(chunk.end_line).toBeGreaterThanOrEqual(chunk.start_line);
    }
  });

  it('chunks cover entire file without gaps — first chunk starts at line 1 and each next starts where previous ended + 1', async () => {
    const chunks = await chunker.chunkFile(TS_FIXTURE);
    expect(chunks[0]!.start_line).toBe(1);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.start_line).toBe(chunks[i - 1]!.end_line + 1);
    }
  });

  it('with small maxLines, extracts function_name from boundary lines', async () => {
    const small = new AstChunker({ maxLines: 6, maxChars: 4000 });
    const chunks = await small.chunkFile(TS_FIXTURE);
    const names = chunks.map((c) => c.ast_metadata.function_name).filter(Boolean);
    // The TS fixture has add, subtract, multiply + class Calculator
    expect(names.length).toBeGreaterThan(0);
  });

  it('no chunk has empty raw_text', async () => {
    const chunks = await chunker.chunkFile(TS_FIXTURE);
    for (const chunk of chunks) {
      expect(chunk.raw_text.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('AstChunker — Python', () => {
  const chunker = new AstChunker({ maxLines: 120, maxChars: 4000 });

  it('produces at least one chunk', async () => {
    const chunks = await chunker.chunkFile(PY_FIXTURE);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('all chunks have language=python', async () => {
    const chunks = await chunker.chunkFile(PY_FIXTURE);
    expect(chunks.every((c) => c.ast_metadata.language === 'python')).toBe(true);
  });

  it('no chunk exceeds maxChars', async () => {
    const chunks = await chunker.chunkFile(PY_FIXTURE);
    for (const chunk of chunks) expect(chunk.raw_text.length).toBeLessThanOrEqual(4000);
  });

  it('detects at least one named boundary (function_definition, class_definition, or method)', async () => {
    const small = new AstChunker({ maxLines: 5, maxChars: 4000 });
    const chunks = await small.chunkFile(PY_FIXTURE);
    const hasNamed = chunks.some((c) => c.ast_metadata.function_name || c.ast_metadata.class_name);
    expect(hasNamed).toBe(true);
  });
});

describe('AstChunker — unknown extension', () => {
  const tmpFiles: string[] = [];
  afterEach(() => { for (const f of tmpFiles.splice(0)) fs.rmSync(f, { force: true }); });

  it('falls back to code_block node_type for unknown extension', async () => {
    const tmp = path.join(os.tmpdir(), `test-${Date.now()}.xyz`);
    tmpFiles.push(tmp);
    fs.writeFileSync(tmp, 'some content\nmore content\n');
    const chunks = await new AstChunker().chunkFile(tmp);
    for (const chunk of chunks) {
      expect(chunk.ast_metadata.node_type).toBe('code_block');
    }
  });

  it('returns empty array for non-existent file', async () => {
    const chunks = await new AstChunker().chunkFile('/nonexistent/path/file.ts');
    expect(chunks).toHaveLength(0);
  });
});
