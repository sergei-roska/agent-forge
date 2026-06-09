import type Database from 'better-sqlite3';
import { withImmediate } from '../sqlite.js';
import { SCHEMA_VERSION } from '../../constants.js';

export interface ChunkQueueRow {
  chunk_id: string;
  project_path: string;
  file_path: string;
  start_line?: number;
  end_line?: number;
  raw_text?: string;
  enriched_text?: string;
  content_hash?: string;
  ast_metadata?: string;
  embedding_status?: string;
  priority?: number;
  retry_count?: number;
  created_at?: number;
  updated_at?: number;
  schema_version: string;
}

export class ChunksQueueRepo {
  constructor(private readonly db: Database.Database) {}

  insertBatch(chunks: ChunkQueueRow[]): void {
    if (chunks.length === 0) return;

    // Validate schema_version on every chunk before writing to SQLite.
    for (const chunk of chunks) {
      if (!chunk.schema_version) {
        throw new Error(
          `Chunk ${chunk.chunk_id} is missing required field 'schema_version'. ` +
            'All chunkers must set schema_version = SCHEMA_VERSION.',
        );
      }
      if (chunk.schema_version !== SCHEMA_VERSION) {
        console.warn(
          `[schema_version] Chunk ${chunk.chunk_id} has schema_version='${
            chunk.schema_version
          }', expected '${SCHEMA_VERSION}'. Possible version drift.`,
        );
      }
    }

    const stmt = this.db.prepare(
      `INSERT INTO chunks_queue
        (chunk_id, project_path, file_path, start_line, end_line,
         raw_text, enriched_text, content_hash, ast_metadata,
         embedding_status, priority, retry_count, created_at, updated_at, schema_version)
       VALUES
        (@chunk_id, @project_path, @file_path, @start_line, @end_line,
         @raw_text, @enriched_text, @content_hash, @ast_metadata,
         @embedding_status, @priority, @retry_count, @created_at, @updated_at, @schema_version)
       ON CONFLICT(chunk_id) DO UPDATE SET
        raw_text         = excluded.raw_text,
        enriched_text    = excluded.enriched_text,
        content_hash     = excluded.content_hash,
        ast_metadata     = excluded.ast_metadata,
        embedding_status = excluded.embedding_status,
        priority         = excluded.priority,
        updated_at       = excluded.updated_at,
        schema_version   = excluded.schema_version`,
    );
    withImmediate(this.db, () => {
      for (const chunk of chunks) {
        const row: Required<ChunkQueueRow> = {
          start_line:       null as unknown as number,
          end_line:         null as unknown as number,
          raw_text:         null as unknown as string,
          enriched_text:    null as unknown as string,
          content_hash:     null as unknown as string,
          ast_metadata:     null as unknown as string,
          embedding_status: null as unknown as string,
          priority:         1,
          retry_count:      0,
          created_at:       null as unknown as number,
          updated_at:       null as unknown as number,
          ...chunk,
        };
        stmt.run(row);
      }
    });
  }

  getPendingBatch(projectPath: string, batchSize: number): ChunkQueueRow[] {
    return this.db
      .prepare(
        `SELECT * FROM chunks_queue
         WHERE project_path = ? AND embedding_status = 'pending'
         ORDER BY priority DESC, created_at ASC
         LIMIT ?`,
      )
      .all(projectPath, batchSize) as ChunkQueueRow[];
  }

  markEmbedded(chunkIds: string[]): void {
    if (chunkIds.length === 0) return;
    const now = Date.now();
    const placeholders = chunkIds.map(() => '?').join(', ');
    withImmediate(this.db, () => {
      this.db
        .prepare(
          `UPDATE chunks_queue
           SET embedding_status = 'embedded', updated_at = ?
           WHERE chunk_id IN (${placeholders})`,
        )
        .run(now, ...chunkIds);
    });
  }

  markError(chunkIds: string[]): void {
    if (chunkIds.length === 0) return;
    const now = Date.now();
    const placeholders = chunkIds.map(() => '?').join(', ');
    withImmediate(this.db, () => {
      this.db
        .prepare(
          `UPDATE chunks_queue
           SET embedding_status = 'error',
               retry_count = retry_count + 1,
               updated_at = ?
           WHERE chunk_id IN (${placeholders})`,
        )
        .run(now, ...chunkIds);
    });
  }

  markStaleByFile(projectPath: string, filePath: string): void {
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE chunks_queue
         SET embedding_status = 'stale', updated_at = ?
         WHERE project_path = ? AND file_path = ? AND embedding_status != 'stale'`,
      )
      .run(now, projectPath, filePath);
  }

  countPending(projectPath: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as n FROM chunks_queue
         WHERE project_path = ? AND embedding_status = 'pending'`,
      )
      .get(projectPath) as { n: number };
    return row.n;
  }

  countEmbedded(projectPath: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as n FROM chunks_queue
         WHERE project_path = ? AND embedding_status = 'embedded'`,
      )
      .get(projectPath) as { n: number };
    return row.n;
  }

  setEnrichedText(chunkId: string, enrichedText: string): void {
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE chunks_queue SET enriched_text = ?, updated_at = ? WHERE chunk_id = ?`,
      )
      .run(enrichedText, now, chunkId);
  }
}
