#!/usr/bin/env node
import { createMcpServer, startServer, parseManifest } from '@agent-forge/mcp-core';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { debugTools } from './tools/debugTools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestRaw = JSON.parse(
  readFileSync(resolve(__dirname, '../server.manifest.json'), 'utf-8'),
);
const manifest = parseManifest(manifestRaw);

const server = createMcpServer({
  manifest,
  tools: debugTools,
});

startServer(server).catch((error) => {
  console.error('Fatal error starting drupal-operations-debug:', error);
  process.exit(1);
});
