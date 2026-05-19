import { z } from 'zod';
import type { ToolDefinition } from '../mcp/runtime.js';
import { ok, err } from '../mcp/envelope.js';
import { ErrorCode } from '../errors/codes.js';

export const startIndexingTool: ToolDefinition = {
  name: 'start_indexing',
  description:
    'Start a two-phase indexing run for a project. Phase 1 scans and chunks files into the queue (SQLite). Phase 2 embeds pending chunks into LanceDB. Returns immediately with a run_id for status polling.',
  inputSchema: {
    project_path: z.string().describe('Absolute path to the project root.'),
    phases: z
      .array(z.enum(['discovery', 'embedding']))
      .default(['discovery', 'embedding'])
      .describe("Which phases to run. Omit 'embedding' to run Phase 1 only."),
    force: z.boolean().default(false).describe('Re-index all files regardless of fingerprint match.'),
    include_globs: z.array(z.string()).optional().describe("Allowlist glob patterns (e.g. ['src/**/*.ts'])."),
    exclude_globs: z.array(z.string()).optional().describe('Additional exclusion patterns.'),
    max_file_size_kb: z.number().int().default(512).describe('Skip files larger than this size in KB.'),
    batch_size: z.number().int().default(100).describe('Embedding batch size for Phase 2.'),
    enrich: z.boolean().default(true).describe('Run chunk enrichment (summary + tags) via granite4:3b-h before embedding.'),
    backend: z.enum(['ollama', 'transformers_js', 'auto']).default('auto').describe('Embedding backend override.'),
    priority: z
      .enum(['user_focus', 'recent', 'background'])
      .default('background')
      .describe('Embedding priority for all chunks in this run.'),
  },
  handler: async (_args) => {
    return err(ErrorCode.PROJECT_PATH_REQUIRED, 'start_indexing not yet implemented — Step 8');
  },
};
