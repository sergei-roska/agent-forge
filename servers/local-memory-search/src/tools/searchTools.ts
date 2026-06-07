import type { ToolDefinition } from '../mcp/runtime.js';
import type { SearchEngine } from '../search/SearchEngine.js';
import { structuredError } from '../mcp/envelope.js';
import { ErrorCode } from '../errors/codes.js';
import {
  searchHybridShape, SearchHybridSchema,
  searchSemanticShape, SearchSemanticSchema,
  searchKeywordShape, SearchKeywordSchema,
} from '../contracts/schemas.js';
import { validateProject, buildSearchResponse } from './shared.js';
import { DEFAULT_TOP_K_CANDIDATES } from '../constants.js';

export function makeSearchHybridTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'search_hybrid',
    description:
      'Hybrid semantic + keyword search over indexed project chunks. Combines vector similarity and BM25 via Reciprocal Rank Fusion. Degrades gracefully to keyword-only if the vector index is unavailable.',
    inputSchema: searchHybridShape,
    handler: async (raw) => {
      const parsed = SearchHybridSchema.safeParse(raw);
      if (!parsed.success) return structuredError(ErrorCode.PATH_TRAVERSAL, parsed.error.issues[0]?.message ?? 'Invalid input.');
      const a = parsed.data;
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const outcome = await engine.retrieve({
        query: a.query,
        projectPath: proj.path,
        alpha: a.alpha,
        rrfK: a.rrf_k,
        recencyWeight: a.recency_weight,
        gapThreshold: a.gap_threshold,
        topK: Math.max(DEFAULT_TOP_K_CANDIDATES, a.offset + a.limit),
        filters: a.filters,
        legs: 'hybrid',
        cacheBust: a.cache_bust,
      });

      return buildSearchResponse({
        projectPath: proj.path, outcome,
        limit: a.limit, offset: a.offset, maxChars: a.max_chars,
        fields: a.fields, excludeFields: a.exclude_fields,
        summaryOnly: a.summary_only, includeStrategy: true,
      });
    },
  };
}

export function makeSearchSemanticTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'search_semantic',
    description: 'Pure vector ANN (semantic) search over indexed chunks. No keyword/BM25 leg. Falls back with a warning if the embedding backend or vector index is unavailable.',
    inputSchema: searchSemanticShape,
    handler: async (raw) => {
      const parsed = SearchSemanticSchema.safeParse(raw);
      if (!parsed.success) return structuredError(ErrorCode.PATH_TRAVERSAL, parsed.error.issues[0]?.message ?? 'Invalid input.');
      const a = parsed.data;
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const outcome = await engine.retrieve({
        query: a.query, projectPath: proj.path,
        alpha: 1, rrfK: 60, recencyWeight: a.recency_weight, gapThreshold: a.gap_threshold,
        topK: Math.max(DEFAULT_TOP_K_CANDIDATES, a.offset + a.limit),
        filters: a.filters, legs: 'semantic', cacheBust: a.cache_bust,
      });

      return buildSearchResponse({
        projectPath: proj.path, outcome,
        limit: a.limit, offset: a.offset, maxChars: a.max_chars,
        fields: a.fields, excludeFields: a.exclude_fields,
        summaryOnly: a.summary_only, includeStrategy: true,
      });
    },
  };
}

export function makeSearchKeywordTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'search_keyword',
    description: 'Pure BM25/FTS keyword search over indexed chunks. No vector leg. Falls back to SQLite LIKE if the FTS index is missing.',
    inputSchema: searchKeywordShape,
    handler: async (raw) => {
      const parsed = SearchKeywordSchema.safeParse(raw);
      if (!parsed.success) return structuredError(ErrorCode.PATH_TRAVERSAL, parsed.error.issues[0]?.message ?? 'Invalid input.');
      const a = parsed.data;
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const outcome = await engine.retrieve({
        query: a.query, projectPath: proj.path,
        alpha: 0, rrfK: 60, recencyWeight: a.recency_weight, gapThreshold: a.gap_threshold,
        topK: Math.max(DEFAULT_TOP_K_CANDIDATES, a.offset + a.limit),
        filters: a.filters, legs: 'keyword', cacheBust: a.cache_bust,
      });

      return buildSearchResponse({
        projectPath: proj.path, outcome,
        limit: a.limit, offset: a.offset, maxChars: a.max_chars,
        fields: a.fields, excludeFields: a.exclude_fields,
        summaryOnly: a.summary_only, includeStrategy: true,
      });
    },
  };
}
