import { parseManifest } from './packages/mcp-core/src/server/manifest.ts';
import fs from 'node:fs';

try {
  const manifestRaw = JSON.parse(fs.readFileSync('./servers/drupal-content-model/server.manifest.json', 'utf-8'));
  const manifest = parseManifest(manifestRaw);
  console.log('Manifest validated successfully:', manifest.id);
} catch (e) {
  console.error('Validation failed:', e);
  process.exit(1);
}
