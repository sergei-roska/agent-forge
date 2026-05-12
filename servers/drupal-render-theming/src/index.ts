import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { renderTools } from './tools/renderTools.js';

async function main() {
  const server = new McpServer({
    name: 'agent-forge/drupal-render-theming',
    version: '0.1.0'
  }, {
    capabilities: {
      tools: {}
    }
  });

  // Register tools
  for (const tool of renderTools) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema as any,
      tool.handler as any
    );
  }

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Drupal Render & Theming MCP server running on stdio');
  } catch (error: any) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
