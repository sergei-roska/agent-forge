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
    const storedFps = this.fps.listByProject(this.projectPath);
    const storedMap = new Map<string, FileFingerprint>();
    for (const fp of storedFps) {
      storedMap.set(fp.file_path, fp);
    }

    const results: DiffResult[] = [];
    const pendingHash: { file: FileRecord; stored: FileFingerprint | undefined }[] = [];
    const upserts: FileFingerprint[] = [];
    
    // Fast path: size + mtime match
    for (const file of files) {
      const stored = storedMap.get(file.file_path);
      
      if (!force && stored && this.quickMatch(stored, file)) {
        upserts.push({
          ...stored,
          status: 'up_to_date',
          last_indexed_at: Date.now(),
        });
        results.push({ file_path: file.file_path, status: 'up_to_date' });
      } else {
        pendingHash.push({ file, stored });
      }
    }

    // Slow path: parallel hash computation
    const CONCURRENCY = 16;
    let currentIndex = 0;
    const now = Date.now();
    const stalePaths: string[] = [];

    const worker = async () => {
      while (currentIndex < pendingHash.length) {
        const index = currentIndex++;
        const { file, stored } = pendingHash[index]!;

        let sha256: string;
        try {
          const fp = await computeFingerprint(file.file_path);
          sha256 = fp.sha256;
        } catch {
          // Unreadable file — skip silently
          results.push({ file_path: file.file_path, status: 'up_to_date' });
          continue;
        }

        if (!force && stored?.content_hash_sha256 === sha256) {
          upserts.push({
            project_path: this.projectPath,
            file_path: file.file_path,
            size_bytes: file.size_bytes,
            mtime_ns: Number(file.mtime_ns),
            content_hash_sha256: sha256,
            status: 'up_to_date',
            last_indexed_at: now,
            schema_version: SCHEMA_VERSION,
          });
          results.push({ file_path: file.file_path, status: 'up_to_date' });
        } else {
          upserts.push({
            project_path: this.projectPath,
            file_path: file.file_path,
            size_bytes: file.size_bytes,
            mtime_ns: Number(file.mtime_ns),
            content_hash_sha256: sha256,
            status: 'pending_parse',
            retry_count: 0,
            last_indexed_at: now,
            schema_version: SCHEMA_VERSION,
          });
          stalePaths.push(file.file_path);
          results.push({
            file_path: file.file_path,
            status: stored ? 'pending_parse' : 'new'
          });
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, pendingHash.length) },
      () => worker()
    );
    await Promise.all(workers);

    // Apply batch updates inside a single transaction
    withImmediate(this.db, () => {
      for (const fp of upserts) {
        this.fps.upsert(fp);
      }
      if (stalePaths.length > 0) {
        const stmt = this.db.prepare(
          `UPDATE chunks_queue
           SET embedding_status = 'stale', updated_at = ?
           WHERE project_path = ? AND file_path = ? AND embedding_status != 'stale'`
        );
        for (const fp of stalePaths) {
          stmt.run(now, this.projectPath, fp);
        }
      }
    });

    return results;
  }

  private quickMatch(stored: FileFingerprint, file: FileRecord): boolean {
    return (
      stored.size_bytes === file.size_bytes &&
      BigInt(stored.mtime_ns ?? 0) === file.mtime_ns
    );
  }
}
