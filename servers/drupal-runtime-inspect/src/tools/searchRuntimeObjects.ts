import { z } from 'zod';
import { buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const searchRuntimeObjectsTool = (rootDir: string): ToolDefinition => ({
  name: 'search_runtime_objects',
  description: 'Global search across entity types, modules, and routes.',
  inputSchema: {
    query: z.string().describe('Search query string.'),
  },
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.searchRuntimeObjects(args.query as string);

    return buildEnvelope({
      summary: `Search results for "${args.query}".`,
      data: data,
      source: 'runtime',
      verbosity: 'normal',
    });
  },
});
