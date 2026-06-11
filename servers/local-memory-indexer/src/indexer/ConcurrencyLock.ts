import type Database from 'better-sqlite3';
import { IndexRunsRepo } from '../storage/repositories/IndexRunsRepo.js';
import { LOCK_TTL_MS } from '../constants.js';

export interface LockAcquired {
  acquired: true;
}

export interface LockDenied {
  acquired: false;
  existing_run_id: string;
  lock_age_seconds: number;
}

export type LockResult = LockAcquired | LockDenied;

/**
 * Per-project concurrency lock: at most one active indexing run per project_path.
 *
 * In-memory Map is the primary source of truth for the current process.
 * On startup the Map is empty, so the SQLite `index_runs` table is consulted
 * to detect runs that were left in 'running' state by a previous crash.
 * Stale locks (> LOCK_TTL_MS) are expired automatically.
 */
export class ConcurrencyLock {
  /** projectPath → runId */
  private readonly active = new Map<string, string>();

  tryAcquire(projectPath: string, db: Database.Database): LockResult {
    const repo = new IndexRunsRepo(db);

    // ── 1. Check in-memory (current process) ──────────────────────────────
    const inMemRunId = this.active.get(projectPath);
    if (inMemRunId) {
      // In-memory Map is authoritative for the current process.
      // If the run isn't in SQLite yet (just created), treat age as 0.
      const run = repo.getById(inMemRunId);
      const ageMs = run?.started_at ? Date.now() - run.started_at : 0;
      if (ageMs < LOCK_TTL_MS) {
        return { acquired: false, existing_run_id: inMemRunId, lock_age_seconds: Math.floor(ageMs / 1000) };
      }
      // TTL expired — treat as stale, release in-memory entry
      this.active.delete(projectPath);
    }

    // ── 2. Check SQLite for cross-restart 'running' records ───────────────
    const persisted = repo.getActiveRun(projectPath);
    if (persisted) {
      const ageMs = persisted.started_at ? Date.now() - persisted.started_at : LOCK_TTL_MS + 1;
      if (ageMs < LOCK_TTL_MS) {
        // Another live process holds the lock
        return { acquired: false, existing_run_id: persisted.run_id, lock_age_seconds: Math.floor(ageMs / 1000) };
      }
      // Stale run left by a crashed process — mark as interrupted
      repo.update(persisted.run_id, { status: 'interrupted', updated_at: Date.now() });
    }

    return { acquired: true };
  }

  acquire(projectPath: string, runId: string): void {
    this.active.set(projectPath, runId);
  }

  release(projectPath: string): void {
    this.active.delete(projectPath);
  }

  isLocked(projectPath: string): boolean {
    return this.active.has(projectPath);
  }
}
