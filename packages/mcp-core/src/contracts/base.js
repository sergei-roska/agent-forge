"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedArgsSchema = exports.WindowingArgsSchema = exports.NoiseControlArgsSchema = exports.ProjectionArgsSchema = exports.FilterArgsSchema = exports.PaginationArgsSchema = exports.VerbositySchema = void 0;
const zod_1 = require("zod");
// ---------- Verbosity ----------
// Blueprint canonical levels: minimal, normal, diagnostic, raw
exports.VerbositySchema = zod_1.z.enum(['minimal', 'normal', 'diagnostic', 'raw']).default('minimal');
// ---------- Pagination Args ----------
exports.PaginationArgsSchema = zod_1.z.object({
    limit: zod_1.z.number().int().min(1).max(1000).default(50)
        .describe('Maximum number of items to return.'),
    cursor: zod_1.z.string().optional()
        .describe('Opaque cursor for keyset pagination.'),
    offset: zod_1.z.number().int().min(0).optional()
        .describe('Offset-based pagination alternative to cursor.'),
    sort: zod_1.z.string().optional()
        .describe('Field name to sort by.'),
    sort_direction: zod_1.z.enum(['ASC', 'DESC']).default('ASC')
        .describe('Sort direction.'),
});
// ---------- Filter Args ----------
exports.FilterArgsSchema = zod_1.z.object({
    query: zod_1.z.string().optional()
        .describe('Free-text search query.'),
    filters: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional()
        .describe('Key-value filters specific to the tool domain.'),
});
// ---------- Projection Args ----------
exports.ProjectionArgsSchema = zod_1.z.object({
    fields: zod_1.z.array(zod_1.z.string()).optional()
        .describe('Include only these fields in each item.'),
    exclude_fields: zod_1.z.array(zod_1.z.string()).optional()
        .describe('Exclude these fields from each item.'),
    expand: zod_1.z.array(zod_1.z.string()).optional()
        .describe('Expand nested references for these fields.'),
});
// ---------- Noise Control Args ----------
exports.NoiseControlArgsSchema = zod_1.z.object({
    verbosity: exports.VerbositySchema,
    summary_only: zod_1.z.boolean().default(false)
        .describe('Return only the summary field, omit data array.'),
    include_counts: zod_1.z.boolean().default(true)
        .describe('Include count metadata in the response.'),
    exclude_noise: zod_1.z.boolean().default(true)
        .describe('Suppress common Drupal metadata noise.'),
});
// ---------- Windowing Args ----------
exports.WindowingArgsSchema = zod_1.z.object({
    max_chars: zod_1.z.number().int().min(100).max(100_000).default(10_000)
        .describe('Maximum character length for large text payloads.'),
    start_char: zod_1.z.number().int().min(0).default(0)
        .describe('Start offset within the text payload.'),
    end_char: zod_1.z.number().int().optional()
        .describe('End offset within the text payload.'),
    truncate_strategy: zod_1.z.enum(['head', 'middle', 'tail']).default('tail')
        .describe('Where to truncate when payload exceeds max_chars.'),
});
// ---------- Combined Shared Args ----------
exports.SharedArgsSchema = exports.PaginationArgsSchema
    .merge(exports.FilterArgsSchema)
    .merge(exports.ProjectionArgsSchema)
    .merge(exports.NoiseControlArgsSchema)
    .merge(exports.WindowingArgsSchema);
