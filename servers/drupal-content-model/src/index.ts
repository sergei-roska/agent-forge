#!/usr/bin/env node
/**
 * drupal-content-model — Structural Editorial Architecture (Spec 02)
 */

import { createMcpServer, startServer, parseManifest } from '@agent-forge/mcp-core';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

// Tool imports
import {
  inspectContentTypesTool,
  inspectMediaTypesTool,
  inspectTaxonomyModelsTool,
  inspectFieldUsageTool,
  inspectReferenceGraphTool,
  summarizeEditorialModelTool,
  inspectDisplayModesTool,
  inspectRevisioningTool,
  inspectTranslationTool,
  inspectModerationTool,
} from './tools/contentTools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestRaw = JSON.parse(
  readFileSync(resolve(__dirname, '../server.manifest.json'), 'utf-8'),
);
const manifest = parseManifest(manifestRaw);

/**
 * Universal Project Root Discovery.
 */
function findDrupalProjectRoot(startPath: string): string {
  let curr = resolve(startPath);
  while (curr !== dirname(curr)) {
    if (existsSync(resolve(curr, 'web', 'core'))) return curr;
    if (existsSync(resolve(curr, 'docroot', 'core'))) return curr;
    if (existsSync(resolve(curr, 'core')) && existsSync(resolve(curr, 'index.php'))) return curr;
    curr = dirname(curr);
  }
  return startPath;
}

const rootDir = findDrupalProjectRoot(process.cwd());

const tools = [
  inspectContentTypesTool(rootDir),
  inspectMediaTypesTool(rootDir),
  inspectTaxonomyModelsTool(rootDir),
  inspectFieldUsageTool(rootDir),
  inspectReferenceGraphTool(rootDir),
  summarizeEditorialModelTool(rootDir),
  inspectDisplayModesTool(rootDir),
  inspectRevisioningTool(rootDir),
  inspectTranslationTool(rootDir),
  inspectModerationTool(rootDir),
];

const server = createMcpServer({ manifest, tools });

startServer(server).catch((error) => {
  console.error('Fatal error starting drupal-content-model:', error);
  process.exit(1);
});
