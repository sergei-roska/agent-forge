import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { McpResponseEnvelope } from './envelope.js';

export interface ToolDefinition<TInput extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: TInput;
  handler: (args: z.input<z.ZodObject<TInput>>) => Promise<McpResponseEnvelope>;
}

export interface ServerManifest {
  id: string;
  version: string;
  name?: string;
  description?: string;
  domain: string;
}

export function createMcpServer(options: {
  manifest: ServerManifest;
  tools: ToolDefinition[];
}): McpServer {
  const server = new McpServer(
    { name: options.manifest.id, version: options.manifest.version },
    { capabilities: { logging: {} } },
  );

  for (const tool of options.tools) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (args) => {
      try {
        const result = await tool.handler(args as never);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : String(error),
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  return server;
}

export async function startServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] Server connected via stdio');
}
