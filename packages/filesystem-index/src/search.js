"use strict";
/**
 * File search primitives for Drupal codebase introspection.
 * Provides grep-like capabilities, file discovery, and pattern matching
 * optimized for Drupal project structures.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchFiles = searchFiles;
exports.listFiles = listFiles;
exports.findDrupalPhpFiles = findDrupalPhpFiles;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
// ---------- Default Drupal exclusions ----------
const DEFAULT_EXCLUDES = [
    'vendor',
    'node_modules',
    'core',
    '.git',
    'sites/default/files',
];
const DRUPAL_PHP_EXTENSIONS = new Set([
    '.php', '.module', '.inc', '.install', '.theme',
    '.profile', '.engine', '.test',
]);
// ---------- Functions ----------
/**
 * Search for a text pattern across files in a directory.
 * Returns matched lines with file/line info.
 */
async function searchFiles(pattern, options) {
    const results = [];
    const limit = options.limit ?? 50;
    const regex = typeof pattern === 'string'
        ? new RegExp(escapeRegex(pattern), options.ignoreCase ? 'gi' : 'g')
        : pattern;
    const files = await listFiles(options.rootDir, {
        include: options.include,
        exclude: options.exclude ?? DEFAULT_EXCLUDES.map(e => `${e}/*`),
    });
    for (const file of files) {
        if (results.length >= limit)
            break;
        try {
            const content = await (0, promises_1.readFile)(file.path, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (results.length >= limit)
                    break;
                const match = regex.exec(lines[i]);
                if (match) {
                    const result = {
                        file: file.relativePath,
                        line: i + 1,
                        column: match.index + 1,
                        content: lines[i].trim(),
                    };
                    if (options.contextLines && options.contextLines > 0) {
                        const start = Math.max(0, i - options.contextLines);
                        const end = Math.min(lines.length - 1, i + options.contextLines);
                        result.context = lines.slice(start, end + 1).map(l => l.trimEnd());
                    }
                    results.push(result);
                    // Reset regex lastIndex for global patterns
                    regex.lastIndex = 0;
                }
            }
        }
        catch {
            // Skip files that can't be read (binary, permission, etc.)
        }
    }
    return results;
}
/**
 * List files in a directory tree, with include/exclude filtering.
 */
async function listFiles(rootDir, options) {
    const results = [];
    const excludeSet = new Set((options?.exclude ?? DEFAULT_EXCLUDES.map(e => `${e}/*`)).map(p => p.replace('/*', '')));
    async function walk(dir) {
        let entries;
        try {
            entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = (0, node_path_1.join)(dir, entry.name);
            const relPath = (0, node_path_1.relative)(rootDir, fullPath);
            // Check excludes against relative path components
            const pathParts = relPath.split('/');
            if (pathParts.some(part => excludeSet.has(part)))
                continue;
            if (entry.isDirectory()) {
                await walk(fullPath);
            }
            else if (entry.isFile()) {
                const ext = (0, node_path_1.extname)(entry.name);
                // If include patterns specified, filter by extension
                if (options?.include && options.include.length > 0) {
                    const matchesInclude = options.include.some(pattern => {
                        if (pattern.startsWith('*.')) {
                            return ext === pattern.slice(1);
                        }
                        return entry.name === pattern;
                    });
                    if (!matchesInclude)
                        continue;
                }
                try {
                    const fileStat = await (0, promises_1.stat)(fullPath);
                    results.push({
                        path: fullPath,
                        relativePath: relPath,
                        extension: ext,
                        sizeBytes: fileStat.size,
                    });
                }
                catch {
                    // Skip if stat fails
                }
            }
        }
    }
    await walk(rootDir);
    return results;
}
/**
 * Find Drupal-specific PHP files (modules, themes, services, hooks).
 */
async function findDrupalPhpFiles(rootDir) {
    return listFiles(rootDir, {
        include: [...DRUPAL_PHP_EXTENSIONS].map(ext => `*${ext}`),
        exclude: DEFAULT_EXCLUDES.map(e => `${e}/*`),
    });
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
