import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectThemesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_themes',
  description: 'List installed themes. Returns machine_name, name, is_default (true for the active frontend theme). Use to identify the active theme at runtime.',
  inputSchema: SharedArgsSchema.shape,
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectThemes();

    return buildEnvelope({
      summary: `Found ${data.items.length} installed themes.`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
