/**
 * File search primitives for Drupal codebase introspection.
 * Provides grep-like capabilities, file discovery, and pattern matching
 * optimized for Drupal project structures.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

// ---------- Types ----------

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  content: string;
  context?: string[];
}

export interface SearchOptions {
  /** Root directory to search from. */
  rootDir: string;
  /** Glob-like patterns to include (e.g., ['*.php', '*.module']). */
  include?: string[];
  /** Glob-like patterns to exclude (e.g., ['vendor/*', 'node_modules/*']). */
  exclude?: string[];
  /** Maximum number of results. Default: 50. */
  limit?: number;
  /** Include N lines of surrounding context. Default: 0. */
  contextLines?: number;
  /** Case-insensitive matching. Default: false. */
  ignoreCase?: boolean;
}

export interface FileInfo {
  path: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
}

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
export async function searchFiles(
  pattern: string | RegExp,
  options: SearchOptions,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const limit = options.limit ?? 50;
  const regex = typeof pattern === 'string'
    ? new RegExp(escapeRegex(pattern), options.ignoreCase ? 'gi' : 'g')
    : pattern;

  const files = await listFiles(options.rootDir, {
    include: options.include,
    exclude: options.exclude ?? DEFAULT_EXCLUDES.map(e => `${e}/*`),
  });

  for (const file of files) {
    if (results.length >= limit) break;

    try {
      const content = await readFile(file.path, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (results.length >= limit) break;

        const match = regex.exec(lines[i]);
        if (match) {
          const result: SearchResult = {
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
    } catch {
      // Skip files that can't be read (binary, permission, etc.)
    }
  }

  return results;
}

/**
 * List files in a directory tree, with include/exclude filtering.
 */
export async function listFiles(
  rootDir: string,
  options?: { include?: string[]; exclude?: string[] },
): Promise<FileInfo[]> {
  const results: FileInfo[] = [];
  const excludeSet = new Set(
    (options?.exclude ?? DEFAULT_EXCLUDES.map(e => `${e}/*`)).map(p => p.replace('/*', '')),
  );

  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(rootDir, fullPath);

      // Check excludes against relative path components
      const pathParts = relPath.split('/');
      if (pathParts.some(part => excludeSet.has(part))) continue;

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);

        // If include patterns specified, filter by extension
        if (options?.include && options.include.length > 0) {
          const matchesInclude = options.include.some(pattern => {
            if (pattern.startsWith('*.')) {
              const suffix = pattern.slice(1);
              return entry.name.endsWith(suffix);
            }
            return entry.name === pattern;
          });
          if (!matchesInclude) continue;
        }

        try {
          const fileStat = await stat(fullPath);
          results.push({
            path: fullPath,
            relativePath: relPath,
            extension: ext,
            sizeBytes: fileStat.size,
          });
        } catch {
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
export async function findDrupalPhpFiles(rootDir: string): Promise<FileInfo[]> {
  return listFiles(rootDir, {
    include: [...DRUPAL_PHP_EXTENSIONS].map(ext => `*${ext}`),
    exclude: DEFAULT_EXCLUDES.map(e => `${e}/*`),
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
