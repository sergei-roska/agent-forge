import type { SearchMode } from '../mcp/envelope.js';

/** A row as read from LanceDB (or reconstructed from the SQLite fallback). */
export interface ChunkRow {
  chunk_id: string;
  project_path: string;
  file_path: string;
  start_line: number | null;
  end_line: number | null;
  text: string | null;
  raw_text: string | null;
  language: string | null;
  node_type?: string | null;
  class_name: string | null;
  function_name: string | null;
  symbol_path?: string | null;
  content_hash?: string | null;
  mtime_ns: number | null;
  last_commit_hash?: string | null;
  tags?: string[] | null;
  summary?: string | null;
  schema_version?: string | null;
  indexed_at?: number | null;
}

/** A single-leg candidate (vector OR fts) with its rank in that leg. */
export interface RankedCandidate {
  chunk_id: string;
  rank: number;
  /** Raw native score (cosine distance for vector, BM25 for fts). Diagnostic only. */
  rawScore: number;
  row: ChunkRow;
}

/** A fully scored, fused result ready for projection. */
export interface ScoredResult {
  row: ChunkRow;
  score: number;
  score_vector: number;
  score_fts: number;
  identifier_boost: number;
  recency_multiplier: number;
  rank_vector: number | null;
  rank_fts: number | null;
}

export interface PipelineStats {
  mode: SearchMode;
  alpha: number;
  rrf_k: number;
  warnings: string[];
  gap_cutoff_applied: boolean;
  /** Total candidates before gap filtering. */
  candidate_count: number;
}

export interface MetadataFilters {
  language?: string;
  file_extensions?: string[];
  path_prefix?: string;
  /** ISO 8601 datetime. */
  updated_after?: string;
  tags?: string[];
  class_name?: string;
  function_name?: string;
  last_commit_hash?: string;
}
