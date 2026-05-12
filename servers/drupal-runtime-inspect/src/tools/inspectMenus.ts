import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectMenusTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_menus',
  description: 'List all menus defined in the system.',
  inputSchema: SharedArgsSchema.shape,
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectMenus();

    return buildEnvelope({
      summary: `Found ${data.length} menus.`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
