import type { ToolDefinition } from '../mcp/runtime.js';
import { startIndexingTool } from './startIndexing.js';
import { pauseIndexingTool } from './pauseIndexing.js';
import { getIndexingStatusTool } from './getIndexingStatus.js';

export function createIndexerTools(): ToolDefinition[] {
  return [startIndexingTool, pauseIndexingTool, getIndexingStatusTool];
}
