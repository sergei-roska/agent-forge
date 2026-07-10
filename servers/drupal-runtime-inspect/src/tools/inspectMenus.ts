import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectMenusTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_menus',
  description: 'List menu config entities. Returns id and label. Use before menu link or navigation analysis.',
  inputSchema: SharedArgsSchema.shape,
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectMenus();

    return buildEnvelope({
      summary: `Found ${data.items.length} menus.`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
