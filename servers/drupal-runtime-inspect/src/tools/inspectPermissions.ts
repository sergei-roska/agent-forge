import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectPermissionsTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_permissions',
  description: 'List permission definitions. Returns permission machine_name and title. Use for access-control or role analysis.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    query: z.string().optional().describe('Filter by permission machine_name substring.'),
  },
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectPermissions(args.query as string);

    return buildEnvelope({
      summary: `Found ${data.length} permissions matching query.`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
