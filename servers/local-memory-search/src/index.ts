#!/usr/bin/env node
import { createMcpServer, startServer } from './mcp/runtime.js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalVectorSearchTools } from './tools/tools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestRaw = JSON.parse(
  readFileSync(resolve(__dirname, '../server.manifest.json'), 'utf8'),
);
const manifest = manifestRaw;

const server = createMcpServer({
  manifest,
  tools: createLocalVectorSearchTools(),
});

startServer(server).catch((error: unknown) => {
  console.error('Fatal error starting local-memory-search:', error);
  process.exit(1);
});
