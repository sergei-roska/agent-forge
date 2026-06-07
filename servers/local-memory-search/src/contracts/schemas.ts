import { z } from 'zod';
import {
  DEFAULT_ALPHA, DEFAULT_RRF_K, DEFAULT_RECENCY_WEIGHT, DEFAULT_GAP_THRESHOLD,
  DEFAULT_MAX_CHARS, DEFAULT_CONTEXT_PACK_MAX_CHARS, DEFAULT_MAX_FILES,
} from '../constants.js';

/** Metadata filter sub-schema (Spec 08.2 §3.1). Shared by all search tools. */
export const filtersShape = z
  .object({
    language: z.string().optional(),
    file_extensions: z.array(z.string()).optional(),
    path_prefix: z.string().optional(),
    updated_after: z.string().optional().describe('ISO 8601 datetime.'),
    tags: z.array(z.string()).optional(),
    class_name: z.string().optional(),
    function_name: z.string().optional(),
    last_commit_hash: z.string().optional(),
  })
  .strict()
  .optional()
  .describe('Metadata filters to pre-filter results.');

const projectPath = z
  .string()
  .optional()
  .describe('Absolute project path. Defaults to LOCAL_VECTOR_SEARCH_DEFAULT_PROJECT.');

const limit = z.number().int().min(1).max(50).default(10);
const offset = z.number().int().min(0).default(0);

// ── search_hybrid (§4.1) ─────────────────────────────────────────────────────
export const searchHybridShape = {
  query: z.string().min(1).describe('The search query. May mix exact identifiers and conceptual phrases.'),
  project_path: projectPath,
  limit,
  offset,
  alpha: z.number().min(0).max(1).default(DEFAULT_ALPHA)
    .describe('Weight for semantic score in RRF. 0 = keyword-only, 1 = semantic-only.'),
  rrf_k: z.number().int().default(DEFAULT_RRF_K).describe('RRF smoothing constant.'),
  recency_weight: z.number().default(DEFAULT_RECENCY_WEIGHT).describe('0 disables recency boost.'),
  gap_threshold: z.number().default(DEFAULT_GAP_THRESHOLD).describe('Relevance gap cutoff ratio.'),
  filters: filtersShape,
  fields: z.array(z.string()).optional().describe('Field projection. Defaults to the standard set.'),
  exclude_fields: z.array(z.string()).optional().describe('Fields to remove from the default set.'),
  summary_only: z.boolean().default(false),
  max_chars: z.number().int().default(DEFAULT_MAX_CHARS).describe('Max chars per chunk text in results.'),
  cache_bust: z.boolean().default(false),
} as const;
export const SearchHybridSchema = z.object(searchHybridShape);

// ── search_semantic / search_keyword (§4.4) ──────────────────────────────────
export const searchSemanticShape = {
  query: z.string().min(1),
  project_path: projectPath,
  limit,
  offset,
  filters: filtersShape,
  fields: z.array(z.string()).optional(),
  exclude_fields: z.array(z.string()).optional(),
  summary_only: z.boolean().default(false),
  max_chars: z.number().int().default(DEFAULT_MAX_CHARS),
  recency_weight: z.number().default(DEFAULT_RECENCY_WEIGHT),
  gap_threshold: z.number().default(DEFAULT_GAP_THRESHOLD),
  cache_bust: z.boolean().default(false),
} as const;
export const SearchSemanticSchema = z.object(searchSemanticShape);
export const searchKeywordShape = searchSemanticShape;
export const SearchKeywordSchema = SearchSemanticSchema;

// ── retrieve_context_pack (§4.2) ─────────────────────────────────────────────
export const retrieveContextPackShape = {
  query: z.string().min(1),
  project_path: projectPath,
  max_files: z.number().int().min(1).default(DEFAULT_MAX_FILES).describe('Max distinct source files in the pack.'),
  max_chars: z.number().int().min(1).default(DEFAULT_CONTEXT_PACK_MAX_CHARS).describe('Total character budget for all excerpts.'),
  include_neighbors: z.boolean().default(true),
  neighbor_hops: z.number().int().min(0).max(3).default(1),
  rerank: z.boolean().default(false).describe('Enable qwen3.5:9b LLM re-ranking.'),
  truncate_strategy: z.enum(['middle', 'tail', 'head']).default('middle'),
  filters: filtersShape,
  alpha: z.number().min(0).max(1).default(DEFAULT_ALPHA),
} as const;
export const RetrieveContextPackSchema = z.object(retrieveContextPackShape);

// ── read_chunk_neighbors (§4.3) ──────────────────────────────────────────────
export const readChunkNeighborsShape = {
  chunk_id: z.string().min(1),
  project_path: projectPath,
  before: z.number().int().min(0).max(5).default(2),
  after: z.number().int().min(0).max(5).default(2),
} as const;
export const ReadChunkNeighborsSchema = z.object(readChunkNeighborsShape);

// ── get_chunk (§4.4) ─────────────────────────────────────────────────────────
export const getChunkShape = {
  chunk_id: z.string().min(1),
  project_path: projectPath,
  fields: z.array(z.string()).optional(),
  max_chars: z.number().int().default(0).describe('0 = no truncation.'),
} as const;
export const GetChunkSchema = z.object(getChunkShape);

// ── search_similar (§4.4) ────────────────────────────────────────────────────
export const searchSimilarShape = {
  file_path: z.string().min(1).describe('File whose chunk vector seeds the similarity search.'),
  project_path: projectPath,
  function_name: z.string().optional().describe('Narrow the seed to a specific function/method.'),
  limit,
  filters: filtersShape,
  max_chars: z.number().int().default(DEFAULT_MAX_CHARS),
} as const;
export const SearchSimilarSchema = z.object(searchSimilarShape);

// ── explain_match (§4.4) ─────────────────────────────────────────────────────
export const explainMatchShape = {
  query: z.string().min(1).describe('The original query whose match is being explained.'),
  result_id: z.string().min(1).describe('chunk_id of the result to explain.'),
  project_path: projectPath,
  alpha: z.number().min(0).max(1).default(DEFAULT_ALPHA),
  verbosity: z.enum(['compact', 'full']).default('compact'),
} as const;
export const ExplainMatchSchema = z.object(explainMatchShape);

// ── health_check (§4.4) ──────────────────────────────────────────────────────
export const healthCheckShape = {
  project_path: projectPath,
  verbose: z.boolean().default(false),
} as const;
export const HealthCheckSchema = z.object(healthCheckShape);

// ── index_status (§4.4) ──────────────────────────────────────────────────────
export const indexStatusShape = {
  project_path: projectPath,
} as const;
export const IndexStatusSchema = z.object(indexStatusShape);

// ── doctor_index (§4.4) ──────────────────────────────────────────────────────
export const doctorIndexShape = {
  project_path: projectPath,
  auto_fix: z.boolean().default(false).describe('Ignored: the read-only service never mutates the index.'),
} as const;
export const DoctorIndexSchema = z.object(doctorIndexShape);
