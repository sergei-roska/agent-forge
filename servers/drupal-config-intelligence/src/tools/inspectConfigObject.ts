import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { ConfigAnalysisAdapter } from '../analysis/configAnalysis.js';
import type { DrupalClient } from '@agent-forge/drupal-api-client';

export const inspectConfigObjectTool = (client: DrupalClient, configDir: string): ToolDefinition => ({
  name: 'inspect_config_object',
  description: 'Read one Drupal config as JSON. Returns active DB and/or sync YAML values. Use to inspect a single machine name.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    config_name: z.string().describe('Config machine name. Examples: system.site, node.type.article.'),
    source: z.enum(['active', 'sync', 'both']).default('both')
      .describe('active=DB, sync=config/sync export, both=compare side-by-side.'),
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
