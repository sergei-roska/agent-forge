import { z } from 'zod';
import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { ConfigAnalysisAdapter } from '../analysis/configAnalysis.js';
import type { DrupalClient } from '@agent-forge/drupal-api-client';

export const traceConfigDependenciesTool = (
  client: DrupalClient,
  configDir: string,
): ToolDefinition => ({
  name: 'trace_config_dependencies',
  description: 'Explain dependencies for a config object from sync config.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    config_name: z.string().describe('The machine name of the config object.'),
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

