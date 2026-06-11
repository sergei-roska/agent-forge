import type Database from 'better-sqlite3';
import { computeFingerprint } from '../../identity/fingerprint.js';
import { FingerprintsRepo, type FileFingerprint } from '../../storage/repositories/FingerprintsRepo.js';
import { ChunksQueueRepo } from '../../storage/repositories/ChunksQueueRepo.js';
import { SCHEMA_VERSION } from '../../constants.js';
import { withImmediate } from '../../storage/sqlite.js';
import type { FileRecord } from './FileScanner.js';

export type FileStatus = 'up_to_date' | 'pending_parse' | 'new';

export interface DiffResult {
  file_path: string;
  status: FileStatus;
}

/**
 * Diffs scanned files against stored fingerprints.
 *
 * For each file:
 *   - unchanged fingerprint (size + mtime + hash) → marks `up_to_date`, skipped.
 *   - changed or new → marks `pending_parse`; old chunks in chunks_queue → `stale`.
 *
 * Returns the subset of files that need chunking (status = pending_parse | new).
 */
export class FingerprintDiffer {
  private readonly fps: FingerprintsRepo;
  private readonly chunks: ChunksQueueRepo;

  constructor(
    private readonly db: Database.Database,
    private readonly projectPath: string,
  ) {
    this.fps = new FingerprintsRepo(db);
    this.chunks = new ChunksQueueRepo(db);
  }

  async diff(files: FileRecord[], force = false): Promise<DiffResult[]> {
    const pending: DiffResult[] = [];

    for (const file of files) {
      const result = await this.classifyFile(file, force);
      pending.push(result);
    }

    return pending;
  }

  private async classifyFile(file: FileRecord, force: boolean): Promise<DiffResult> {
    const stored = this.fps.getByPath(this.projectPath, file.file_path);

    if (!force && stored && this.quickMatch(stored, file)) {
      // Fast path: size + mtime match — trust without hashing.
      // Still update last_indexed_at so we know it was seen this run.
      this.fps.updateStatus(this.projectPath, file.file_path, 'up_to_date');
      return { file_path: file.file_path, status: 'up_to_date' };
    }

    // Compute full hash to confirm change (or for new file).
    let sha256: string;
    try {
      const fp = await computeFingerprint(file.file_path);
      sha256 = fp.sha256;
    } catch {
      // Unreadable file — skip silently.
      return { file_path: file.file_path, status: 'up_to_date' };
    }

    if (!force && stored?.content_hash_sha256 === sha256) {
      // Content identical despite mtime drift (e.g. checkout) → up_to_date.
      this.fps.upsert({
        project_path: this.projectPath,
        file_path: file.file_path,
        size_bytes: file.size_bytes,
        mtime_ns: Number(file.mtime_ns),
        content_hash_sha256: sha256,
        status: 'up_to_date',
        last_indexed_at: Date.now(),
        schema_version: SCHEMA_VERSION,
      });
      return { file_path: file.file_path, status: 'up_to_date' };
    }

    // File is new or changed — upsert fingerprint + mark old chunks stale.
    withImmediate(this.db, () => {
      this.fps.upsert({
        project_path: this.projectPath,
        file_path: file.file_path,
        size_bytes: file.size_bytes,
        mtime_ns: Number(file.mtime_ns),
        content_hash_sha256: sha256,
        status: 'pending_parse',
        retry_count: 0,
        last_indexed_at: Date.now(),
        schema_version: SCHEMA_VERSION,
      });
      this.chunks.markStaleByFile(this.projectPath, file.file_path);
    });

    const status: FileStatus = stored ? 'pending_parse' : 'new';
    return { file_path: file.file_path, status };
  }

  private quickMatch(stored: FileFingerprint, file: FileRecord): boolean {
    return (
      stored.size_bytes === file.size_bytes &&
      BigInt(stored.mtime_ns ?? 0) === file.mtime_ns
    );
  }
}
