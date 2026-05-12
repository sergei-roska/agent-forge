import { z } from 'zod';
import type { Verbosity } from './base.js';

// ---------- Pagination Metadata ----------
export const PaginationMetaSchema = z.object({
  total: z.number().int().min(0)
    .describe('Total number of items available.'),
  returned: z.number().int().min(0)
    .describe('Number of items in this response.'),
  limit: z.number().int().min(1)
    .describe('Limit used for this request.'),
  next_cursor: z.string().nullable().default(null)
    .describe('Cursor for the next page, or null if this is the last page.'),
  has_more: z.boolean().default(false)
    .describe('Whether additional pages exist.'),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

// ---------- Window Metadata ----------
export const WindowMetaSchema = z.object({
  start_char: z.number().int().min(0).default(0),
  end_char: z.number().int().min(0),
  total_chars: z.number().int().min(0),
  truncated: z.boolean().default(false),
  truncate_strategy: z.enum(['head', 'middle', 'tail']).optional(),
});
export type WindowMeta = z.infer<typeof WindowMetaSchema>;

// ---------- Noise Control Metadata ----------
export const NoiseControlMetaSchema = z.object({
  verbosity: z.string(),
  excluded: z.array(z.string()).default([])
    .describe('List of field names or categories that were excluded.'),
});
export type NoiseControlMeta = z.infer<typeof NoiseControlMetaSchema>;

// ---------- Source Of Truth ----------
export const SourceOfTruthSchema = z.enum([
  'runtime',     // Live Drupal API
  'config_sync', // Exported YAML config
  'codebase',    // PHP/Twig files
  'database',    // Direct DB query
  'browser',     // Browser/DOM observation
  'mixed',       // Multiple sources
]);
export type SourceOfTruth = z.infer<typeof SourceOfTruthSchema>;

// ---------- Response Envelope ----------
export const McpResponseEnvelopeSchema = z.object({
  summary: z.string()
    .describe('One-line human-readable explanation of the result.'),
  data: z.array(z.unknown()).default([])
    .describe('Array of result items.'),
  pagination: PaginationMetaSchema.optional()
    .describe('Pagination metadata. Present on list/search tools.'),
  window: WindowMetaSchema.optional()
    .describe('Windowing metadata. Present when text payloads are bounded.'),
  noise_control: NoiseControlMetaSchema.optional()
    .describe('Noise control metadata showing what was filtered.'),
  source_of_truth: SourceOfTruthSchema.optional()
    .describe('Where this data originated.'),
  warnings: z.array(z.string()).optional()
    .describe('Non-fatal warnings about the response (e.g. truncated, stale).'),
});
export type McpResponseEnvelope = z.infer<typeof McpResponseEnvelopeSchema>;

// ---------- Envelope Builder ----------

export interface EnvelopeOptions<T = unknown> {
  summary: string;
  data: T[];
  total?: number;
  limit?: number;
  cursor?: string | null;
  verbosity?: Verbosity;
  excluded?: string[];
  source?: SourceOfTruth;
  warnings?: string[];
}

/**
 * Build a standards-compliant response envelope.
 * Every tool handler should return the result of this function.
 */
export function buildEnvelope<T = unknown>(opts: EnvelopeOptions<T>): McpResponseEnvelope {
  const total = opts.total ?? opts.data.length;
  const returned = opts.data.length;
  const limit = opts.limit ?? returned;
  const hasMore = total > (opts.data.length);

  const envelope: McpResponseEnvelope = {
    summary: opts.summary,
    data: opts.data,
  };

  // Attach pagination when dealing with lists
  if (opts.total !== undefined || opts.limit !== undefined || opts.cursor !== undefined) {
    envelope.pagination = {
      total,
      returned,
      limit,
      next_cursor: opts.cursor ?? null,
      has_more: hasMore,
    };
  }

  // Attach noise control when relevant
  if (opts.verbosity || (opts.excluded && opts.excluded.length > 0)) {
    envelope.noise_control = {
      verbosity: opts.verbosity ?? 'minimal',
      excluded: opts.excluded ?? [],
    };
  }

  // Attach source of truth
  if (opts.source) {
    envelope.source_of_truth = opts.source;
  }

  // Attach warnings
  if (opts.warnings && opts.warnings.length > 0) {
    envelope.warnings = opts.warnings;
  }

  return envelope;
}

/**
 * Apply character windowing to a text payload.
 * Returns the windowed text and metadata.
 */
export function applyWindowing(
  text: string,
  maxChars: number,
  startChar: number = 0,
  endChar?: number,
  strategy: 'head' | 'middle' | 'tail' = 'tail',
): { text: string; window: WindowMeta } {
  const totalChars = text.length;
  const effectiveEnd = endChar ?? totalChars;
  const slice = text.slice(startChar, effectiveEnd);

  if (slice.length <= maxChars) {
    return {
      text: slice,
      window: {
        start_char: startChar,
        end_char: startChar + slice.length,
        total_chars: totalChars,
        truncated: false,
      },
    };
  }

  let truncated: string;
  let windowStart = startChar;
  let windowEnd = startChar;

  switch (strategy) {
    case 'head':
      truncated = slice.slice(0, maxChars);
      windowEnd = startChar + maxChars;
      break;
    case 'middle': {
      const half = Math.floor(maxChars / 2);
      const head = slice.slice(0, half);
      const tail = slice.slice(slice.length - (maxChars - half));
      truncated = head + '\n… [truncated] …\n' + tail;
      windowStart = startChar;
      windowEnd = startChar + slice.length;
      break;
    }
    case 'tail':
    default:
      truncated = slice.slice(slice.length - maxChars);
      windowStart = startChar + slice.length - maxChars;
      windowEnd = startChar + slice.length;
      break;
  }

  return {
    text: truncated,
    window: {
      start_char: windowStart,
      end_char: windowEnd,
      total_chars: totalChars,
      truncated: true,
      truncate_strategy: strategy,
    },
  };
}

/**
 * Apply field projection to an array of objects.
 * Supports include-list and exclude-list.
 */
export function applyProjection<T extends Record<string, unknown>>(
  items: T[],
  fields?: string[],
  excludeFields?: string[],
): Partial<T>[] {
  if (!fields && !excludeFields) return items;

  return items.map((item) => {
    if (fields && fields.length > 0) {
      const projected: Record<string, unknown> = {};
      for (const f of fields) {
        if (f in item) projected[f] = item[f];
      }
      return projected as Partial<T>;
    }

    if (excludeFields && excludeFields.length > 0) {
      const filtered = { ...item };
      for (const f of excludeFields) {
        delete (filtered as Record<string, unknown>)[f];
      }
      return filtered as Partial<T>;
    }

    return item;
  });
}
