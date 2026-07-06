#!/usr/bin/env node
import { createMcpServer, startServer, parseManifest } from '@agent-forge/mcp-core';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureTools } from './tools/captureTools.js';
import { BrowserManager } from './browser/browserManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestRaw = JSON.parse(
  readFileSync(resolve(__dirname, '../server.manifest.json'), 'utf-8'),
);
const manifest = parseManifest(manifestRaw);

const server = createMcpServer({
  manifest,
  tools: captureTools,
});

// Handle shutdown
process.on('SIGINT', async () => {
  await BrowserManager.getInstance().shutdown();
  process.exit(0);
});

startServer(server).catch((error) => {
  console.error('Fatal error starting web-observe-capture:', error);
  process.exit(1);
});

