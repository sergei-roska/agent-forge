import { z } from 'zod';

export const getIndexingStatusInputShape = {
  run_id: z
    .string()
    .optional()
    .describe('Specific run_id from start_indexing.'),
  project_path: z.string().optional().describe('With run_id omitted: latest run for this project path.'),
} as const;

export const GetIndexingStatusInputSchema = z.object(getIndexingStatusInputShape);
export type GetIndexingStatusInput = z.infer<typeof GetIndexingStatusInputSchema>;

export interface IndexingProgress {
  files_discovered: number;
  files_parsed: number;
  files_total: number;
  chunks_pending: number;
  chunks_embedded: number;
  chunks_total: number;
  percent_complete: number;
  progress_bar: string;
  eta_seconds: number;
  throughput_chunks_per_sec: number;
  phase_detail?: string;
}

export interface BackendCapabilitiesOutput {
  name: 'ollama' | 'transformers_js';
  model: string;
  gpu_accelerated: boolean;
  max_batch_size: number;
  dimensions: number;
  estimated_throughput: string;
}

export interface GetIndexingStatusOutput {
  run_id: string;
  project_path: string;
  phase: 'discovery' | 'embedding' | 'ivf_rebuild' | 'completed';
  status: 'running' | 'paused' | 'completed' | 'interrupted' | 'error';
  progress: IndexingProgress;
  backend_used?: string;
  backend_capabilities?: BackendCapabilitiesOutput;
  enrich_enabled?: boolean;
  started_at: string;
  updated_at: string;
  warnings: string[];
  error?: string;
  schema_version: string;
}

/** Plain JSON Schema for §4.3. */
export const GET_INDEXING_STATUS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    run_id:       { type: 'string', description: 'Specific run_id from start_indexing.' },
    project_path: { type: 'string', description: 'With run_id omitted: latest run for this project path.' },
  },
} as const;
