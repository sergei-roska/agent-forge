import { z } from 'zod';
import {
  DEFAULT_ALPHA, DEFAULT_RRF_K, DEFAULT_RECENCY_WEIGHT, DEFAULT_GAP_THRESHOLD,
  DEFAULT_MAX_CHARS, DEFAULT_CONTEXT_PACK_MAX_CHARS, DEFAULT_MAX_FILES,
} from '../constants.js';

/** Metadata filter sub-schema (Spec 08.2 §3.1). Shared by all search tools. */
export const filtersShape = z
  .object({
    language: z.string().optional().describe('Language tag, e.g. typescript.'),
    file_extensions: z.array(z.string()).optional().describe('Extensions without dot, e.g. ["ts","py"].'),
    path_prefix: z.string().optional().describe('Repo-relative path prefix.'),
    updated_after: z.string().optional().describe('ISO 8601 datetime; keep chunks newer than this.'),
    tags: z.array(z.string()).optional().describe('Match any listed tag.'),
    class_name: z.string().optional().describe('Exact class name.'),
    function_name: z.string().optional().describe('Exact function/method name.'),
    last_commit_hash: z.string().optional().describe('Exact git commit hash.'),
  })
  .strict()
  .optional()
  .describe('Pre-filter hits before ranking.');

const projectPath = z
  .string()
  .optional()
  .describe('Absolute project root. Default: LOCAL_VECTOR_SEARCH_DEFAULT_PROJECT.');

const limit = z.number().int().min(1).max(50).default(10).describe('Max results (1–50).');
const offset = z.number().int().min(0).default(0).describe('Skip N results (pagination).');
const chunkId = z.string().min(1).describe('chunk_id from search results.');
const searchQuery = z.string().min(1).describe('Search text: identifiers, keywords, or natural language.');
const responseFields = z.array(z.string()).optional().describe('Include only these chunk fields.');
const excludeResponseFields = z.array(z.string()).optional().describe('Omit these fields from default set.');
const summaryOnly = z.boolean().default(false).describe('Return summaries only; omit chunk text.');
const maxChunkChars = z.number().int().default(DEFAULT_MAX_CHARS).describe('Truncate each chunk text to N chars.');
const recencyWeight = z.number().default(DEFAULT_RECENCY_WEIGHT).describe('Recency boost. 0=off.');
const gapThreshold = z.number().default(DEFAULT_GAP_THRESHOLD).describe('Drop hits below this relevance-gap ratio.');
const cacheBust = z.boolean().default(false).describe('Bypass result cache.');

// ── search_hybrid (§4.1) ─────────────────────────────────────────────────────
export const searchHybridShape = {
  query: searchQuery,
  project_path: projectPath,
  limit,
  offset,
  alpha: z.number().min(0).max(1).default(DEFAULT_ALPHA)
    .describe('RRF semantic weight. 0=keyword-only, 1=semantic-only.'),
  rrf_k: z.number().int().default(DEFAULT_RRF_K).describe('RRF k constant.'),
  recency_weight: recencyWeight,
  gap_threshold: gapThreshold,
  filters: filtersShape,
  fields: responseFields,
  exclude_fields: excludeResponseFields,
  summary_only: summaryOnly,
  max_chars: maxChunkChars,
  cache_bust: cacheBust,
} as const;
export const SearchHybridSchema = z.object(searchHybridShape);

// ── search_semantic / search_keyword (§4.4) ──────────────────────────────────
export const searchSemanticShape = {
  query: searchQuery,
  project_path: projectPath,
  limit,
  offset,
  filters: filtersShape,
  fields: responseFields,
  exclude_fields: excludeResponseFields,
  summary_only: summaryOnly,
  max_chars: maxChunkChars,
  recency_weight: recencyWeight,
  gap_threshold: gapThreshold,
  cache_bust: cacheBust,
} as const;
export const SearchSemanticSchema = z.object(searchSemanticShape);
export const searchKeywordShape = searchSemanticShape;
export const SearchKeywordSchema = SearchSemanticSchema;

