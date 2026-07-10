import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectEntityTypesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_entity_types',
  description: 'List registered entity types. Returns entity_type_id, label, provider, class, handlers (storage class). Use before bundle/field lookups or to confirm a type exists at runtime.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    query: z.string().optional().describe('Filter by entity_type_id or label substring (case-insensitive).'),
    fields: z.array(z.string()).optional().describe('Response keys to keep. Examples: entity_type_id, label, provider.'),
    limit: z.number().int().min(1).max(500).optional().describe('Max items. Integer 1–500. Default 100.'),
    offset: z.number().int().min(0).optional().describe('Skip N items for pagination.'),
  },
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectEntityTypes({
      query: args.query as string,
      fields: args.fields as string[],
      limit: args.limit as number,
      offset: args.offset as number,
    });

    return buildEnvelope({
      summary: `Found ${data.total} entity types (showing ${data.items.length}).`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
