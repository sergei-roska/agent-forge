import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectBundlesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_bundles',
  description: 'List bundles for one entity type. Returns bundle machine_name and label. Use after inspect_entity_types when entity_type_id is known.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    entity_type_id: z.string().describe('Entity type machine_name. Examples: node, taxonomy_term, media.'),
  },
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectBundles(args.entity_type_id as string);

    return buildEnvelope({
      summary: `Found ${data.length} bundles for entity type "${args.entity_type_id}".`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
