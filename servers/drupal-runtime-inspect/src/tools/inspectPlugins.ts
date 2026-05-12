import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectPluginsTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_plugins',
  description: 'List plugin types and definitions.',
  inputSchema: SharedArgsSchema.shape,
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
