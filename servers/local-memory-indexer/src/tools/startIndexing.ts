import type { ToolDefinition } from '../mcp/runtime.js';
import { err } from '../mcp/envelope.js';
import { ErrorCode } from '../errors/codes.js';
import { startIndexingInputShape } from '../contracts/startIndexing.schema.js';

export const startIndexingTool: ToolDefinition = {
  name: 'start_indexing',
  description:
    'Start a two-phase indexing run for a project. Phase 1 scans and chunks files into the queue (SQLite). Phase 2 embeds pending chunks into LanceDB. Returns immediately with a run_id for status polling.',
  inputSchema: startIndexingInputShape,
  handler: async (_args) => {
    return err(ErrorCode.PROJECT_PATH_REQUIRED, 'start_indexing not yet implemented — Step 8');
  },
};
