import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpServer, startServer } from './mcp/runtime.js';
import { createIndexerTools } from './tools/index.js';
import { RunCoordinator } from './indexer/RunCoordinator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(__dirname, '../server.manifest.json'), 'utf8'),
);

// Single coordinator instance for the lifetime of this MCP server process.
const coordinator = new RunCoordinator();

const server = createMcpServer({ manifest, tools: createIndexerTools(coordinator) });

startServer(server).catch((error: unknown) => {
  console.error('[local-memory-indexer] Fatal startup error:', error);
  process.exit(1);
});
