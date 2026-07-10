import { z } from 'zod';
import { buildEnvelope, type ToolDefinition, PaginationArgsSchema, SharedArgsSchema } from '@agent-forge/mcp-core';
import { ContentModelResolver } from '../runtime/contentModelResolver.js';

export const inspectContentTypesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_content_types',
  description: 'List node bundles (content types). Returns: bundle (machine_name), label, revisionable (always true for nodes), workflow (id or null — requires content_moderation module). Use to discover available node types or check their moderation workflow assignment.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    limit: PaginationArgsSchema.shape.limit.describe('Max bundles to return. Integer 1–1000. Default 50.'),
    offset: PaginationArgsSchema.shape.offset.describe('Skip N bundles for pagination.'),
    bundle: z.string().optional().describe('Node bundle machine_name to filter by (e.g. "article"). Omit to list all bundles.'),
  } as any,
  handler: async (args) => {
    const resolver = new ContentModelResolver(rootDir);
    const data = await resolver.inspectContentTypes({
      bundle: args.bundle as string,
      limit: args.limit as number,
      offset: args.offset as number,
    });
    return buildEnvelope({
      summary: `Found ${data.total} content types.`,
      data: data.items,
      source: 'runtime',
      total: data.total,
      limit: args.limit as number,
    });
  },
});

export const inspectMediaTypesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_media_types',
  description: 'List media bundles. Requires the media module. Returns: bundle (machine_name), label, source_plugin (e.g. "image", "video_file"), translatable (boolean — requires content_translation module). Use for media type discovery and source plugin mapping.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    limit: PaginationArgsSchema.shape.limit.describe('Max bundles to return. Integer 1–1000. Default 50.'),
    offset: PaginationArgsSchema.shape.offset.describe('Skip N bundles for pagination.'),
    bundle: z.string().optional().describe('Media bundle machine_name to filter by (e.g. "image"). Omit to list all bundles.'),
  } as any,
  handler: async (args) => {
    const resolver = new ContentModelResolver(rootDir);
    const data = await resolver.inspectMediaTypes({
      bundle: args.bundle as string,
      limit: args.limit as number,
      offset: args.offset as number,
    });
    return buildEnvelope({
      summary: `Found ${data.total} media types.`,
      data: data.items,
      source: 'runtime',
      total: data.total,
      limit: args.limit as number,
    });
  },
});

export const inspectTaxonomyModelsTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_taxonomy_models',
  description: 'List taxonomy vocabularies. Requires the taxonomy module. Returns: vocabulary (machine_name), label. Use before term count or entity-reference analysis.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    limit: PaginationArgsSchema.shape.limit.describe('Max vocabularies to return. Integer 1–1000. Default 50.'),
    offset: PaginationArgsSchema.shape.offset.describe('Skip N vocabularies for pagination.'),
    vocabulary: z.string().optional().describe('Vocabulary machine_name to filter by (e.g. "tags"). Omit to list all vocabularies.'),
  } as any,
  handler: async (args) => {
    const resolver = new ContentModelResolver(rootDir);
    const data = await resolver.inspectTaxonomyModels({
      bundle: args.vocabulary as string, // resolver uses 'bundle' key internally for vocabulary id
      limit: args.limit as number,
      offset: args.offset as number,
    });
    return buildEnvelope({
      summary: `Found ${data.total} vocabularies.`,
      data: data.items,
      source: 'runtime',
      total: data.total,
      limit: args.limit as number,
    });
  },
});

export const inspectFieldUsageTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_field_usage',
  description: 'List fields on an entity type. With bundle: returns name, type, label, bundle for each field on that bundle. Without bundle: aggregates across all bundles using the field map and returns name, type, label, bundles[] for each field. Use to find where a field is used or to enumerate all fields on a bundle.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    limit: PaginationArgsSchema.shape.limit.describe('Max fields to return. Integer 1–1000. Default 50.'),
    offset: PaginationArgsSchema.shape.offset.describe('Skip N fields for pagination.'),
    query: z.string().optional().describe('Case-insensitive substring filter applied to field machine_name and label.'),
    entity_type_id: z.string().describe('Entity type machine_name. Required. Examples: node, media, taxonomy_term.'),
    bundle: z.string().optional().describe('Bundle machine_name to scope the listing. When omitted, fields are aggregated across all bundles and each result includes a bundles[] array.'),
  } as any,
  handler: async (args) => {
    const resolver = new ContentModelResolver(rootDir);
    const data = await resolver.inspectFieldUsage(args.entity_type_id as string, {
      bundle: args.bundle as string,
      query: args.query as string,
      limit: args.limit as number,
      offset: args.offset as number,
    });
    return buildEnvelope({
      summary: `Field usage for ${args.entity_type_id}.`,
      data: data.items,
      source: 'runtime',
      total: data.total,
      limit: args.limit as number,
    });
  },
});

