import { z } from 'zod';
import { buildEnvelope, type ToolDefinition, PaginationArgsSchema, SharedArgsSchema } from '@agent-forge/mcp-core';
import { ContentModelResolver } from '../runtime/contentModelResolver.js';

export const inspectContentTypesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_content_types',
  description: 'List node bundles (content types). Returns bundle, label, revisionable, workflow. Use to discover types or check moderation assignment.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    limit: PaginationArgsSchema.shape.limit.describe('Max bundles to return. Integer 1–1000. Default 50.'),
    offset: PaginationArgsSchema.shape.offset.describe('Skip N bundles for pagination.'),
    bundle: z.string().optional().describe('Node bundle machine_name (e.g. article). Omit to list all.'),
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
  description: 'List media bundles. Returns bundle, label, source_plugin, translatable. Use for media type and source plugin mapping.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    limit: PaginationArgsSchema.shape.limit.describe('Max bundles to return. Integer 1–1000. Default 50.'),
    offset: PaginationArgsSchema.shape.offset.describe('Skip N bundles for pagination.'),
    bundle: z.string().optional().describe('Media bundle machine_name (e.g. image). Omit to list all.'),
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
  description: 'List taxonomy vocabularies. Returns vocabulary id, label. Use before term or reference analysis.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    limit: PaginationArgsSchema.shape.limit.describe('Max vocabularies to return. Integer 1–1000. Default 50.'),
    offset: PaginationArgsSchema.shape.offset.describe('Skip N vocabularies for pagination.'),
    vocabulary: z.string().optional().describe('Vocabulary machine_name (e.g. tags). Omit to list all.'),
  } as any,
  handler: async (args) => {
    const resolver = new ContentModelResolver(rootDir);
    const data = await resolver.inspectTaxonomyModels({
      bundle: args.vocabulary as string,
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
  description: 'List fields on an entity type. Returns name, type, label, bundle(s). Use to find field placement or enumerate bundle fields.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    limit: PaginationArgsSchema.shape.limit.describe('Max fields to return. Integer 1–1000. Default 50.'),
    offset: PaginationArgsSchema.shape.offset.describe('Skip N fields for pagination.'),
    query: z.string().optional().describe('Filter by field machine_name or label substring (case-insensitive).'),
    entity_type_id: z.string().describe('Entity type machine_name. Required. Examples: node, media, taxonomy_term.'),
    bundle: z.string().optional().describe('Bundle machine_name. Omit to aggregate fields across all bundles.'),
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
  description: 'List outgoing entity references from bundles. Returns bundle, field, type, target_type, target_bundles. Use to map content relationships (node→media, node→taxonomy, etc.).',
  inputSchema: {
    entity_type_id: z.string().describe('Source entity type machine_name. Required. Examples: node, media.'),
    bundle: z.string().optional().describe('Source bundle machine_name (e.g. article). Omit to scan all bundles.'),
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
  description: 'Get high-level editorial snapshot. Returns bundle count, reference edges, moderation, top references. Call first for site architecture overview.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity domain machine_name. Required. Examples: node, media.'),
    bundle: z.string().optional().describe('Scope to one bundle machine_name. Omit for domain-wide summary.'),
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
  description: 'List enabled view and form modes for a bundle. Returns view_modes, form_modes arrays. Use for display or edit form configuration.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity type machine_name. Required. Examples: node, media, block_content.'),
    bundle: z.string().optional().describe('Bundle machine_name. Provide for bundle-specific modes (e.g. article).'),
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
  description: 'Check entity type revision settings. Returns revisionable, revision_ui. Use for draft/revision behavior questions.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity type machine_name. Required. Examples: node, block_content.'),
    bundle: z.string().optional().describe('Ignored — revision applies at entity type level.'),
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
  description: 'Check content translation status. Returns translatable boolean. Use when multilingual setup matters.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity type machine_name. Required. Examples: node, media, taxonomy_term.'),
    bundle: z.string().optional().describe('Bundle machine_name. Omit to check entity-type default.'),
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
  description: 'Get content moderation workflow for a bundle. Returns moderated, workflow id, states. Use to find publishing workflow and states.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity type machine_name. Required. Usually node.'),
    bundle: z.string().optional().describe('Bundle machine_name. Required to resolve workflow (e.g. article).'),
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
