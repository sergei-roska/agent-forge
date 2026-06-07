import { createHash } from 'node:crypto';
import { RESULT_CACHE_TTL_MS, RESULT_CACHE_MAX_ENTRIES, SCHEMA_VERSION } from '../constants.js';

/**
 * Short-lived in-memory LRU cache for deterministic pagination and repeated
 * identical queries (Spec 08.2 §3.2). Not persisted; never crosses the process
 * boundary to the indexer. Invalidated on schema_version change or cache_bust.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class ResultCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs = RESULT_CACHE_TTL_MS,
    private readonly maxEntries = RESULT_CACHE_MAX_ENTRIES,
  ) {}

  static key(parts: {
    projectPath: string;
    query: string;
    filters?: unknown;
    alpha: number;
    limit: number;
    [k: string]: unknown;
  }): string {
    const canonical = JSON.stringify({ ...parts, schema: SCHEMA_VERSION });
    return createHash('sha256').update(canonical).digest('hex');
  }

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.map.delete(key);
      return undefined;
    }
    // LRU touch: re-insert to move to the end.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: now + this.ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
