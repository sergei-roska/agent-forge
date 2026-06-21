import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectFieldsTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_fields',
  description: 'List field definitions for an entity type. Returns field_name, field_type, label, required, translatable. Omit bundle for base fields; set bundle for bundle-specific fields.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    entity_type_id: z.string().describe('Entity type machine_name. Examples: node, user, taxonomy_term.'),
    bundle: z.string().optional().describe('Bundle machine_name. Examples: article, page. Omit for base fields only.'),
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
