import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { ConfigAnalysisAdapter } from '../analysis/configAnalysis.js';
import type { DrupalClient } from '@agent-forge/drupal-api-client';

export const traceConfigDependenciesTool = (
  client: DrupalClient,
  configDir: string,
): ToolDefinition => ({
  name: 'trace_config_dependencies',
  description: 'Trace config dependency graph from sync storage. Returns requires/required_by lists. Use before delete or rename.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    config_name: z.string().describe('Root config machine name.'),
  } as any,
  handler: async (args) => {
    const adapter = new ConfigAnalysisAdapter(client, configDir);
    const data = await adapter.getDependencies(args.config_name as string);

    return buildEnvelope({
      summary: `Dependencies for "${args.config_name}".`,
      data: [data],
      source: 'config_sync',
      verbosity: args.verbosity,
    });
  },
});

