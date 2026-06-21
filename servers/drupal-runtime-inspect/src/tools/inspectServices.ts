import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectServicesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_services',
  description: 'Search DI container services. Returns service id and resolved class. Exact id match when query equals a service id; else substring search.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    query: z.string().optional().describe('Exact service id or substring. Example: entity_type.manager.'),
    limit: z.number().int().min(1).max(500).optional().describe('Max items. Integer 1–500. Default 100.'),
    offset: z.number().int().min(0).optional().describe('Skip N items for pagination.'),
  },
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
