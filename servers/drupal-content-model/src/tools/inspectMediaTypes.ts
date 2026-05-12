import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { ContentModelAdapter } from '../model/contentModel.js';
import type { DrupalClient } from '@agent-forge/drupal-api-client';

export const inspectMediaTypesTool = (client: DrupalClient): ToolDefinition => ({
  name: 'inspect_media_types',
  description: 'Summarize media bundles and source plugin usage.',
  inputSchema: SharedArgsSchema.shape,
  handler: async (args) => {
    const adapter = new ContentModelAdapter(client);
    const data = await adapter.listMediaTypes();

    return buildEnvelope({
      summary: `Found ${data.length} media types.`,
      data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});

