import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { ContentModelAdapter } from '../model/contentModel.js';
import type { DrupalClient } from '@agent-forge/drupal-api-client';

export const inspectReferenceGraphTool = (client: DrupalClient): ToolDefinition => ({
  name: 'inspect_reference_graph',
  description: 'Show entity reference edges between bundles.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    entity_type_id: z.string().describe('The machine name of the entity type.'),
    bundle: z.string().optional().describe('Optional bundle to start from.'),
    max_depth: z.number().int().min(1).max(3).default(1).describe('Max graph depth.'),
  },
  handler: async (args) => {
    const adapter = new ContentModelAdapter(client);
    const data = await adapter.getReferenceGraph(args.entity_type_id as string, args.bundle as string | undefined);

    return buildEnvelope({
      summary: `Reference graph for entity type "${args.entity_type_id}".`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
