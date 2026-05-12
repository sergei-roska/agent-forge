#!/usr/bin/env node
import { createMcpServer, startServer, parseManifest } from '@agent-forge/mcp-core';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { 
  listCustomModulesTool, 
  findHookImplementationsTool,
  findServiceDefinitionsTool,
  findEventSubscribersTool,
  findPluginClassesTool,
  findFormClassesTool,
  findControllerHandlersTool,
  findPreprocessFunctionsTool,
  findDrushCommandsTool,
  traceRuntimeToCodeTool,
  summarizeCodeInventoryTool
} from './tools/codeTools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestRaw = JSON.parse(
  readFileSync(resolve(__dirname, '../server.manifest.json'), 'utf-8'),
);
const manifest = parseManifest(manifestRaw);

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

const baseDir = process.env.DRUPAL_ROOT || process.cwd();
const rootDir = findDrupalProjectRoot(baseDir);

const tools = [
  listCustomModulesTool(rootDir),
  findHookImplementationsTool(rootDir),
  findServiceDefinitionsTool(rootDir),
  findEventSubscribersTool(rootDir),
  findPluginClassesTool(rootDir),
  findFormClassesTool(rootDir),
  findControllerHandlersTool(rootDir),
  findPreprocessFunctionsTool(rootDir),
  findDrushCommandsTool(rootDir),
  traceRuntimeToCodeTool(rootDir),
  summarizeCodeInventoryTool(rootDir),
];

const server = createMcpServer({
  manifest,
  tools,
});

startServer(server).catch((error) => {
  console.error('Fatal error starting drupal-codebase-introspect:', error);
  process.exit(1);
});
