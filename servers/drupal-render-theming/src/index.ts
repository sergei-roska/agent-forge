#!/usr/bin/env node
import { createMcpServer, startServer, parseManifest } from '@agent-forge/mcp-core';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTools } from './tools/renderTools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestRaw = JSON.parse(
  readFileSync(resolve(__dirname, '../server.manifest.json'), 'utf-8'),
);
const manifest = parseManifest(manifestRaw);

const server = createMcpServer({
  manifest,
  tools: renderTools,
});

startServer(server).catch((error) => {
  console.error('Fatal error starting drupal-render-theming:', error);
  process.exit(1);
});

