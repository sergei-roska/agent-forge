import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { captureTools } from './tools/captureTools.js';
import { BrowserManager } from './browser/browserManager.js';

async function main() {
  const server = new McpServer({
    name: 'agent-forge/web-observe-capture',
    version: '0.1.0'
  }, {
    capabilities: {
      tools: {}
    }
  });

  // Register tools
  for (const tool of captureTools) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema as any,
      tool.handler as any
    );
  }

  // Handle shutdown
  process.on('SIGINT', async () => {
    await BrowserManager.getInstance().shutdown();
    process.exit(0);
  });

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Web Observe & Capture MCP server running on stdio');
  } catch (error: any) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
