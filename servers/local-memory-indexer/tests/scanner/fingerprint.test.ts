import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../src/storage/sqlite.js';
import { FingerprintsRepo } from '../../src/storage/repositories/FingerprintsRepo.js';
import { ChunksQueueRepo } from '../../src/storage/repositories/ChunksQueueRepo.js';
import { FingerprintDiffer } from '../../src/indexer/scanner/FingerprintDiffer.js';
import { SCHEMA_VERSION } from '../../src/constants.js';
import type Database from 'better-sqlite3';

function makeFileRecord(filePath: string) {
  const stat = fs.statSync(filePath, { bigint: true });
  return { file_path: filePath, size_bytes: Number(stat.size), mtime_ns: stat.mtimeNs };
}

describe('FingerprintDiffer — incremental indexing', () => {
  let projectDir: string;
  let db: Database.Database;
  let fps: FingerprintsRepo;
  let chunks: ChunksQueueRepo;
  let differ: FingerprintDiffer;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmi-fp-'));
    db = openDb(projectDir);
    fps = new FingerprintsRepo(db);
    chunks = new ChunksQueueRepo(db);
    differ = new FingerprintDiffer(db, projectDir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('new file → status pending_parse', async () => {
    const file = path.join(projectDir, 'a.ts');
    fs.writeFileSync(file, 'export const x = 1;');

    const results = await differ.diff([makeFileRecord(file)]);
    const result = results.find((r) => r.file_path === file);

    expect(result?.status).toBe('new');
    expect(fps.getByPath(projectDir, file)?.status).toBe('pending_parse');
  });

  it('unchanged file → up_to_date on second run', async () => {
    const file = path.join(projectDir, 'b.ts');
    fs.writeFileSync(file, 'export const y = 2;');

    await differ.diff([makeFileRecord(file)]); // first run
    const results = await differ.diff([makeFileRecord(file)]); // second run
    const result = results.find((r) => r.file_path === file);

    expect(result?.status).toBe('up_to_date');
  });

  it('changed file → pending_parse and old chunks → stale', async () => {
    const file = path.join(projectDir, 'c.ts');
    fs.writeFileSync(file, 'export function foo() {}');

    // First index: creates fingerprint
    await differ.diff([makeFileRecord(file)]);
    fps.updateStatus(projectDir, file, 'parsed');

    // Insert a chunk representing the old version of this file
    const now = Date.now();
    chunks.insertBatch([{
      chunk_id:         'old-chunk-1',
      project_path:     projectDir,
      file_path:        file,
      start_line:       1,
      end_line:         1,
      raw_text:         'export function foo() {}',
      content_hash:     'oldhash',
      embedding_status: 'embedded',
      priority:         1,
      created_at:       now,
      updated_at:       now,
      schema_version:   SCHEMA_VERSION,
    }]);

    // Modify the file
    await new Promise((r) => setTimeout(r, 10)); // ensure mtime changes on fast filesystems
    fs.writeFileSync(file, 'export function foo() { return 42; }');

    const results = await differ.diff([makeFileRecord(file)]);
    const result = results.find((r) => r.file_path === file);

    expect(result?.status).toBe('pending_parse');
    // Old embedded chunk must be marked stale
    const row = db.prepare(`SELECT embedding_status FROM chunks_queue WHERE chunk_id = 'old-chunk-1'`)
      .get() as { embedding_status: string } | undefined;
    expect(row?.embedding_status).toBe('stale');
  });

  it('force=true marks all files as pending_parse regardless of fingerprint', async () => {
    const file = path.join(projectDir, 'd.ts');
    fs.writeFileSync(file, 'const x = 1;');

    // First run to establish fingerprint
    await differ.diff([makeFileRecord(file)]);
    fps.updateStatus(projectDir, file, 'parsed');

    // Second run with force=true
    const results = await differ.diff([makeFileRecord(file)], true);
    const result = results.find((r) => r.file_path === file);

    expect(result?.status).not.toBe('up_to_date');
    expect(fps.getByPath(projectDir, file)?.status).toBe('pending_parse');
  });

  it('multiple files: unchanged ones skipped, changed ones re-queued', async () => {
    const fileA = path.join(projectDir, 'a.ts');
    const fileB = path.join(projectDir, 'b.ts');
    fs.writeFileSync(fileA, 'const a = 1;');
    fs.writeFileSync(fileB, 'const b = 2;');

    // First run
    await differ.diff([makeFileRecord(fileA), makeFileRecord(fileB)]);

    // Modify only fileB
    await new Promise((r) => setTimeout(r, 10));
    fs.writeFileSync(fileB, 'const b = 999;');

    const results = await differ.diff([makeFileRecord(fileA), makeFileRecord(fileB)]);

    const resultA = results.find((r) => r.file_path === fileA);
    const resultB = results.find((r) => r.file_path === fileB);

    expect(resultA?.status).toBe('up_to_date');
    expect(resultB?.status).toBe('pending_parse');
  });
});
