import * as lancedb from '@lancedb/lancedb';
import {
  Schema,
  Field,
  Utf8,
  Int32,
  Int64,
  Float32,
  FixedSizeList,
  List,
  Bool,
} from 'apache-arrow';
import fs from 'node:fs';
import { SCHEMA_VERSION } from '../constants.js';
import { lanceDbDir } from './paths.js';
import { IndexerError, ErrorCode } from '../errors/codes.js';

export const VECTOR_DIM = 1024;
export const CHUNKS_TABLE = 'chunks';

export const CHUNKS_SCHEMA = new Schema([
  new Field('chunk_id',         new Utf8(),  false),
  new Field('project_path',     new Utf8(),  false),
  new Field('file_path',        new Utf8(),  false),
  new Field('start_line',       new Int32(), true),
  new Field('end_line',         new Int32(), true),
  new Field('text',             new Utf8(),  true),
  new Field('raw_text',         new Utf8(),  true),
  new Field('vector',
    new FixedSizeList(VECTOR_DIM, new Field('item', new Float32(), true)),
    true,
  ),
  new Field('language',         new Utf8(),  true),
  new Field('node_type',        new Utf8(),  true),
  new Field('class_name',       new Utf8(),  true),
  new Field('function_name',    new Utf8(),  true),
  new Field('symbol_path',      new Utf8(),  true),
  new Field('content_hash',     new Utf8(),  true),
  new Field('mtime_ns',         new Int64(), true),
  new Field('last_commit_hash', new Utf8(),  true),
  new Field('tags',
    new List(new Field('item', new Utf8(), true)),
    true,
  ),
  new Field('summary',          new Utf8(),  true),
  new Field('schema_version',   new Utf8(),  false),
  new Field('indexed_at',       new Int64(), true),
]);

export async function openChunksTable(projectPath: string): Promise<lancedb.Table> {
  const dir = lanceDbDir(projectPath);
  fs.mkdirSync(dir, { recursive: true });

  const conn = await lancedb.connect(dir);
  const tableNames = await conn.tableNames();

  if (tableNames.includes(CHUNKS_TABLE)) {
    const tbl = await conn.openTable(CHUNKS_TABLE);
    await guardSchemaVersion(tbl, projectPath);
    return tbl;
  }

  return conn.createEmptyTable(CHUNKS_TABLE, CHUNKS_SCHEMA, { existOk: true });
}

async function guardSchemaVersion(tbl: lancedb.Table, projectPath: string): Promise<void> {
  const count = await tbl.countRows();
  if (count === 0) return;

  const safePath = projectPath.replace(/'/g, "''");
  const rows = await tbl
    .query()
    .select(['schema_version'])
    .where(`project_path = '${safePath}'`)
    .limit(100)
    .toArray();

  const versions = [...new Set(rows.map((r) => String(r['schema_version'])))];
  const stale = versions.filter((v) => v !== SCHEMA_VERSION);

  if (stale.length > 0) {
    throw new IndexerError(
      ErrorCode.SCHEMA_MISMATCH,
      `LanceDB table contains records with schema_version=${JSON.stringify(stale)} but indexer requires '${SCHEMA_VERSION}'. ` +
        'Run delete_project_index then start_indexing with force=true.',
      { found_versions: stale, required_version: SCHEMA_VERSION },
    );
  }
}
