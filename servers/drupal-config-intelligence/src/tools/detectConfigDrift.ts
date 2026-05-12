import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { ConfigAnalysisAdapter } from '../analysis/configAnalysis.js';
import type { DrupalClient } from '@agent-forge/drupal-api-client';

export const detectConfigDriftTool = (client: DrupalClient, configDir: string): ToolDefinition => ({
  name: 'detect_config_drift',
  description: 'Find mismatches between active storage and sync storage.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    prefix: z.string().optional().describe('Optional prefix to filter config names.'),
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
