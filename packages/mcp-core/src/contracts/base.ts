import { z } from 'zod';

// ---------- Verbosity ----------
// Blueprint canonical levels: minimal, normal, diagnostic, raw
export const VerbositySchema = z.enum(['minimal', 'normal', 'diagnostic', 'raw']).default('minimal');
export type Verbosity = z.infer<typeof VerbositySchema>;

// ---------- Pagination Args ----------
export const PaginationArgsSchema = z.object({
  limit: z.number().int().min(1).max(1000).default(50)
    .describe('Maximum number of items to return.'),
  cursor: z.string().optional()
    .describe('Opaque cursor for keyset pagination.'),
  offset: z.number().int().min(0).optional()
    .describe('Offset-based pagination alternative to cursor.'),
  sort: z.string().optional()
    .describe('Field name to sort by.'),
  sort_direction: z.enum(['ASC', 'DESC']).default('ASC')
    .describe('Sort direction.'),
});
export type PaginationArgs = z.infer<typeof PaginationArgsSchema>;

// ---------- Filter Args ----------
export const FilterArgsSchema = z.object({
  query: z.string().optional()
    .describe('Free-text search query.'),
  filters: z.record(z.string(), z.unknown()).optional()
    .describe('Key-value filters specific to the tool domain.'),
});
export type FilterArgs = z.infer<typeof FilterArgsSchema>;

// ---------- Projection Args ----------
export const ProjectionArgsSchema = z.object({
  fields: z.array(z.string()).optional()
    .describe('Include only these fields in each item.'),
  exclude_fields: z.array(z.string()).optional()
    .describe('Exclude these fields from each item.'),
  expand: z.array(z.string()).optional()
    .describe('Expand nested references for these fields.'),
});
export type ProjectionArgs = z.infer<typeof ProjectionArgsSchema>;

// ---------- Noise Control Args ----------
export const NoiseControlArgsSchema = z.object({
  verbosity: VerbositySchema,
  summary_only: z.boolean().default(false)
    .describe('Return only the summary field, omit data array.'),
  include_counts: z.boolean().default(true)
    .describe('Include count metadata in the response.'),
  exclude_noise: z.boolean().default(true)
    .describe('Suppress common Drupal metadata noise.'),
});
export type NoiseControlArgs = z.infer<typeof NoiseControlArgsSchema>;

// ---------- Windowing Args ----------
export const WindowingArgsSchema = z.object({
  max_chars: z.number().int().min(100).max(100_000).default(10_000)
    .describe('Maximum character length for large text payloads.'),
  start_char: z.number().int().min(0).default(0)
    .describe('Start offset within the text payload.'),
  end_char: z.number().int().optional()
    .describe('End offset within the text payload.'),
  truncate_strategy: z.enum(['head', 'middle', 'tail']).default('tail')
    .describe('Where to truncate when payload exceeds max_chars.'),
});
export type WindowingArgs = z.infer<typeof WindowingArgsSchema>;

// ---------- Combined Shared Args ----------
export const SharedArgsSchema = PaginationArgsSchema
  .merge(FilterArgsSchema)
  .merge(ProjectionArgsSchema)
  .merge(NoiseControlArgsSchema)
  .merge(WindowingArgsSchema);

export type SharedArgs = z.infer<typeof SharedArgsSchema>;
