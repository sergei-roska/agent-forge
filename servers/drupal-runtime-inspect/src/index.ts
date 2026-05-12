#!/usr/bin/env node
/**
 * drupal-runtime-inspect — Live Runtime Discovery (Spec 01)
 */

import { createMcpServer, startServer, parseManifest } from '@agent-forge/mcp-core';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

// Tool imports
import { inspectEntityTypesTool } from './tools/inspectEntityTypes.js';
import { inspectBundlesTool } from './tools/inspectBundles.js';
import { inspectFieldsTool } from './tools/inspectFields.js';
import { inspectModulesTool } from './tools/inspectModules.js';
import { inspectThemesTool } from './tools/inspectThemes.js';
import { inspectRoutesTool } from './tools/inspectRoutes.js';
import { inspectServicesTool } from './tools/inspectServices.js';
import { inspectPermissionsTool } from './tools/inspectPermissions.js';
import { inspectMenusTool } from './tools/inspectMenus.js';
import { inspectVocabulariesTool } from './tools/inspectVocabularies.js';
import { inspectPluginsTool } from './tools/inspectPlugins.js';
import { searchRuntimeObjectsTool } from './tools/searchRuntimeObjects.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestRaw = JSON.parse(
  readFileSync(resolve(__dirname, '../server.manifest.json'), 'utf-8'),
);
const manifest = parseManifest(manifestRaw);

/**
 * Robustly find the Project Root for a Drupal site.
 * Covers: Modern (web/core), Alternate (docroot/core), and Legacy (core/) structures.
 */
function findDrupalProjectRoot(startPath: string): string {
  let curr = resolve(startPath);
  while (curr !== dirname(curr)) {
    // 1. Standard Modern: project/web/core
    if (existsSync(resolve(curr, 'web', 'core'))) return curr;
    
    // 2. Alternate: project/docroot/core
    if (existsSync(resolve(curr, 'docroot', 'core'))) return curr;

    // 3. Monolithic/Root: project/core (contains core directly)
    if (existsSync(resolve(curr, 'core')) && existsSync(resolve(curr, 'index.php'))) return curr;
    
    curr = dirname(curr);
  }
  return startPath; // Fallback
}

const rootDir = findDrupalProjectRoot(process.cwd());

const tools = [
  inspectEntityTypesTool(rootDir),
  inspectBundlesTool(rootDir),
  inspectFieldsTool(rootDir),
  inspectModulesTool(rootDir),
  inspectThemesTool(rootDir),
  inspectRoutesTool(rootDir),
  inspectServicesTool(rootDir),
  inspectPermissionsTool(rootDir),
  inspectMenusTool(rootDir),
  inspectVocabulariesTool(rootDir),
  inspectPluginsTool(rootDir),
  searchRuntimeObjectsTool(rootDir),
];

const server = createMcpServer({ manifest, tools });

startServer(server).catch((error) => {
  console.error('Fatal error starting drupal-runtime-inspect:', error);
  process.exit(1);
});
