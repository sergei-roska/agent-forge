import { z } from 'zod';
import { buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const searchRuntimeObjectsTool = (rootDir: string): ToolDefinition => ({
  name: 'search_runtime_objects',
  description: 'Broad discovery across entity types and modules when the target type is unknown. Returns up to 5 matching entity_types and module machine_names per query. Prefer specific inspect_* tools once the object type is known.',
  inputSchema: {
    query: z.string().describe('Substring to match entity_type_id or module machine_name.'),
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
