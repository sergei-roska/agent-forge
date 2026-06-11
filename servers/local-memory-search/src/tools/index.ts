import type { ToolDefinition } from '../mcp/runtime.js';
import type { SearchEngine } from '../search/SearchEngine.js';
import { makeSearchHybridTool, makeSearchSemanticTool, makeSearchKeywordTool } from './searchTools.js';
import {
  makeRetrieveContextPackTool, makeReadChunkNeighborsTool,
  makeGetChunkTool, makeSearchSimilarTool,
} from './contextTools.js';
import {
  makeHealthCheckTool, makeIndexStatusTool, makeDoctorIndexTool, makeExplainMatchTool,
} from './diagnosticsTools.js';

/**
 * Full read-only tool catalog (Spec 08.2 §4.4). Note: delete_project_index is
 * deliberately NOT exposed — delete operations belong to the Indexer service.
 */
export function createSearchTools(engine: SearchEngine): ToolDefinition[] {
  return [
    makeSearchHybridTool(engine),
    makeSearchSemanticTool(engine),
    makeSearchKeywordTool(engine),
    makeRetrieveContextPackTool(engine),
    makeReadChunkNeighborsTool(engine),
    makeGetChunkTool(engine),
    makeSearchSimilarTool(engine),
    makeExplainMatchTool(engine),
    makeHealthCheckTool(engine),
    makeIndexStatusTool(engine),
    makeDoctorIndexTool(engine),
  ];
}
