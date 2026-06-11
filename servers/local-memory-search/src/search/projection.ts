import type { ScoredResult } from './types.js';

export type TruncateStrategy = 'middle' | 'head' | 'tail';

/**
 * Text truncation (Spec 08.2 §2.3 step 7). 'middle' (default) keeps head + tail
 * context and elides the centre; 'head' keeps the start; 'tail' keeps the end.
 */
export function truncateText(
  text: string,
  maxChars: number,
  strategy: TruncateStrategy = 'middle',
): string {
  if (maxChars <= 0 || text.length <= maxChars) return text;
  const ellipsis = '\n…\n';

  if (strategy === 'head') {
    return text.slice(0, maxChars) + ' …';
  }
  if (strategy === 'tail') {
    return '… ' + text.slice(text.length - maxChars);
  }
  // middle
  const keep = maxChars - ellipsis.length;
  if (keep <= 0) return text.slice(0, maxChars);
  const headLen = Math.ceil(keep / 2);
  const tailLen = Math.floor(keep / 2);
  return text.slice(0, headLen) + ellipsis + text.slice(text.length - tailLen);
}

/** Full result record before field projection. */
export interface FullResultRecord {
  chunk_id: string;
  file_path: string;
  start_line: number | null;
  end_line: number | null;
  text: string;
  score: number;
  score_vector: number;
  score_fts: number;
  language: string | null;
  function_name: string | null;
  class_name: string | null;
  mtime_ns: number | null;
  [key: string]: unknown;
}

export const DEFAULT_RESULT_FIELDS: (keyof FullResultRecord)[] = [
  'chunk_id', 'file_path', 'start_line', 'end_line', 'text', 'score',
  'language', 'function_name', 'class_name',
];

export function toFullRecord(
  r: ScoredResult,
  maxChars: number,
  strategy: TruncateStrategy = 'middle',
): FullResultRecord {
  const text = r.row.text ?? r.row.raw_text ?? '';
  return {
    chunk_id:      r.row.chunk_id,
    file_path:     r.row.file_path,
    start_line:    r.row.start_line,
    end_line:      r.row.end_line,
    text:          truncateText(text, maxChars, strategy),
    score:         round(r.score),
    score_vector:  round(r.score_vector),
    score_fts:     round(r.score_fts),
    language:      r.row.language,
    function_name: r.row.function_name,
    class_name:    r.row.class_name,
    mtime_ns:      r.row.mtime_ns,
  };
}

/**
 * Apply `fields` (allowlist) / `exclude_fields` (denylist) projection
 * (Spec 08.2 §2.3 step 7). `fields` defaults to {@link DEFAULT_RESULT_FIELDS}.
 */
export function projectRecord(
  record: FullResultRecord,
  fields?: string[],
  excludeFields?: string[],
): Record<string, unknown> {
  const allow = fields?.length ? fields : (DEFAULT_RESULT_FIELDS as string[]);
  const deny = new Set(excludeFields ?? []);
  const out: Record<string, unknown> = {};
  for (const key of allow) {
    if (deny.has(key)) continue;
    if (key in record) out[key] = record[key];
  }
  return out;
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
