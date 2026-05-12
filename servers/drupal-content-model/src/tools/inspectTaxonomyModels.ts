import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { ContentModelAdapter } from '../model/contentModel.js';
import type { DrupalClient } from '@agent-forge/drupal-api-client';

export const inspectTaxonomyModelsTool = (client: DrupalClient): ToolDefinition => ({
  name: 'inspect_taxonomy_models',
  description: 'Summarize taxonomy vocabularies and model shape.',
  inputSchema: SharedArgsSchema.shape,
  handler: async (args) => {
    const adapter = new ContentModelAdapter(client);
    const data = await adapter.listTaxonomyModels();

    return buildEnvelope({
      summary: `Found ${data.length} taxonomy models.`,
      data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});

