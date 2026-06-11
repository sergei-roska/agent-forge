import path from 'node:path';
import fs from 'node:fs';
import ignore, { type Ignore } from 'ignore';
import { DEFAULT_MAX_FILE_SIZE_KB } from '../../constants.js';

const BINARY_EXTENSIONS = new Set([
  // compiled / archives
  'a', 'bin', 'class', 'dll', 'dylib', 'exe', 'jar', 'lib', 'o', 'obj',
  'pyc', 'pyo', 'so', 'wasm', 'zip', 'gz', 'tar', 'bz2', 'xz', '7z',
  'rar', 'iso', 'dmg', 'pkg',
  // media
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp', 'tiff', 'avif',
  'mp3', 'mp4', 'wav', 'ogg', 'flac', 'aac', 'mov', 'avi', 'mkv', 'webm',
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  // data / build artefacts
  'db', 'sqlite', 'sqlite3', 'DS_Store',
]);

const MINIFIED_PATTERNS = [
  /\.min\.[cm]?js$/,
  /\.min\.css$/,
  /\.bundle\.[cm]?js$/,
  /\.chunk\.[cm]?js$/,
];

const LOCK_EXTENSIONS = new Set(['lock']);
const LOCK_NAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'Cargo.lock', 'Gemfile.lock', 'poetry.lock', 'composer.lock',
]);

const MAP_EXTENSIONS = new Set(['map']);

export interface FilterOptions {
  maxFileSizeKb?: number;
  includeGlobs?: string[];
  excludeGlobs?: string[];
}

export class FilterRules {
  private readonly maxBytes: number;
  private readonly excludeIg: Ignore;
  private readonly includeIg: Ignore | null;
  /** Cache: directory path → merged Ignore instance */
  private readonly gitignoreCache = new Map<string, Ignore>();

  constructor(
    private readonly projectRoot: string,
    opts: FilterOptions = {},
  ) {
    this.maxBytes = (opts.maxFileSizeKb ?? DEFAULT_MAX_FILE_SIZE_KB) * 1024;

    this.excludeIg = ignore();
    if (opts.excludeGlobs?.length) this.excludeIg.add(opts.excludeGlobs);

    this.includeIg = opts.includeGlobs?.length
      ? ignore().add(opts.includeGlobs)
      : null;
  }

  /**
   * Returns true if the file at `absolutePath` should be skipped.
   * Filter order (highest priority first):
   *   1. exclude_globs
   *   2. built-in binary/minified/lock/map heuristics + size limit
   *   3. .gitignore rules (project root + parent dirs)
   *   4. include_globs allowlist (if specified, file must match to pass)
   */
  shouldSkip(absolutePath: string, sizeBytes: number): boolean {
    const rel = path.relative(this.projectRoot, absolutePath);

    // 1. exclude_globs
    if (this.excludeIg.ignores(rel)) return true;

    // 2. built-in heuristics
    if (this.isBuiltinExcluded(absolutePath, rel, sizeBytes)) return true;

    // 3. .gitignore
    if (this.isGitignored(rel)) return true;

    // 4. include_globs allowlist
    if (this.includeIg && !this.includeIg.ignores(rel)) return true;

    return false;
  }

  /**
   * Returns true if the directory at `absoluteDirPath` should be pruned from
   * the walk. Applies ONLY `exclude_globs` and `.gitignore` — never the
   * include allowlist or the file-only binary/size heuristics.
   *
   * The include allowlist must NOT prune directories: a parent dir (e.g.
   * `servers/`) never matches a file-only glob (one ending in a filename
   * pattern such as the TS-source glob), so applying the allowlist here would
   * prune the whole subtree before any matching file is reached. include_globs
   * is enforced per file in {@link shouldSkip}.
   */
  shouldSkipDir(absoluteDirPath: string): boolean {
    const rel = path.relative(this.projectRoot, absoluteDirPath);
    if (rel === '' || rel.startsWith('..')) return false; // never prune the root itself

    // Test both forms: gitignore dir patterns like `build/` only match a path
    // carrying the trailing slash, while plain patterns match either.
    const relDir = rel.endsWith('/') ? rel : `${rel}/`;
    if (this.excludeIg.ignores(rel) || this.excludeIg.ignores(relDir)) return true;
    if (this.isGitignored(rel) || this.isGitignored(relDir)) return true;

    return false;
  }

  private isBuiltinExcluded(absPath: string, rel: string, sizeBytes: number): boolean {
    if (sizeBytes > this.maxBytes) return true;

    const base = path.basename(absPath);
    const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';

    if (BINARY_EXTENSIONS.has(ext)) return true;
    if (LOCK_EXTENSIONS.has(ext)) return true;
    if (MAP_EXTENSIONS.has(ext)) return true;
    if (LOCK_NAMES.has(base)) return true;
    if (MINIFIED_PATTERNS.some((re) => re.test(rel))) return true;

    return false;
  }

  private isGitignored(rel: string): boolean {
    const ig = this.getGitignoreForPath(rel);
    return ig.ignores(rel);
  }

  private getGitignoreForPath(rel: string): Ignore {
    // Build a merged Ignore from projectRoot/.gitignore + all sub-dir .gitignore files
    // along the path. Cache by directory so we don't reparse on every file.
    const dir = path.dirname(rel);
    if (this.gitignoreCache.has(dir)) return this.gitignoreCache.get(dir)!;

    const ig = ignore();
    // Load .gitignore files from projectRoot down to the file's directory.
    const segments = dir === '.' ? [] : dir.split(path.sep);
    const dirs = ['', ...segments.map((_, i) => segments.slice(0, i + 1).join(path.sep))];

    for (const d of dirs) {
      const giPath = path.join(this.projectRoot, d, '.gitignore');
      if (fs.existsSync(giPath)) {
        const content = fs.readFileSync(giPath, 'utf8');
        const prefix = d ? d + '/' : '';
        // Re-scope rules: entries in sub-dir .gitignore apply relative to that dir.
        const rules = content
          .split('\n')
          .filter((l) => l.trim() && !l.startsWith('#'))
          .map((l) => (d ? prefix + l.trimStart() : l));
        ig.add(rules);
      }
    }

    this.gitignoreCache.set(dir, ig);
    return ig;
  }
}
