import type { ToolDefinition } from '../mcp/runtime.js';
import type { RunCoordinator } from '../indexer/RunCoordinator.js';
import { makeStartIndexingTool } from './startIndexing.js';
import { makePauseIndexingTool } from './pauseIndexing.js';
import { makeResumeIndexingTool } from './resumeIndexing.js';
import { makeGetIndexingStatusTool } from './getIndexingStatus.js';
import { makeDoctorIndexTool } from './doctorIndex.js';
import { makeDeleteProjectIndexTool } from './deleteProjectIndex.js';

export function createIndexerTools(coordinator: RunCoordinator): ToolDefinition[] {
  return [
    makeStartIndexingTool(coordinator),
    makePauseIndexingTool(coordinator),
    makeResumeIndexingTool(coordinator),
    makeGetIndexingStatusTool(coordinator),
    makeDoctorIndexTool(),
    makeDeleteProjectIndexTool(),
  ];
}
