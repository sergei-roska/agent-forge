export interface McpResponseEnvelope {
  summary: string;
  data: unknown;
  warnings?: string[];
  source_of_truth?: string;
}

export function ok(summary: string, data: unknown, warnings?: string[]): McpResponseEnvelope {
  return { summary, data, ...(warnings?.length ? { warnings } : {}), source_of_truth: 'local_index' };
}

export function err(code: string, message: string, details?: Record<string, unknown>): McpResponseEnvelope {
  return {
    summary: `Error: ${message}`,
    data: { error_code: code, message, ...details },
    source_of_truth: 'local_index',
  };
}
