import type { ToolDefinition } from '../mcp/runtime.js';
import { err } from '../mcp/envelope.js';
import { ErrorCode } from '../errors/codes.js';
import { pauseIndexingInputShape } from '../contracts/pauseIndexing.schema.js';

export const pauseIndexingTool: ToolDefinition = {
  name: 'pause_indexing',
  description:
    'Gracefully pause an active Phase 2 embedding run. The current batch completes before pausing. State is checkpointed in SQLite for resumption.',
  inputSchema: pauseIndexingInputShape,
  handler: async (_args) => {
    return err(ErrorCode.RUN_NOT_FOUND, 'pause_indexing not yet implemented — Step 8');
  },
};
