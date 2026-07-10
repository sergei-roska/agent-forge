import { SharedArgsSchema, buildEnvelope, type ToolDefinition } from '@agent-forge/mcp-core';
import { RuntimeResolver } from '../runtime/runtimeResolver.js';

export const inspectVocabulariesTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_vocabularies',
  description: 'List taxonomy vocabularies. Returns vid and name. Use before term or reference field analysis.',
  inputSchema: SharedArgsSchema.shape,
  handler: async (args) => {
    const resolver = new RuntimeResolver(rootDir);
    const data = await resolver.inspectVocabularies();

    return buildEnvelope({
      summary: `Found ${data.items.length} vocabularies.`,
      data: data,
      source: 'runtime',
      verbosity: args.verbosity,
    });
  },
});
