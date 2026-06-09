import { isAbsolute } from 'node:path';
import { resolveProjectPath } from '../config.js';
import { ok, structuredError, type McpResponseEnvelope, type StrategyWeights } from '../mcp/envelope.js';
import { ErrorCode, Warn } from '../errors/codes.js';
import type { RetrieveOutcome } from '../search/SearchEngine.js';
import { toFullRecord, projectRecord, type TruncateStrategy } from '../search/projection.js';

/** Validate the project path argument; returns an error envelope or null. */
export function validateProject(rawPath?: string): { path: string } | { error: McpResponseEnvelope } {
  const resolved = resolveProjectPath(rawPath);
  if (!resolved || !isAbsolute(resolved)) {
    return {
      error: structuredError(
        ErrorCode.PATH_TRAVERSAL,
        `project_path must be an absolute path. Got: ${JSON.stringify(rawPath)}`,
      ),
    };
  }
  if (resolved.includes('\0') || /(^|\/)\.\.(\/|$)/.test(resolved)) {
    return {
      error: structuredError(ErrorCode.PATH_TRAVERSAL, `project_path contains traversal segments: ${resolved}`),
    };
  }
  return { path: resolved };
}

export interface BuildResponseOptions {
  projectPath: string;
  outcome: RetrieveOutcome;
  limit: number;
  offset: number;
  maxChars: number;
  fields?: string[];
  excludeFields?: string[];
  summaryOnly: boolean;
  truncateStrategy?: TruncateStrategy;
  includeStrategy: boolean;
}

/** Build the summary-first search envelope (Spec 08.2 §2.3 step 8). */
export function buildSearchResponse(opts: BuildResponseOptions): McpResponseEnvelope {
  const { outcome, limit, offset, projectPath } = opts;
  const all = outcome.results;
  const page = all.slice(offset, offset + limit);

  const sourceOfTruth = outcome.stats.mode === 'sqlite_fallback' ? 'sqlite_fallback' : 'local_index';
  const strategy: StrategyWeights = {
    alpha: round(outcome.stats.alpha),
    rrf_k: outcome.stats.rrf_k,
    mode: outcome.stats.mode,
  };

  if (outcome.empty || all.length === 0) {
    return ok(
      `No indexed content matched the query for project '${projectPath}'.`,
      { results: [] },
      {
        warnings: outcome.stats.warnings.length ? outcome.stats.warnings : undefined,
        strategy_weights: opts.includeStrategy ? strategy : undefined,
        pagination: { limit, offset, total_returned: 0, has_more: false, gap_cutoff_applied: outcome.stats.gap_cutoff_applied },
        next_steps: indexEmptyHint(outcome, projectPath),
        source_of_truth: sourceOfTruth,
      },
    );
  }

  const records = page.map((r) => {
    const full = toFullRecord(r, opts.maxChars, opts.truncateStrategy ?? 'middle');
    return projectRecord(full, opts.fields, opts.excludeFields);
  });

  const fileSet = new Set(page.map((r) => r.row.file_path));
  const top = page[0]!;
  const summary =
    `Found ${all.length} result${all.length === 1 ? '' : 's'} across ${fileSet.size} ` +
    `file${fileSet.size === 1 ? '' : 's'} (${outcome.stats.mode}). ` +
    `Top match: ${top.row.file_path} (score: ${round(top.score)}).`;

  return ok(
    summary,
    { results: opts.summaryOnly ? [] : records },
    {
      warnings: outcome.stats.warnings.length ? outcome.stats.warnings : undefined,
      strategy_weights: opts.includeStrategy ? strategy : undefined,
      pagination: {
        limit,
        offset,
        total_returned: records.length,
        has_more: offset + limit < all.length,
        gap_cutoff_applied: outcome.stats.gap_cutoff_applied,
      },
      source_of_truth: sourceOfTruth,
    },
  );
}

function indexEmptyHint(outcome: RetrieveOutcome, projectPath: string): string | undefined {
  if (outcome.stats.warnings.some((w) => w.startsWith('schema_version_mismatch'))) {
    return 'Stale schema detected. Run start_indexing with force=true to refresh the index.';
  }
  if (outcome.stats.warnings.some((w) => w.startsWith('EMBEDDING_IN_PROGRESS'))) {
    return 'Embedding is currently in progress. Run start_indexing (Indexer service) to resume or check status.';
  }
  if (outcome.stats.mode === 'sqlite_fallback') return undefined;
  return `Run start_indexing with project_path '${projectPath}' to build the index.`;
}

export { Warn };

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
