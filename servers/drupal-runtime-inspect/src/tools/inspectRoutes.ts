import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectRoutesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_routes',
  description: 'Search Symfony routes. Returns route_name, path, controller, requirements. Pass path starting with / for direct match; else filter by route_name or path substring.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    query: z.string().optional().describe('Route path (/node/1) or route_name/path substring.'),
    limit: z.number().int().min(1).max(500).optional().describe('Max items. Integer 1–500. Default 50.'),
    offset: z.number().int().min(0).optional().describe('Skip N items for pagination.'),
  },
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectRoutes({
      query: args.query as string,
      limit: args.limit as number,
      offset: args.offset as number,
    });

    return buildEnvelope({
      summary: `Found ${data.total} routes (showing ${data.items.length}).`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
