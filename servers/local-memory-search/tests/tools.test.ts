import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SearchEngine, type QueryEmbedderLike } from '../src/search/SearchEngine.js';
import { createSearchTools } from '../src/tools/index.js';
import type { ToolDefinition } from '../src/mcp/runtime.js';
import { seedLanceDb, seedSqlite, VECTOR_DIM, type SeedChunk } from './fixtures.js';

let dataRoot: string;
const PROJECT = '/virtual/tools-project';

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

const CHUNKS: SeedChunk[] = [
  { chunk_id: 'h1', file_path: '/virtual/tools-project/src/a.ts', start_line: 1, end_line: 10, text: 'export function workflowAliases() { return bashrc; }', vector: unit(0), function_name: 'workflowAliases' },
  { chunk_id: 'h2', file_path: '/virtual/tools-project/src/a.ts', start_line: 11, end_line: 20, text: 'function helper() { return 1; }', vector: unit(1), function_name: 'helper' },
  { chunk_id: 'h3', file_path: '/virtual/tools-project/src/b.ts', start_line: 1, end_line: 10, text: 'database connection pool', vector: unit(2) },
];

function unit(i: number): number[] {
  const v = new Array(VECTOR_DIM).fill(0);
  v[i] = 1;
  return v;
}

let tools: Map<string, ToolDefinition>;
let engine: SearchEngine;

beforeAll(async () => {
  dataRoot = await mkdtemp(join(tmpdir(), 'lms-tools-'));
  process.env['LOCAL_VECTOR_SEARCH_DATA_ROOT'] = dataRoot;
  process.env['LOCAL_VECTOR_SEARCH_DEFAULT_PROJECT'] = PROJECT;
  await seedLanceDb(dataRoot, PROJECT, CHUNKS, true);
  seedSqlite(dataRoot, PROJECT, CHUNKS);
  engine = new SearchEngine(fakeEmbedder);
  tools = new Map(createSearchTools(engine).map((t) => [t.name, t]));
});

afterAll(async () => {
  engine.close();
  await rm(dataRoot, { recursive: true, force: true });
});

const call = (name: string, args: Record<string, unknown>) => tools.get(name)!.handler(args as never);

describe('tool catalog', () => {
  it('exposes the read-only catalog and NOT delete_project_index', () => {
    const names = [...tools.keys()];
    expect(names).toContain('search_hybrid');
    expect(names).toContain('retrieve_context_pack');
    expect(names).toContain('doctor_index');
    expect(names).not.toContain('delete_project_index');
    expect(names).not.toContain('start_indexing');
  });
});

describe('search_hybrid envelope (frozen v1.0 shape)', () => {
  it('returns summary-first envelope with strategy_weights + pagination', async () => {
    const res = await call('search_hybrid', { query: 'workflow aliases bashrc', project_path: PROJECT, limit: 2 });
    expect(typeof res.summary).toBe('string');
    expect(res.source_of_truth).toBe('local_index');
    expect(res.strategy_weights?.mode).toBe('hybrid');
    expect(res.pagination?.limit).toBe(2);
    const data = res.data as { results: { file_path: string; chunk_id: string }[] };
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results[0]!.file_path).toContain('a.ts');
  });

  it('summary_only suppresses result bodies', async () => {
    const res = await call('search_hybrid', { query: 'workflow', project_path: PROJECT, summary_only: true });
    expect((res.data as { results: unknown[] }).results).toHaveLength(0);
    expect(res.pagination).toBeDefined();
  });
});

describe('get_chunk / read_chunk_neighbors', () => {
  it('fetches a chunk by id and 404s on unknown id', async () => {
    const ok = await call('get_chunk', { chunk_id: 'h1', project_path: PROJECT });
    expect((ok.data as { chunk_id: string }).chunk_id).toBe('h1');

    const miss = await call('get_chunk', { chunk_id: 'nope', project_path: PROJECT });
    expect((miss.data as { error_code: string }).error_code).toBe('CHUNK_NOT_FOUND');
  });

  it('returns adjacent chunks within the same file', async () => {
    const res = await call('read_chunk_neighbors', { chunk_id: 'h1', project_path: PROJECT, before: 1, after: 1 });
    const data = res.data as { target_chunk: { chunk_id: string }; neighbors: { after: { chunk_id: string }[] } };
    expect(data.target_chunk.chunk_id).toBe('h1');
    expect(data.neighbors.after[0]?.chunk_id).toBe('h2');
  });
});

describe('retrieve_context_pack budget', () => {
  it('respects the max_chars budget and reports usage', async () => {
    const res = await call('retrieve_context_pack', {
      query: 'workflow aliases', project_path: PROJECT, max_chars: 40, include_neighbors: false,
    });
    const data = res.data as { budget: { max_chars: number; used_chars: number; truncated: boolean } };
    expect(data.budget.max_chars).toBe(40);
    expect(data.budget.used_chars).toBeLessThanOrEqual(40);
  });
});

describe('diagnostics', () => {
  it('health_check reports ready with embedding backend', async () => {
    const res = await call('health_check', { project_path: PROJECT, verbose: true });
    const data = res.data as { status: string; lancedb_available: boolean; schema_version: string };
    expect(data.status).toBe('ready');
    expect(data.lancedb_available).toBe(true);
    expect(data.schema_version).toBe('1.0');
  });

  it('index_status reports counts', async () => {
    const res = await call('index_status', { project_path: PROJECT });
    const data = res.data as { indexed_files: number; compatible_vectors: number };
    expect(data.indexed_files).toBeGreaterThan(0);
    expect(data.compatible_vectors).toBe(3);
  });

  it('doctor_index returns structured checks (read-only, no auto_fix)', async () => {
    const res = await call('doctor_index', { project_path: PROJECT, auto_fix: true });
    const data = res.data as {
      healthy: boolean;
      checks: { name: string; status: string }[];
      auto_fixed: unknown[];
      note?: string;
    };
    expect(Array.isArray(data.checks)).toBe(true);
    expect(data.checks.length).toBeGreaterThanOrEqual(5);
    expect(data.checks[0]).toHaveProperty('status');
    expect(data.auto_fixed).toHaveLength(0);
    expect(data.note).toMatch(/read-only/i);
  });

  it('explain_match breaks down the score for a returned chunk', async () => {
    const res = await call('explain_match', { query: 'workflow aliases bashrc', result_id: 'h1', project_path: PROJECT, verbosity: 'full' });
    const data = res.data as { score_breakdown?: { identifier_boost: number } };
    expect(data.score_breakdown).toBeDefined();
  });
});
