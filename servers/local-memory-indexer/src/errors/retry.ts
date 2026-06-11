import { IndexerError, ErrorCode } from './codes.js';

/** Backoff delays for LanceDB lock errors per spec §5.1: {1s, 2s, 4s, 8s}. */
export const LOCK_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000] as const;

export function isLockError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes('lock') || msg.includes('conflict') || msg.includes('busy');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retry wrapper for LanceDB operations that may fail with a lock error.
 * Strategy per spec §5.1: exponential backoff {1s, 2s, 4s, 8s}, max 4 retries.
 * After all retries exhausted, throws IndexerError DATABASE_LOCKED.
 */
export async function withLanceDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= LOCK_BACKOFF_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isLockError(err)) throw err;
      if (attempt === LOCK_BACKOFF_MS.length) {
        throw new IndexerError(
          ErrorCode.DATABASE_LOCKED,
          `LanceDB write lock could not be acquired after ${LOCK_BACKOFF_MS.length} retries ` +
            `(${LOCK_BACKOFF_MS.reduce((a, b) => a + b, 0) / 1000}s total). ` +
            'Run checkpointed. Resume with start_indexing.',
          {
            retry_after_hint_seconds: 60,
            original_message: err instanceof Error ? err.message : String(err),
          },
        );
      }
      await sleep(LOCK_BACKOFF_MS[attempt]!);
    }
  }
  /* istanbul ignore next */
  throw new Error('unreachable');
}
