import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { ContentModelAdapter } from '../model/contentModel.js';
import type { DrupalClient } from '@agent-forge/drupal-api-client';

export const inspectContentTypesTool = (client: DrupalClient): ToolDefinition => ({
  name: 'inspect_content_types',
  description: 'Summarize node bundles and editorial settings.',
  inputSchema: SharedArgsSchema.shape,
  handler: async (args) => {
    const adapter = new ContentModelAdapter(client);
    const data = await adapter.listContentTypes();

    return buildEnvelope({
      summary: `Found ${data.length} content types.`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
