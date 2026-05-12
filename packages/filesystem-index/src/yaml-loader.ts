/**
 * YAML config file loader for Drupal config analysis.
 * Reads exported YAML config from the config/sync directory.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { load } from 'js-yaml';

// ---------- Types ----------

export interface ConfigFile {
  /** Config name (filename without .yml). */
  name: string;
  /** Full file path. */
  path: string;
  /** Raw YAML content. */
  raw: string;
  /** Parsed config object. */
  data: Record<string, any>;
}

export interface ConfigLoadOptions {
  /** Directory containing exported config YAML files. */
  configDir: string;
  /** Filter config names by prefix (e.g., 'field.storage.node'). */
  prefix?: string;
  /** Maximum number of config files to load. Default: 500. */
  limit?: number;
}

// ---------- Functions ----------

/**
 * List config file names in the config directory.
 * Returns just the config names (without .yml extension).
 */
export async function listConfigNames(configDir: string, prefix?: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(configDir);
  } catch {
    return [];
  }

  return entries
    .filter(f => extname(f) === '.yml')
    .map(f => basename(f, '.yml'))
    .filter(name => !prefix || name.startsWith(prefix))
    .sort();
}

/**
 * Load and parse a single YAML config file.
 */
export async function loadConfigFile(configDir: string, configName: string): Promise<ConfigFile | null> {
  const filePath = join(configDir, `${configName}.yml`);

  try {
    const raw = await readFile(filePath, 'utf-8');
    const data = load(raw) as Record<string, any>;
    return { name: configName, path: filePath, raw, data: data || {} };
  } catch {
    return null;
  }
}

/**
 * Load multiple config files matching a prefix.
 */
export async function loadConfigFiles(options: ConfigLoadOptions): Promise<ConfigFile[]> {
  const limit = options.limit ?? 500;
  const names = await listConfigNames(options.configDir, options.prefix);
  const results: ConfigFile[] = [];

  for (const name of names.slice(0, limit)) {
    const file = await loadConfigFile(options.configDir, name);
    if (file) results.push(file);
  }

  return results;
}
