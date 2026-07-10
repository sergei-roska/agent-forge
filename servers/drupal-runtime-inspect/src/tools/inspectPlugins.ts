import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectPluginsTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_plugins',
  description: 'List plugin definitions for block, filter, condition, and queue_worker types. Returns plugin_type, plugin_id, label, class. The query filter matches plugin_id substring only. Not a full plugin registry scan.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    query: z.string().optional().describe('Filter by plugin_id substring.'),
  },
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectPlugins(args.query as string);

    return buildEnvelope({
      summary: `Found ${data.items.length} plugins.`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