export const inspectReferenceGraphTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_reference_graph',
  description: 'List outgoing reference fields from entity bundles. Scans entity_reference, entity_reference_revisions, image, and file field types. Returns: bundle, field (machine_name), type (field type), target_type (entity type id), target_bundles (array of allowed bundles or "all"). Use to map content relationships (node→media, node→taxonomy, etc.).',
  inputSchema: {
    entity_type_id: z.string().describe('Source entity type machine_name. Required. Examples: node, media, taxonomy_term.'),
    bundle: z.string().optional().describe('Source bundle machine_name to scope the scan (e.g. "article"). Omit to scan all bundles of the entity type.'),
  } as any,
  handler: async (args) => {
    const resolver = new ContentModelResolver(rootDir);
    const data = await resolver.inspectReferenceGraph(args.entity_type_id as string, args.bundle as string);
    return buildEnvelope({
      summary: `Reference graph for ${args.entity_type_id}.`,
      data: data.items,
      source: 'runtime',
    });
  },
});

export const summarizeEditorialModelTool = (rootDir: string): ToolDefinition => ({
  name: 'summarize_editorial_model',
  description: 'Get a high-level editorial architecture snapshot for an entity domain. Composes inspect_content_types, inspect_reference_graph, and inspect_moderation internally. Returns: domain, bundle ("all" if not scoped), bundles_count, reference_edges (total count), moderation (object with moderated, workflow, states), top_references (up to 10 reference edges). Call first for a site architecture overview.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity domain machine_name. Required. Examples: node, media.'),
    bundle: z.string().optional().describe('Scope to one specific bundle machine_name (e.g. "article"). Omit for a domain-wide summary across all bundles.'),
  } as any,
  handler: async (args) => {
    const resolver = new ContentModelResolver(rootDir);
    const data = await resolver.summarizeEditorialModel(args.entity_type_id as string, args.bundle as string);
    return buildEnvelope({
      summary: `Editorial model summary for ${args.entity_type_id}.`,
      data: [data],
      source: 'runtime',
    });
  },
});

export const inspectDisplayModesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_display_modes',
  description: 'List enabled view and form display modes for an entity type or bundle. Only returns modes that are explicitly enabled (not all registered modes). Returns: view_modes (string[]), form_modes (string[]). Use to discover available display/edit configurations.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity type machine_name. Required. Examples: node, media, block_content.'),
    bundle: z.string().optional().describe('Bundle machine_name (e.g. "article"). Required for bundle-scoped results. Omit to get entity-type-level display modes.'),
  } as any,
  handler: async (args) => {
    const resolver = new ContentModelResolver(rootDir);
    const data = await resolver.inspectDisplayModes(args.entity_type_id as string, args.bundle as string);
    return buildEnvelope({
      summary: `Display modes for ${args.entity_type_id}.`,
      data: [data],
      source: 'runtime',
    });
  },
});

export const inspectRevisioningTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_revisioning',
  description: 'Check revision settings for an entity type. Revision behavior is defined at the entity type level, not per-bundle. Returns: revisionable (boolean), revision_ui (boolean — true if a revision handler class is registered). Use to determine whether an entity type supports draft/revision workflows.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity type machine_name. Required. Examples: node, block_content, media.'),
  } as any,
  handler: async (args) => {
    const resolver = new ContentModelResolver(rootDir);
    const data = await resolver.inspectRevisioning(args.entity_type_id as string, args.bundle as string);
    return buildEnvelope({
      summary: `Revisioning info for ${args.entity_type_id}.`,
      data: [data],
      source: 'runtime',
    });
  },
});

export const inspectTranslationTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_translation',
  description: 'Check content translation status via the content_translation module. Returns: translatable (boolean). Bundle-level translation is checked when bundle is provided; otherwise falls back to entity-type-level check. Returns translatable: false if the content_translation module is not installed. Use to determine multilingual capability.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity type machine_name. Required. Examples: node, media, taxonomy_term.'),
    bundle: z.string().optional().describe('Bundle machine_name for bundle-level check (e.g. "article"). Omit to check entity-type-level translation status.'),
  } as any,
  handler: async (args) => {
    const resolver = new ContentModelResolver(rootDir);
    const data = await resolver.inspectTranslation(args.entity_type_id as string, args.bundle as string);
    return buildEnvelope({
      summary: `Translation status for ${args.entity_type_id}.`,
      data: [data],
      source: 'runtime',
    });
  },
});

export const inspectModerationTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_moderation',
  description: 'Check content moderation workflow assignment for an entity type + bundle pair. Requires the content_moderation module; returns moderated: false immediately if module is absent. With bundle: returns moderated (boolean), workflow (machine_name of the assigned workflow), states (string[] of state ids). Without bundle: always returns moderated: false — provide bundle to get meaningful results.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity type machine_name. Required. Examples: node.'),
    bundle: z.string().optional().describe('Bundle machine_name. Strongly recommended — without it the tool always returns moderated: false because workflow assignment is per-bundle (e.g. "article").'),
  } as any,
  handler: async (args) => {
    const resolver = new ContentModelResolver(rootDir);
    const data = await resolver.inspectModeration(args.entity_type_id as string, args.bundle as string);
    return buildEnvelope({
      summary: `Moderation info for ${args.entity_type_id}.`,
      data: [data],
      source: 'runtime',
    });
  },
});
