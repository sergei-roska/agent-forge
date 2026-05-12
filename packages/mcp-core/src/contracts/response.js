"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpResponseEnvelopeSchema = exports.SourceOfTruthSchema = exports.NoiseControlMetaSchema = exports.WindowMetaSchema = exports.PaginationMetaSchema = void 0;
exports.buildEnvelope = buildEnvelope;
exports.applyWindowing = applyWindowing;
exports.applyProjection = applyProjection;
const zod_1 = require("zod");
// ---------- Pagination Metadata ----------
exports.PaginationMetaSchema = zod_1.z.object({
    total: zod_1.z.number().int().min(0)
        .describe('Total number of items available.'),
    returned: zod_1.z.number().int().min(0)
        .describe('Number of items in this response.'),
    limit: zod_1.z.number().int().min(1)
        .describe('Limit used for this request.'),
    next_cursor: zod_1.z.string().nullable().default(null)
        .describe('Cursor for the next page, or null if this is the last page.'),
    has_more: zod_1.z.boolean().default(false)
        .describe('Whether additional pages exist.'),
});
// ---------- Window Metadata ----------
exports.WindowMetaSchema = zod_1.z.object({
    start_char: zod_1.z.number().int().min(0).default(0),
    end_char: zod_1.z.number().int().min(0),
    total_chars: zod_1.z.number().int().min(0),
    truncated: zod_1.z.boolean().default(false),
    truncate_strategy: zod_1.z.enum(['head', 'middle', 'tail']).optional(),
});
// ---------- Noise Control Metadata ----------
exports.NoiseControlMetaSchema = zod_1.z.object({
    verbosity: zod_1.z.string(),
    excluded: zod_1.z.array(zod_1.z.string()).default([])
        .describe('List of field names or categories that were excluded.'),
});
// ---------- Source Of Truth ----------
exports.SourceOfTruthSchema = zod_1.z.enum([
    'runtime', // Live Drupal API
    'config_sync', // Exported YAML config
    'codebase', // PHP/Twig files
    'database', // Direct DB query
    'browser', // Browser/DOM observation
    'mixed', // Multiple sources
]);
// ---------- Response Envelope ----------
exports.McpResponseEnvelopeSchema = zod_1.z.object({
    summary: zod_1.z.string()
        .describe('One-line human-readable explanation of the result.'),
    data: zod_1.z.array(zod_1.z.unknown()).default([])
        .describe('Array of result items.'),
    pagination: exports.PaginationMetaSchema.optional()
        .describe('Pagination metadata. Present on list/search tools.'),
    window: exports.WindowMetaSchema.optional()
        .describe('Windowing metadata. Present when text payloads are bounded.'),
    noise_control: exports.NoiseControlMetaSchema.optional()
        .describe('Noise control metadata showing what was filtered.'),
    source_of_truth: exports.SourceOfTruthSchema.optional()
        .describe('Where this data originated.'),
    warnings: zod_1.z.array(zod_1.z.string()).optional()
        .describe('Non-fatal warnings about the response (e.g. truncated, stale).'),
});
/**
 * Build a standards-compliant response envelope.
 * Every tool handler should return the result of this function.
 */
function buildEnvelope(opts) {
    const total = opts.total ?? opts.data.length;
    const returned = opts.data.length;
    const limit = opts.limit ?? returned;
    const hasMore = total > (opts.data.length);
    const envelope = {
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
function applyWindowing(text, maxChars, startChar = 0, endChar, strategy = 'tail') {
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
    let truncated;
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
function applyProjection(items, fields, excludeFields) {
    if (!fields && !excludeFields)
        return items;
    return items.map((item) => {
        if (fields && fields.length > 0) {
            const projected = {};
            for (const f of fields) {
                if (f in item)
                    projected[f] = item[f];
            }
            return projected;
        }
        if (excludeFields && excludeFields.length > 0) {
            const filtered = { ...item };
            for (const f of excludeFields) {
                delete filtered[f];
            }
            return filtered;
        }
        return item;
    });
}
