import type { SearchEngine, RetrieveParams } from './SearchEngine.js';
import type { ScoredResult, ChunkRow } from './types.js';
import { getNeighbors } from './neighbors.js';
import { rerankWithLlm } from './reranker.js';
import { truncateText, type TruncateStrategy } from './projection.js';
import { Warn } from '../errors/codes.js';

export interface ContextPackParams {
  query: string;
  projectPath: string;
  maxFiles: number;
  maxChars: number;
  includeNeighbors: boolean;
  neighborHops: number;
  rerank: boolean;
  truncateStrategy: TruncateStrategy;
  alpha: number;
  filters?: RetrieveParams['filters'];
}

export interface Excerpt {
  chunk_id: string;
  file_path: string;
  start_line: number | null;
  end_line: number | null;
  text: string;
  score: number;
  is_neighbor: boolean;
  function_name: string | null;
  class_name: string | null;
}

export interface ContextPack {
  files: { file_path: string; language: string | null; chunk_count: number }[];
  excerpts: Excerpt[];
  budget: {
    max_chars: number;
    used_chars: number;
    truncated: boolean;
    truncate_strategy: TruncateStrategy;
  };
  rerank_applied: boolean;
  warnings: string[];
  empty: boolean;
}

/**
 * Build an agent-ready, token-budgeted context pack (Spec 08.2 §4.2).
 * Pipeline: hybrid retrieve → optional LLM rerank → restrict to max_files →
 * optional neighbor expansion → char-budget enforcement → coherent ordering.
 */
export async function buildContextPack(
  engine: SearchEngine,
  params: ContextPackParams,
): Promise<ContextPack> {
  const outcome = await engine.retrieve({
    query: params.query,
    projectPath: params.projectPath,
    alpha: params.alpha,
    rrfK: 60,
    recencyWeight: 0.1,
    gapThreshold: 0.25,
    legs: 'hybrid',
    filters: params.filters,
  });

  const warnings = [...outcome.stats.warnings];
  if (outcome.empty) {
    return {
      files: [], excerpts: [],
      budget: { max_chars: params.maxChars, used_chars: 0, truncated: false, truncate_strategy: params.truncateStrategy },
      rerank_applied: false, warnings, empty: true,
    };
  }

  // ── Optional LLM re-rank (§2.3 step 6) ──
  let ranked: ScoredResult[] = outcome.results;
  let rerankApplied = false;
  if (params.rerank) {
    const r = await rerankWithLlm(params.query, ranked);
    if (r.applied) {
      ranked = r.results;
      rerankApplied = true;
    } else {
      warnings.push(Warn.rerankUnavailable);
    }
  }

  // ── Restrict to max_files (preserve rank order of first appearance) ──
  const fileOrder: string[] = [];
  const primaryByFile = new Map<string, ScoredResult[]>();
  for (const r of ranked) {
    const fp = r.row.file_path;
    if (!primaryByFile.has(fp)) {
      if (fileOrder.length >= params.maxFiles) continue;
      fileOrder.push(fp);
      primaryByFile.set(fp, []);
    }
    primaryByFile.get(fp)!.push(r);
  }

  // ── Assemble excerpts with optional neighbor expansion, under budget ──
  const excerpts: Excerpt[] = [];
  const seen = new Set<string>();
  let used = 0;
  let truncated = false;

  const pushExcerpt = (row: ChunkRow, score: number, isNeighbor: boolean): boolean => {
    if (seen.has(row.chunk_id)) return true;
    const raw = row.text ?? row.raw_text ?? '';
    const remaining = params.maxChars - used;
    if (remaining <= 0) {
      truncated = true;
      return false;
    }
    const text = truncateText(raw, remaining, params.truncateStrategy);
    if (text.length < raw.length) truncated = true;
    used += text.length;
    seen.add(row.chunk_id);
    excerpts.push({
      chunk_id: row.chunk_id,
      file_path: row.file_path,
      start_line: row.start_line,
      end_line: row.end_line,
      text,
      score: round(score),
      is_neighbor: isNeighbor,
      function_name: row.function_name,
      class_name: row.class_name,
    });
    return true;
  };

  outer: for (const fp of fileOrder) {
    for (const primary of primaryByFile.get(fp)!) {
      if (!pushExcerpt(primary.row, primary.score, false)) { truncated = true; break outer; }

      if (params.includeNeighbors && params.neighborHops > 0) {
        const nb = await getNeighbors(
          engine, params.projectPath, primary.row.chunk_id,
          params.neighborHops, params.neighborHops,
        );
        for (const n of [...nb.before, ...nb.after]) {
          if (!pushExcerpt(n, primary.score, true)) { truncated = true; break outer; }
        }
      }
    }
  }

  // Coherent reading order: group by file, then by start_line.
  excerpts.sort((a, b) =>
    a.file_path < b.file_path ? -1 : a.file_path > b.file_path ? 1 : (a.start_line ?? 0) - (b.start_line ?? 0),
  );

  const files = fileOrder.map((fp) => {
    const count = excerpts.filter((e) => e.file_path === fp).length;
    const lang = primaryByFile.get(fp)?.[0]?.row.language ?? null;
    return { file_path: fp, language: lang, chunk_count: count };
  });

  return {
    files,
    excerpts,
    budget: {
      max_chars: params.maxChars,
      used_chars: used,
      truncated,
      truncate_strategy: params.truncateStrategy,
    },
    rerank_applied: rerankApplied,
    warnings,
    empty: excerpts.length === 0,
  };
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
