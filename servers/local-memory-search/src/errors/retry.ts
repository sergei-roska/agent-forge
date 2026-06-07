/**
 * Read-side lock retry (Spec 08.2 §5.1).
 *
 * Backoff schedule {100ms, 300ms, 900ms} — max 3 attempts, ~1.3s total. After
 * exhaustion the caller does NOT throw to the agent; it degrades (brute-force
 * ANN → FTS). `withReadLockRetry` therefore re-throws the lock error so the
 * caller can drive the degradation cascade.
 */
export const READ_LOCK_BACKOFF_MS = [100, 300, 900] as const;

export function isLockError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes('lock') || msg.includes('conflict') || msg.includes('busy');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retry a read that may hit a transient LanceDB lock. Non-lock errors propagate
 * immediately. After the backoff schedule is exhausted the last lock error is
 * re-thrown so the caller can fall back to brute-force ANN or FTS.
 */
export async function withReadLockRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= READ_LOCK_BACKOFF_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isLockError(err)) throw err;
      lastErr = err;
      if (attempt === READ_LOCK_BACKOFF_MS.length) break;
      await sleep(READ_LOCK_BACKOFF_MS[attempt]!);
    }
  }
  throw lastErr;
}
