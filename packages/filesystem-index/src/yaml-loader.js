"use strict";
/**
 * YAML config file loader for Drupal config analysis.
 * Reads exported YAML config from the config/sync directory.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listConfigNames = listConfigNames;
exports.loadConfigFile = loadConfigFile;
exports.loadConfigFiles = loadConfigFiles;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
// ---------- Functions ----------
/**
 * List config file names in the config directory.
 * Returns just the config names (without .yml extension).
 */
async function listConfigNames(configDir, prefix) {
    let entries;
    try {
        entries = await (0, promises_1.readdir)(configDir);
    }
    catch {
        return [];
    }
    return entries
        .filter(f => (0, node_path_1.extname)(f) === '.yml')
        .map(f => (0, node_path_1.basename)(f, '.yml'))
        .filter(name => !prefix || name.startsWith(prefix))
        .sort();
}
/**
 * Load and parse a single YAML config file.
 * Uses a minimal YAML parser (key: value pairs and simple nested objects).
 */
async function loadConfigFile(configDir, configName) {
    const filePath = (0, node_path_1.join)(configDir, `${configName}.yml`);
    try {
        const raw = await (0, promises_1.readFile)(filePath, 'utf-8');
        const data = parseSimpleYaml(raw);
        return { name: configName, path: filePath, raw, data };
    }
    catch {
        return null;
    }
}
/**
 * Load multiple config files matching a prefix.
 */
async function loadConfigFiles(options) {
    const limit = options.limit ?? 500;
    const names = await listConfigNames(options.configDir, options.prefix);
    const results = [];
    for (const name of names.slice(0, limit)) {
        const file = await loadConfigFile(options.configDir, name);
        if (file)
            results.push(file);
    }
    return results;
}
/**
 * Minimal YAML parser for Drupal config files.
 * Handles simple key-value pairs and one level of nesting.
 * For full YAML support, replace with a proper YAML library.
 */
function parseSimpleYaml(raw) {
    const result = {};
    const lines = raw.split('\n');
    let currentKey = '';
    for (const line of lines) {
        // Skip comments and empty lines
        if (line.trim().startsWith('#') || line.trim() === '')
            continue;
        const indent = line.length - line.trimStart().length;
        const trimmed = line.trim();
        if (indent === 0 && trimmed.includes(':')) {
            const colonIndex = trimmed.indexOf(':');
            const key = trimmed.slice(0, colonIndex).trim();
            const value = trimmed.slice(colonIndex + 1).trim();
            if (value) {
                result[key] = parseYamlValue(value);
                currentKey = '';
            }
            else {
                currentKey = key;
                result[key] = {};
            }
        }
        else if (indent > 0 && currentKey && trimmed.includes(':')) {
            const colonIndex = trimmed.indexOf(':');
            const key = trimmed.slice(0, colonIndex).trim();
            const value = trimmed.slice(colonIndex + 1).trim();
            if (typeof result[currentKey] === 'object' && result[currentKey] !== null) {
                result[currentKey][key] = parseYamlValue(value);
            }
        }
    }
    return result;
}
function parseYamlValue(value) {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    if (value === 'null' || value === '~')
        return null;
    if (value.startsWith("'") && value.endsWith("'"))
        return value.slice(1, -1);
    if (value.startsWith('"') && value.endsWith('"'))
        return value.slice(1, -1);
    const num = Number(value);
    if (!isNaN(num) && value !== '')
        return num;
    return value;
}
