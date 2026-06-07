import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FilterRules } from '../../src/indexer/scanner/FilterRules.js';

/**
 * Regression tests for the include_globs bug (Spec 08.1 Step 13 finding):
 * the scanner used to prune top-level directories with the file allowlist,
 * so a nested pattern like `servers/app/src/storage/<glob>.ts` pruned the whole
 * `servers/` subtree and indexed 0 files.
 *
 * scanProject itself spawns worker_threads with the source module, which cannot
 * be loaded inside vitest's worker context — so we test the pruning/filtering
 * logic directly on FilterRules, where the bug lived and the fix applies.
 */
describe('FilterRules — include_globs over nested paths', () => {
  let root: string;
  const TS_GLOB = ['servers/app/src/storage/' + '**' + '/*.ts'];

  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'lmi-inc-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  const dir = (p: string) => path.join(root, p);

  it('shouldSkipDir does NOT prune parent dirs of a nested include pattern (the bug)', () => {
    const rules = new FilterRules(root, { includeGlobs: TS_GLOB });
    expect(rules.shouldSkipDir(dir('servers'))).toBe(false);
    expect(rules.shouldSkipDir(dir('servers/app'))).toBe(false);
    expect(rules.shouldSkipDir(dir('servers/app/src'))).toBe(false);
    expect(rules.shouldSkipDir(dir('servers/app/src/storage'))).toBe(false);
  });

  it('shouldSkip gates files: nested-target passes, off-target is excluded', () => {
    const rules = new FilterRules(root, { includeGlobs: TS_GLOB });
    expect(rules.shouldSkip(dir('servers/app/src/storage/a.ts'), 10)).toBe(false);
    expect(rules.shouldSkip(dir('servers/app/src/storage/sub/b.ts'), 10)).toBe(false);
    // Off-target file under a different subdir → excluded by the allowlist.
    expect(rules.shouldSkip(dir('servers/app/src/other/c.ts'), 10)).toBe(true);
    // Wrong extension → excluded.
    expect(rules.shouldSkip(dir('servers/app/src/storage/readme.md'), 10)).toBe(true);
  });

  it('with no include_globs, all non-excluded files pass', () => {
    const rules = new FilterRules(root, {});
    expect(rules.shouldSkip(dir('servers/app/src/other/c.ts'), 10)).toBe(false);
    expect(rules.shouldSkip(dir('docs/readme.md'), 10)).toBe(false);
  });
});

describe('FilterRules.shouldSkipDir — exclude_globs & gitignore', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'lmi-dir-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('prunes directories matched by exclude_globs (with or without trailing slash)', () => {
    const slash = new FilterRules(root, { excludeGlobs: ['build/'] });
    expect(slash.shouldSkipDir(path.join(root, 'build'))).toBe(true);
    const plain = new FilterRules(root, { excludeGlobs: ['vendor'] });
    expect(plain.shouldSkipDir(path.join(root, 'vendor'))).toBe(true);
  });

  it('prunes gitignored directories', () => {
    fs.writeFileSync(path.join(root, '.gitignore'), 'dist/\n');
    const rules = new FilterRules(root, {});
    expect(rules.shouldSkipDir(path.join(root, 'dist'))).toBe(true);
    expect(rules.shouldSkipDir(path.join(root, 'src'))).toBe(false);
  });

  it('never prunes the project root itself', () => {
    const rules = new FilterRules(root, { includeGlobs: ['**' + '/*.ts'] });
    expect(rules.shouldSkipDir(root)).toBe(false);
  });
});
