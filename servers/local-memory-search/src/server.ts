import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpServer, startServer } from './mcp/runtime.js';
import { createSearchTools } from './tools/index.js';
import { SearchEngine } from './search/SearchEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(__dirname, '../server.manifest.json'), 'utf8'),
);

// Single engine instance (caches read-only handles + result cache) for the
// lifetime of this MCP server process.
const engine = new SearchEngine();

const server = createMcpServer({ manifest, tools: createSearchTools(engine) });

startServer(server).catch((error: unknown) => {
  console.error('[local-memory-search] Fatal startup error:', error);
  process.exit(1);
});
