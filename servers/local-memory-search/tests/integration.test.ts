import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as lancedb from '@lancedb/lancedb';
import { SearchEngine, type QueryEmbedderLike } from '../src/search/SearchEngine.js';
import { guardReadOnly } from '../src/storage/LanceReader.js';
import { ReadOnlyViolationError } from '../src/errors/codes.js';
import { seedLanceDb, seedSqlite, slugify, VECTOR_DIM, type SeedChunk } from './fixtures.js';

let dataRoot: string;
const PROJECT = '/virtual/project-alpha';

/** Deterministic embedder: returns a fixed vector emphasising dimension 0. */
const fakeEmbedder: QueryEmbedderLike = {
  async embed() {
    const v = new Array(VECTOR_DIM).fill(0);
    v[0] = 1;
    return { vector: v, backend: 'ollama' };
  },
  async probe() {
    return { available: true, backend: 'ollama' };
  },
};

/** Embedder that always fails — exercises the §5.5 keyword-only degradation. */
const deadEmbedder: QueryEmbedderLike = {
  async embed(): Promise<never> {
    throw Object.assign(new Error('no backend'), { code: 'EMBEDDING_BACKEND_UNAVAILABLE' });
  },
  async probe() {
    return { available: false };
  },
};

const CHUNKS: SeedChunk[] = [
  { chunk_id: 'a', file_path: '/virtual/project-alpha/src/alpha.ts', start_line: 1, end_line: 5, text: 'workflow aliases bashrc zshrc profile', vector: unit(0), function_name: 'workflowAliases' },
  { chunk_id: 'b', file_path: '/virtual/project-alpha/src/beta.ts', start_line: 1, end_line: 5, text: 'database connection pool settings', vector: unit(1) },
  { chunk_id: 'c', file_path: '/virtual/project-alpha/src/gamma.ts', start_line: 1, end_line: 5, text: 'workflow scheduler cron timing', vector: unit(2) },
];

function unit(i: number): number[] {
  const v = new Array(VECTOR_DIM).fill(0);
  v[i] = 1;
  return v;
}

beforeAll(async () => {
  dataRoot = await mkdtemp(join(tmpdir(), 'lms-it-'));
  process.env['LOCAL_VECTOR_SEARCH_DATA_ROOT'] = dataRoot;
  process.env['LOCAL_VECTOR_SEARCH_DEFAULT_PROJECT'] = PROJECT;
  await seedLanceDb(dataRoot, PROJECT, CHUNKS, true);
  seedSqlite(dataRoot, PROJECT, CHUNKS);
});

afterAll(async () => {
  await rm(dataRoot, { recursive: true, force: true });
});

describe('hybrid search (LanceDB vector + FTS)', () => {
  it('returns the strongest match first and is deterministic', async () => {
    const engine = new SearchEngine(fakeEmbedder);
    const r1 = await engine.retrieve({
      query: 'workflow aliases bashrc', projectPath: PROJECT,
      alpha: 0.65, rrfK: 60, recencyWeight: 0.1, gapThreshold: 0.25, legs: 'hybrid',
    });
    expect(r1.stats.mode).toBe('hybrid');
    expect(r1.results.length).toBeGreaterThan(0);
    expect(r1.results[0]!.row.file_path).toContain('alpha.ts');

    const r2 = await engine.retrieve({
      query: 'workflow aliases bashrc', projectPath: PROJECT,
      alpha: 0.65, rrfK: 60, recencyWeight: 0.1, gapThreshold: 0.25, legs: 'hybrid', cacheBust: true,
    });
    expect(r2.results.map((r) => r.row.chunk_id)).toEqual(r1.results.map((r) => r.row.chunk_id));
    engine.close();
  });

  it('degrades to keyword-only when embedding is unavailable (§5.5)', async () => {
    const engine = new SearchEngine(deadEmbedder);
    const r = await engine.retrieve({
      query: 'workflow scheduler', projectPath: PROJECT,
      alpha: 0.65, rrfK: 60, recencyWeight: 0, gapThreshold: 0.25, legs: 'hybrid', cacheBust: true,
    });
    expect(r.stats.mode).toBe('keyword_only');
    expect(r.stats.alpha).toBe(0);
    expect(r.stats.warnings.some((w) => w.includes('embedding_unavailable'))).toBe(true);
    expect(r.results.length).toBeGreaterThan(0);
    engine.close();
  });

  it('reports INDEX_EMPTY when filters exclude every row', async () => {
    const engine = new SearchEngine(fakeEmbedder);
    const r = await engine.retrieve({
      query: 'workflow', projectPath: PROJECT,
      alpha: 0.65, rrfK: 60, recencyWeight: 0, gapThreshold: 0.25, legs: 'hybrid',
      filters: { language: 'cobol' }, cacheBust: true,
    });
    expect(r.empty).toBe(true);
    expect(r.results).toHaveLength(0);
    engine.close();
  });
});

describe('SQLite fallback (no LanceDB)', () => {
  const FALLBACK_PROJECT = '/virtual/project-sqliteonly';
  beforeAll(() => {
    seedSqlite(dataRoot, FALLBACK_PROJECT, CHUNKS.map((c) => ({ ...c, file_path: c.file_path.replace('project-alpha', 'project-sqliteonly') })));
  });

  it('degrades to sqlite_fallback with keyword matches', async () => {
    const engine = new SearchEngine(fakeEmbedder);
    const r = await engine.retrieve({
      query: 'database connection', projectPath: FALLBACK_PROJECT,
      alpha: 0.65, rrfK: 60, recencyWeight: 0, gapThreshold: 0.25, legs: 'hybrid', cacheBust: true,
    });
    expect(r.stats.mode).toBe('sqlite_fallback');
    expect(r.stats.warnings.some((w) => w.includes('lancedb_connect_failed'))).toBe(true);
    expect(r.results.some((x) => x.row.file_path.includes('beta.ts'))).toBe(true);
    engine.close();
  });
});

describe('read-only enforcement (§2.2 / §6)', () => {
  it('throws READONLY_VIOLATION on a mutating LanceDB call', async () => {
    const dir = join(dataRoot, slugify(PROJECT), 'lancedb');
    const conn = await lancedb.connect(dir);
    const guarded = guardReadOnly(await conn.openTable('chunks'));
    expect(() => (guarded as unknown as { add: () => void }).add()).toThrow(ReadOnlyViolationError);
    expect(() => (guarded as unknown as { delete: () => void }).delete()).toThrow(ReadOnlyViolationError);
    expect(() => (guarded as unknown as { mergeInsert: () => void }).mergeInsert()).toThrow(ReadOnlyViolationError);
    // The thrown error carries the READONLY_VIOLATION code.
    try {
      (guarded as unknown as { createIndex: () => void }).createIndex();
    } catch (e) {
      expect((e as ReadOnlyViolationError).code).toBe('READONLY_VIOLATION');
    }
  });
});
