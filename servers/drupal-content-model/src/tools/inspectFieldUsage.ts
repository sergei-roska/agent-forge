import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { ContentModelAdapter } from '../model/contentModel.js';
import type { DrupalClient } from '@agent-forge/drupal-api-client';

export const inspectFieldUsageTool = (client: DrupalClient): ToolDefinition => ({
  name: 'inspect_field_usage',
  description: 'Explain how fields are used across bundles.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    entity_type_id: z.string().describe('The machine name of the entity type.'),
    bundle: z.string().optional().describe('Optional bundle to filter usage by.'),
  },
  handler: async (args) => {
    const adapter = new ContentModelAdapter(client);
    const data = await adapter.getFieldUsage(args.entity_type_id as string, args.bundle as string | undefined);

    return buildEnvelope({
      summary: `Field usage for entity type "${args.entity_type_id}".`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
