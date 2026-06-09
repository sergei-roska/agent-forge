import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doctorIndex } from '../src/health/doctor.js';
import { LanceReader } from '../src/storage/LanceReader.js';
import { SqliteReader } from '../src/storage/SqliteReader.js';
import { seedLanceDb, seedSqlite, slugify, type SeedChunk } from './fixtures.js';

let dataRoot: string;
let projectDir: string;
let filePath: string;

const CHUNKS = (): SeedChunk[] => [
  {
    chunk_id: 'd1',
    file_path: filePath,
    start_line: 1,
    end_line: 5,
    text: 'export function doctorProbe() {}',
    vector: [1, 0, 0, 0, 0, 0, 0, 0],
  },
];

beforeAll(async () => {
  dataRoot = await mkdtemp(join(tmpdir(), 'lms-doctor-'));
  projectDir = join(dataRoot, 'repo');
  filePath = join(projectDir, 'src', 'a.ts');
  await mkdir(join(projectDir, 'src'), { recursive: true });
  await writeFile(filePath, 'export function doctorProbe() {}');

  process.env['LOCAL_VECTOR_SEARCH_DATA_ROOT'] = dataRoot;
  await seedLanceDb(dataRoot, projectDir, CHUNKS(), true);
  seedSqlite(dataRoot, projectDir, CHUNKS());
});

afterAll(async () => {
  await rm(dataRoot, { recursive: true, force: true });
});

describe('doctorIndex', () => {
  it('reports healthy for a consistent seeded index', async () => {
    const lance = await LanceReader.open(projectDir);
    const sqlite = SqliteReader.open(projectDir);
    const result = await doctorIndex({ projectPath: projectDir, lance, sqlite });

    expect(result.healthy).toBe(true);
    expect(result.checks.length).toBeGreaterThanOrEqual(7);
    expect(result.issues.filter((i) => i.status === 'error')).toHaveLength(0);
    expect(result.checks.some((c) => c.name === 'schema_version' && c.status === 'healthy')).toBe(true);
    expect(result.checks.some((c) => c.name === 'fts_index' && c.status === 'healthy')).toBe(true);
  });

  it('detects schema version mismatch in SQLite', async () => {
    const dbPath = join(dataRoot, slugify(projectDir), 'state.db');
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);
    db.prepare(`UPDATE chunks_queue SET schema_version = 'unknown' WHERE chunk_id = 'd1'`).run();
    db.close();

    const lance = await LanceReader.open(projectDir);
    const sqlite = SqliteReader.open(projectDir);
    const result = await doctorIndex({ projectPath: projectDir, lance, sqlite });

    expect(result.healthy).toBe(false);
    expect(result.issues.some((i) => i.name === 'sqlite_schema_version')).toBe(true);
    sqlite?.close();
  });
});
