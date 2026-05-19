import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpServer, startServer } from './mcp/runtime.js';
import { createIndexerTools } from './tools/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(__dirname, '../server.manifest.json'), 'utf8'),
);

const server = createMcpServer({ manifest, tools: createIndexerTools() });

startServer(server).catch((error: unknown) => {
  console.error('[local-memory-indexer] Fatal startup error:', error);
  process.exit(1);
});
