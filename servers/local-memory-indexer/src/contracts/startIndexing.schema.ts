import { z } from 'zod';

export const startIndexingInputShape = {
  project_path: z.string().describe('Absolute project root path.'),
  phases: z
    .array(z.enum(['discovery', 'embedding']))
    .default(['discovery', 'embedding'])
    .describe('Run discovery (scan/chunk), embedding (vectors), or both. Omit embedding for discovery-only.'),
  force: z
    .boolean()
    .default(false)
    .describe('Re-index all files; ignore change fingerprints.'),
  include_globs: z
    .array(z.string())
    .optional()
    .describe('Glob allowlist; index only matching paths (e.g. src/**/*.ts).'),
  exclude_globs: z
    .array(z.string())
    .optional()
    .describe('Extra globs to exclude beyond built-in defaults.'),
  max_file_size_kb: z
    .number()
    .int()
    .default(512)
    .describe('Skip files larger than this (KB).'),
  batch_size: z
    .number()
    .int()
    .default(20)
    .describe('Phase 2 embedding batch size.'),
  enrich: z
    .boolean()
    .default(true)
    .describe('Generate chunk summary + tags via LLM before embedding.'),
  backend: z
    .enum(['ollama', 'transformers_js', 'auto'])
    .default('auto')
    .describe('Embedding backend: ollama | transformers_js | auto.'),
  priority: z
    .enum(['user_focus', 'recent', 'background'])
    .default('background')
    .describe('Embedding queue priority: user_focus | recent | background.'),
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
    project_path:     { type: 'string',  description: 'Absolute project root path.' },
    phases:           { type: 'array', items: { type: 'string', enum: ['discovery', 'embedding'] }, default: ['discovery', 'embedding'], description: 'Run discovery (scan/chunk), embedding (vectors), or both.' },
    force:            { type: 'boolean', default: false, description: 'Re-index all files; ignore change fingerprints.' },
    include_globs:    { type: 'array', items: { type: 'string' }, description: 'Glob allowlist; index only matching paths.' },
    exclude_globs:    { type: 'array', items: { type: 'string' }, description: 'Extra globs to exclude beyond built-in defaults.' },
    max_file_size_kb: { type: 'integer', default: 512, description: 'Skip files larger than this (KB).' },
    batch_size:       { type: 'integer', default: 20, description: 'Phase 2 embedding batch size.' },
    enrich:           { type: 'boolean', default: true, description: 'Generate chunk summary + tags via LLM before embedding.' },
    backend:          { type: 'string', enum: ['ollama', 'transformers_js', 'auto'], default: 'auto', description: 'Embedding backend: ollama | transformers_js | auto.' },
    priority:         { type: 'string', enum: ['user_focus', 'recent', 'background'], default: 'background', description: 'Embedding queue priority: user_focus | recent | background.' },
  },
} as const;
