import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

const PaginatedArgsSchema = {
  ...SharedArgsSchema.shape,
  limit: z.number().int().min(1).max(500).optional().describe('Number of items to return.'),
  offset: z.number().int().min(0).optional().describe('Number of items to skip.'),
};

export const inspectEntityTypesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_entity_types',
  description: 'List entity type IDs, labels, providers, and high-level capabilities.',
  inputSchema: { ...PaginatedArgsSchema },
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
