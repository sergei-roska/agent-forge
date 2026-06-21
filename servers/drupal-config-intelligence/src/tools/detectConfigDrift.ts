import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { ConfigAnalysisAdapter } from '../analysis/configAnalysis.js';
import type { DrupalClient } from '@agent-forge/drupal-api-client';

export const detectConfigDriftTool = (client: DrupalClient, configDir: string): ToolDefinition => ({
  name: 'detect_config_drift',
  description: 'List all active≠sync configs (drush cst). Returns name + operation per item. Use for site-wide drift audit.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    prefix: z.string().optional()
      .describe('Filter by config name prefix. Example: views.view., field.storage.'),
  } as any,
  handler: async (args) => {
    const adapter = new ConfigAnalysisAdapter(client, configDir);
    const data = await adapter.detectDrift(args.prefix as string | undefined);

    return buildEnvelope({
      summary: `Detected drift between active and sync storage.`,
      data: [data],
      source: 'mixed',
      verbosity: args.verbosity,
    });
  },
});
