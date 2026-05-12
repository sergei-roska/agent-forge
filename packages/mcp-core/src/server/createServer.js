"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMcpServer = createMcpServer;
exports.startServer = startServer;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const errors_js_1 = require("../errors.js");
const foundationTools_js_1 = require("./foundationTools.js");
/**
 * Create and bootstrap an MCP server with foundation tools and domain tools.
 */
function createMcpServer(options) {
    const { manifest, tools = [] } = options;
    const server = new mcp_js_1.McpServer({ name: manifest.id, version: manifest.version }, { capabilities: { logging: {} } });
    // Register foundation tools
    const foundationTools = (0, foundationTools_js_1.getFoundationTools)(manifest, tools);
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
function registerTool(server, tool) {
    // Use the high-level tool method from McpServer
    server.tool(tool.name, tool.description, tool.inputSchema, async (args) => {
        try {
            const result = await tool.handler(args);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            const errorPayload = error instanceof errors_js_1.McpError
                ? error.toJSON()
                : { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) };
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(errorPayload, null, 2),
                    },
                ],
                isError: true,
            };
        }
    });
}
/**
 * Start the MCP server on stdio transport.
 */
async function startServer(server) {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error(`[MCP] Server connected via stdio`);
}
