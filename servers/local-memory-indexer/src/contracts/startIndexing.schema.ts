import { z } from 'zod';

export const startIndexingInputShape = {
  project_path: z.string().describe('Absolute path to the project root.'),
  phases: z
    .array(z.enum(['discovery', 'embedding']))
    .default(['discovery', 'embedding'])
    .describe("Which phases to run. Omit 'embedding' to run Phase 1 only."),
  force: z
    .boolean()
    .default(false)
    .describe('If true, re-index all files regardless of fingerprint match.'),
  include_globs: z
    .array(z.string())
    .optional()
    .describe("Optional allowlist glob patterns (e.g. ['src/**/*.ts'])."),
  exclude_globs: z
    .array(z.string())
    .optional()
    .describe('Additional exclusion glob patterns.'),
  max_file_size_kb: z
    .number()
    .int()
    .default(512)
    .describe('Skip files larger than this size in KB.'),
  batch_size: z
    .number()
    .int()
    .default(20)
    .describe('Embedding batch size for Phase 2.'),
  enrich: z
    .boolean()
    .default(true)
    .describe('Run chunk enrichment (summary + tags) via granite4:3b-h before embedding.'),
  backend: z
    .enum(['ollama', 'transformers_js', 'auto'])
    .default('auto')
    .describe('Embedding backend override.'),
  priority: z
    .enum(['user_focus', 'recent', 'background'])
    .default('background')
    .describe('Sets the embedding priority for all chunks in this run.'),
} as const;

export const StartIndexingInputSchema = z.object(startIndexingInputShape);
export type StartIndexingInput = z.infer<typeof StartIndexingInputSchema>;

export interface StartIndexingOutput {
  run_id: string;
  status: 'started' | 'already_running';
  project_path: string;
  phases: string[];
  message: string;
  /** Present when status = 'already_running' */
  lock_owner?: string;
  lock_age_seconds?: number;
}

/** Plain JSON Schema for §4.1 — used for MCP manifest / documentation. */
export const START_INDEXING_JSON_SCHEMA = {
  type: 'object',
  required: ['project_path'],
  properties: {
    project_path:     { type: 'string',  description: 'Absolute path to the project root.' },
    phases:           { type: 'array', items: { type: 'string', enum: ['discovery', 'embedding'] }, default: ['discovery', 'embedding'] },
    force:            { type: 'boolean', default: false },
    include_globs:    { type: 'array', items: { type: 'string' } },
    exclude_globs:    { type: 'array', items: { type: 'string' } },
    max_file_size_kb: { type: 'integer', default: 512 },
    batch_size:       { type: 'integer', default: 20 },
    enrich:           { type: 'boolean', default: true },
    backend:          { type: 'string', enum: ['ollama', 'transformers_js', 'auto'], default: 'auto' },
    priority:         { type: 'string', enum: ['user_focus', 'recent', 'background'], default: 'background' },
  },
} as const;
