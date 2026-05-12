import { z } from 'zod';
import { buildEnvelope, type ToolDefinition, SharedArgsSchema } from '@agent-forge/mcp-core';
import { ContentModelResolver } from '../runtime/contentModelResolver.js';

export const inspectContentTypesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_content_types',
  description: 'Summarize node bundles and editorial settings.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    bundle: z.string().optional().describe('Optional node bundle to filter by.'),
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
  description: 'Summarize media bundles and source plugins.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    bundle: z.string().optional().describe('Optional media bundle to filter by.'),
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
  description: 'Summarize vocabularies and term architecture.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    vocabulary: z.string().optional().describe('Optional vocabulary to filter by.'),
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
  description: 'Query field usage across bundles with pagination.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    entity_type_id: z.string().describe('Target entity type (e.g. node, media).'),
    bundle: z.string().optional().describe('Filter by bundle.'),
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
  description: 'Show entity reference edges between bundles (CLEANED).',
  inputSchema: {
    entity_type_id: z.string().describe('Source entity type ID.'),
    bundle: z.string().optional().describe('Optional source bundle.'),
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
  description: 'Produce a narrative summary of the content model (BOUNDED).',
  inputSchema: {
    entity_type_id: z.string().describe('Domain (node, media, taxonomy).'),
    bundle: z.string().optional().describe('Focus on a specific bundle.'),
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
  description: 'Summarize view mode and form mode usage.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity type ID.'),
    bundle: z.string().optional().describe('Filter by bundle.'),
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
  description: 'Explain revisioning defaults and UI implications.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity type ID.'),
    bundle: z.string().optional().describe('Filter by bundle.'),
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
  description: 'Summarize translatability at entity and bundle levels.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity type ID.'),
    bundle: z.string().optional().describe('Filter by bundle.'),
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
  description: 'Map bundles to content moderation workflows.',
  inputSchema: {
    entity_type_id: z.string().describe('Entity type ID.'),
    bundle: z.string().optional().describe('Filter by bundle.'),
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
