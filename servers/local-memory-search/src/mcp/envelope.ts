export type SourceOfTruth = 'runtime' | 'config_sync' | 'codebase' | 'database' | 'browser' | 'mixed';

export interface McpResponseEnvelope<T = unknown> {
  summary: string;
  data: T[];
  pagination?: {
    total: number;
    returned: number;
    limit: number;
    next_cursor: string | null;
    has_more: boolean;
  };
  source_of_truth?: SourceOfTruth;
  warnings?: string[];
}

export function buildEnvelope<T = unknown>(opts: {
  summary: string;
  data: T[];
  total?: number;
  limit?: number;
  cursor?: string | null;
  source?: SourceOfTruth;
  warnings?: string[];
}): McpResponseEnvelope<T> {
  const envelope: McpResponseEnvelope<T> = {
    summary: opts.summary,
    data: opts.data,
  };

  if (opts.total !== undefined || opts.limit !== undefined || opts.cursor !== undefined) {
    const total = opts.total ?? opts.data.length;
    const returned = opts.data.length;
    const limit = opts.limit ?? returned;
    envelope.pagination = {
      total,
      returned,
      limit,
      next_cursor: opts.cursor ?? null,
      has_more: total > returned,
    };
  }

  if (opts.source) {
    envelope.source_of_truth = opts.source;
  }

  if (opts.warnings && opts.warnings.length > 0) {
    envelope.warnings = opts.warnings;
  }

  return envelope;
}
