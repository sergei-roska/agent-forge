import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

const PaginatedArgsSchema = {
  ...SharedArgsSchema.shape,
  limit: z.number().int().min(1).max(500).optional().describe('Number of items to return.'),
  offset: z.number().int().min(0).optional().describe('Number of items to skip.'),
};

export const inspectServicesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_services',
  description: 'Return curated service container discovery.',
  inputSchema: { ...PaginatedArgsSchema },
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectServices({
      query: args.query as string,
      limit: args.limit as number,
      offset: args.offset as number,
    });

    return buildEnvelope({
      summary: `Found ${data.total} services (showing ${data.items.length}).`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
