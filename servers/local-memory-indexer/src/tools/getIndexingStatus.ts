import { z } from 'zod';
import type { ToolDefinition } from '../mcp/runtime.js';
import { err } from '../mcp/envelope.js';
import { ErrorCode } from '../errors/codes.js';

export const getIndexingStatusTool: ToolDefinition = {
  name: 'get_indexing_status',
  description:
    'Return detailed progress, ETA, and chunk counts for an indexing run. Omit run_id to get the most recent run for the project.',
  inputSchema: {
    run_id: z.string().optional().describe('The run_id returned by start_indexing. If omitted, returns the most recent run.'),
    project_path: z.string().optional().describe('Used only when run_id is omitted.'),
  },
  handler: async (_args) => {
    return err(ErrorCode.RUN_NOT_FOUND, 'get_indexing_status not yet implemented — Step 8');
  },
};
