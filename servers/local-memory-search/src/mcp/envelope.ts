/**
 * Foundation-contract response envelope for the read-only search service
 * (Spec 08.2 §2.3 step 8 "Summary-First Response").
 *
 * Every tool returns a `summary` first, then `data`, then optional metadata.
 * The shape is FROZEN at contract v1.0 — do not reorder or rename top-level keys.
 */
export interface Pagination {
  limit: number;
  offset: number;
  total_returned: number;
  has_more?: boolean;
  gap_cutoff_applied?: boolean;
}

export type SearchMode = 'hybrid' | 'semantic_only' | 'keyword_only' | 'sqlite_fallback';

export interface StrategyWeights {
  alpha: number;
  rrf_k: number;
  mode: SearchMode;
}

export interface McpResponseEnvelope {
  summary: string;
  data: unknown;
  strategy_weights?: StrategyWeights;
  pagination?: Pagination;
  warnings?: string[];
  /** Present on the empty-index path (Spec 08.2 §5.3). */
  next_steps?: string;
  source_of_truth?: 'local_index' | 'sqlite_fallback' | 'none';
}

export interface OkOptions {
  warnings?: string[];
  strategy_weights?: StrategyWeights;
  pagination?: Pagination;
  next_steps?: string;
  source_of_truth?: McpResponseEnvelope['source_of_truth'];
}

/** Build a successful, summary-first envelope. */
export function ok(summary: string, data: unknown, opts: OkOptions = {}): McpResponseEnvelope {
  return {
    summary,
    data,
    ...(opts.strategy_weights ? { strategy_weights: opts.strategy_weights } : {}),
    ...(opts.pagination ? { pagination: opts.pagination } : {}),
    ...(opts.warnings?.length ? { warnings: opts.warnings } : {}),
    ...(opts.next_steps ? { next_steps: opts.next_steps } : {}),
    source_of_truth: opts.source_of_truth ?? 'local_index',
  };
}

/**
 * Structured non-throwing error envelope. Used only for genuine 4xx-equivalent
 * conditions that are NOT degradable (e.g. CHUNK_NOT_FOUND). Search tools never
 * surface 500-equivalent internal errors to the agent (Spec 08.2 §6).
 */
export function structuredError(
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): McpResponseEnvelope {
  return {
    summary: `${code}: ${message}`,
    data: { error_code: code, message, ...extra },
    source_of_truth: 'none',
  };
}
