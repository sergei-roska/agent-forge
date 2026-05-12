import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { McpError } from '../errors.js';
import { buildEnvelope, type McpResponseEnvelope } from '../contracts/response.js';
import type { ServerManifest } from './manifest.js';
import { getFoundationTools } from './foundationTools.js';

// ---------- Tool Definition ----------

export interface ToolDefinition<TInput extends z.ZodRawShape = z.ZodRawShape> {
  /** Tool name — must be unique within the server. */
  name: string;
  /** Human-readable description for agent consumption. */
  description: string;
  /** Zod shape for input arguments. */
  inputSchema: TInput;
  /** Tool handler — receives validated args, returns an envelope. */
  handler: (args: any) => Promise<McpResponseEnvelope>;
}

// ---------- Server Factory ----------

export interface CreateServerOptions {
  manifest: ServerManifest;
  tools?: ToolDefinition<any>[];
}

/**
 * Create and bootstrap an MCP server with foundation tools and domain tools.
 */
export function createMcpServer(options: CreateServerOptions): McpServer {
  const { manifest, tools = [] } = options;

  const server = new McpServer(
    { name: manifest.id, version: manifest.version },
    { capabilities: { logging: {} } }
  );

  // Register foundation tools
  const foundationTools = getFoundationTools(manifest, tools as ToolDefinition[]);
  for (const tool of foundationTools) {
    registerTool(server, tool);
  }

  // Register domain-specific tools
  for (const tool of tools) {
    registerTool(server, tool);
  }

  return server;
}

/**
 * Register a single tool on the McpServer with standardized error handling.
 */
function registerTool(
  server: McpServer,
  tool: ToolDefinition<any>,
): void {
  // Use the high-level tool method from McpServer
  server.tool(
    tool.name,
    tool.description,
    tool.inputSchema,
    async (args: any) => {
      try {
        const result = await tool.handler(args);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorPayload = error instanceof McpError
          ? error.toJSON()
          : { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(errorPayload, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Start the MCP server on stdio transport.
 */
export async function startServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[MCP] Server connected via stdio`);
}
