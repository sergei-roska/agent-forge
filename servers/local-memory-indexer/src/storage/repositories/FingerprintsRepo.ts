import type Database from 'better-sqlite3';
import { withImmediate } from '../sqlite.js';

export interface FileFingerprint {
  project_path: string;
  file_path: string;
  size_bytes?: number;
  mtime_ns?: number;
  content_hash_sha256?: string;
  status?: string;
  retry_count?: number;
  last_indexed_at?: number;
  schema_version?: string;
}

export class FingerprintsRepo {
  constructor(private readonly db: Database.Database) {}

  upsert(fp: FileFingerprint): void {
    const row: Required<FileFingerprint> = {
      size_bytes:          null as unknown as number,
      mtime_ns:            null as unknown as number,
      content_hash_sha256: null as unknown as string,
      status:              null as unknown as string,
      retry_count:         0,
      last_indexed_at:     null as unknown as number,
      schema_version:      null as unknown as string,
      ...fp,
    };
    this.db
      .prepare(
        `INSERT INTO file_fingerprints
          (project_path, file_path, size_bytes, mtime_ns, content_hash_sha256,
           status, retry_count, last_indexed_at, schema_version)
         VALUES
          (@project_path, @file_path, @size_bytes, @mtime_ns, @content_hash_sha256,
           @status, @retry_count, @last_indexed_at, @schema_version)
         ON CONFLICT(project_path, file_path) DO UPDATE SET
          size_bytes          = excluded.size_bytes,
          mtime_ns            = excluded.mtime_ns,
          content_hash_sha256 = excluded.content_hash_sha256,
          status              = excluded.status,
          retry_count         = excluded.retry_count,
          last_indexed_at     = excluded.last_indexed_at,
          schema_version      = excluded.schema_version`,
      )
      .run(row);
  }

  upsertBatch(fps: FileFingerprint[]): void {
    if (fps.length === 0) return;
    withImmediate(this.db, () => {
      for (const fp of fps) this.upsert(fp);
    });
  }

  getByPath(projectPath: string, filePath: string): FileFingerprint | undefined {
    return this.db
      .prepare(
        'SELECT * FROM file_fingerprints WHERE project_path = ? AND file_path = ?',
      )
      .get(projectPath, filePath) as FileFingerprint | undefined;
  }

  getPendingParse(projectPath: string): FileFingerprint[] {
    return this.db
      .prepare(
        `SELECT * FROM file_fingerprints
         WHERE project_path = ? AND status IN ('pending_parse', 'error')
           AND retry_count < 3`,
      )
      .all(projectPath) as FileFingerprint[];
  }

  incrementRetry(projectPath: string, filePath: string): void {
    this.db
      .prepare(
        `UPDATE file_fingerprints
         SET retry_count = retry_count + 1
         WHERE project_path = ? AND file_path = ?`,
      )
      .run(projectPath, filePath);
  }

  updateStatus(projectPath: string, filePath: string, status: string): void {
    this.db
      .prepare(
        `UPDATE file_fingerprints SET status = ? WHERE project_path = ? AND file_path = ?`,
      )
      .run(status, projectPath, filePath);
  }
}
