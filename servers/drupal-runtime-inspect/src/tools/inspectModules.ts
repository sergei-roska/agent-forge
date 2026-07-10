import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectModulesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_modules',
  description: 'List enabled modules. Returns machine_name, name, version. Use to verify a module is active at runtime (not filesystem).',
  inputSchema: {
    ...SharedArgsSchema.shape,
    query: z.string().optional().describe('Filter by machine_name or name substring (case-insensitive).'),
    limit: z.number().int().min(1).max(500).optional().describe('Max items. Integer 1–500. Default 100.'),
    offset: z.number().int().min(0).optional().describe('Skip N items for pagination.'),
  },
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectModules({
      query: args.query as string,
      limit: args.limit as number,
      offset: args.offset as number,
    });

    return buildEnvelope({
      summary: `Found ${data.total} enabled modules (showing ${data.items.length}).`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