// ── retrieve_context_pack (§4.2) ─────────────────────────────────────────────
export const retrieveContextPackShape = {
  query: searchQuery,
  project_path: projectPath,
  max_files: z.number().int().min(1).default(DEFAULT_MAX_FILES).describe('Max distinct files in pack.'),
  max_chars: z.number().int().min(1).default(DEFAULT_CONTEXT_PACK_MAX_CHARS).describe('Total char budget for all excerpts.'),
  include_neighbors: z.boolean().default(true).describe('Append adjacent chunks to excerpts.'),
  neighbor_hops: z.number().int().min(0).max(3).default(1).describe('Neighbor expansion depth (0–3).'),
  rerank: z.boolean().default(false).describe('LLM rerank excerpts (granite4.1:3b).'),
  truncate_strategy: z.enum(['middle', 'tail', 'head']).default('middle').describe('Excerpt truncation: middle | tail | head.'),
  filters: filtersShape,
  alpha: z.number().min(0).max(1).default(DEFAULT_ALPHA).describe('RRF semantic weight for initial retrieval.'),
} as const;
export const RetrieveContextPackSchema = z.object(retrieveContextPackShape);

// ── read_chunk_neighbors (§4.3) ──────────────────────────────────────────────
export const readChunkNeighborsShape = {
  chunk_id: chunkId,
  project_path: projectPath,
  before: z.number().int().min(0).max(5).default(2).describe('Preceding chunks to return (0–5).'),
  after: z.number().int().min(0).max(5).default(2).describe('Following chunks to return (0–5).'),
} as const;
export const ReadChunkNeighborsSchema = z.object(readChunkNeighborsShape);

// ── get_chunk (§4.4) ─────────────────────────────────────────────────────────
export const getChunkShape = {
  chunk_id: chunkId,
  project_path: projectPath,
  fields: responseFields,
  max_chars: z.number().int().default(0).describe('Truncate text; 0=full text.'),
} as const;
export const GetChunkSchema = z.object(getChunkShape);

// ── search_similar (§4.4) ────────────────────────────────────────────────────
export const searchSimilarShape = {
  file_path: z.string().min(1).describe('Repo-relative file path; seeds vector from its chunk.'),
  project_path: projectPath,
  function_name: z.string().optional().describe('Restrict seed to this function/method.'),
  limit,
  filters: filtersShape,
  max_chars: maxChunkChars,
} as const;
export const SearchSimilarSchema = z.object(searchSimilarShape);

// ── explain_match (§4.4) ─────────────────────────────────────────────────────
export const explainMatchShape = {
  query: z.string().min(1).describe('Same query used in search_hybrid.'),
  result_id: chunkId.describe('chunk_id to explain (from search_hybrid results).'),
  project_path: projectPath,
  alpha: z.number().min(0).max(1).default(DEFAULT_ALPHA).describe('RRF semantic weight to replay.'),
  verbosity: z.enum(['compact', 'full']).default('compact').describe('compact=scores; full=scores+text.'),
} as const;
export const ExplainMatchSchema = z.object(explainMatchShape);

// ── health_check (§4.4) ──────────────────────────────────────────────────────
export const healthCheckShape = {
  project_path: projectPath,
  verbose: z.boolean().default(false).describe('Add chunk counts, search capabilities, doctor summary.'),
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
  auto_fix: z.boolean().default(false).describe('No-op here. Run Indexer doctor_index with auto_fix=true to repair.'),
} as const;
export const DoctorIndexSchema = z.object(doctorIndexShape);

// ── find_callers (Spec 8.2.1) ───────────────────────────────────────────────
export const findCallersShape = {
  symbol_name: z.string().min(1).describe('Callee symbol to reverse-lookup, e.g. getUser.'),
  project_path: projectPath,
  depth: z.number().int().min(1).max(3).default(1).describe('Call-graph hop depth (1–3).'),
} as const;
export const FindCallersSchema = z.object(findCallersShape);

// ── find_callees (Spec 8.2.1) ───────────────────────────────────────────────
export const findCalleesShape = {
  symbol_name: z.string().min(1).describe('Caller symbol, e.g. AuthService.login.'),
  project_path: projectPath,
  depth: z.number().int().min(1).max(3).default(1).describe('Call-graph hop depth (1–3).'),
} as const;
export const FindCalleesSchema = z.object(findCalleesShape);

// ── get_import_graph (Spec 8.2.1) ───────────────────────────────────────────
export const getImportGraphShape = {
  file_path: z.string().optional().describe('Repo-relative file; omit for project-wide imports.'),
  project_path: projectPath,
} as const;
export const GetImportGraphSchema = z.object(getImportGraphShape);

// ── trace_path (Spec 8.2.1) ──────────────────────────────────────────────────
export const tracePathShape = {
  source_symbol: z.string().min(1).describe('Start symbol name or qualified path.'),
  target_symbol: z.string().min(1).describe('End symbol name or qualified path.'),
  project_path: projectPath,
} as const;
export const TracePathSchema = z.object(tracePathShape);
