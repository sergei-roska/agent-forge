import type { ToolDefinition } from '../mcp/runtime.js';
import type { RunCoordinator } from '../indexer/RunCoordinator.js';
import { makeStartIndexingTool } from './startIndexing.js';
import { makePauseIndexingTool } from './pauseIndexing.js';
import { makeGetIndexingStatusTool } from './getIndexingStatus.js';

export function createIndexerTools(coordinator: RunCoordinator): ToolDefinition[] {
  return [
    makeStartIndexingTool(coordinator),
    makePauseIndexingTool(coordinator),
    makeGetIndexingStatusTool(coordinator),
  ];
}
