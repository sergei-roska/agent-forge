import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectFieldsTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_fields',
  description: 'List base and configurable fields known at runtime.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    entity_type_id: z.string().describe('The entity type ID.'),
    bundle: z.string().optional().describe('Filter fields by bundle name.'),
  },
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectFields(args.entity_type_id as string, args.bundle as string);

    return buildEnvelope({
      summary: `Found ${data.items.length} fields for "${args.entity_type_id}"${args.bundle ? ` (bundle: ${args.bundle})` : ''}.`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
