import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectModulesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_modules',
  description: 'List enabled modules and compact metadata.',
  inputSchema: SharedArgsSchema.shape,
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectModules({
      query: args.query as string,
    });

    return buildEnvelope({
      summary: `Found ${data.length} enabled modules.`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
