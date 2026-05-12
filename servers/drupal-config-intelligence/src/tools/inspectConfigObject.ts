import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { ConfigAnalysisAdapter } from '../analysis/configAnalysis.js';
import type { DrupalClient } from '@agent-forge/drupal-api-client';

export const inspectConfigObjectTool = (client: DrupalClient, configDir: string): ToolDefinition => ({
  name: 'inspect_config_object',
  description: 'Read one config object from active or sync storage.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    config_name: z.string().describe('The machine name of the config object (e.g. system.site).'),
    source: z.enum(['active', 'sync', 'both']).default('both').describe('Which storage to read from.'),
  } as any,
  handler: async (args) => {
    const adapter = new ConfigAnalysisAdapter(client, configDir);
    const data = await adapter.inspectConfig(args.config_name as string, args.source as 'active' | 'sync' | 'both');
    const warnings = Array.isArray(data?.warnings) ? data.warnings : [];

    return buildEnvelope({
      summary: `Config object "${args.config_name}" from ${args.source} storage.`,
      data: [data],
      source: 'mixed',
      verbosity: args.verbosity,
      warnings,
    });
  },
});
