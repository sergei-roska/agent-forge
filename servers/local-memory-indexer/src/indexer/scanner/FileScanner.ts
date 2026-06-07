import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { FilterRules, type FilterOptions } from './FilterRules.js';

export interface FileRecord {
  file_path: string;
  size_bytes: number;
  mtime_ns: bigint;
}

export interface ScanOptions extends FilterOptions {
  workerCount?: number;
}

// ── Worker entry point ────────────────────────────────────────────────────────

interface WorkerInput {
  subtreeRoot: string;
  projectRoot: string;
  maxFileSizeKb: number;
  includeGlobs?: string[];
  excludeGlobs?: string[];
}

if (!isMainThread) {
  const { subtreeRoot, projectRoot, maxFileSizeKb, includeGlobs, excludeGlobs } =
    workerData as WorkerInput;

  const rules = new FilterRules(projectRoot, { maxFileSizeKb, includeGlobs, excludeGlobs });
  const results: FileRecord[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        // Skip hidden dirs and common noise dirs early
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
        // Prune excluded / gitignored subtrees (dir-level rules only — never include_globs).
        if (rules.shouldSkipDir(full)) continue;
        walk(full);
      } else if (entry.isFile()) {
        let stat: fs.Stats;
        try {
          stat = fs.statSync(full);
        } catch {
          continue;
        }
        if (rules.shouldSkip(full, stat.size)) continue;

        // mtime_ns via BigInt stat
        let mtime_ns: bigint;
        try {
          mtime_ns = fs.statSync(full, { bigint: true }).mtimeNs;
        } catch {
          mtime_ns = BigInt(stat.mtimeMs) * 1_000_000n;
        }

        results.push({ file_path: full, size_bytes: stat.size, mtime_ns });
      }
    }
  }

  walk(subtreeRoot);
  parentPort!.postMessage(results);
}

// ── Main-thread scanner ───────────────────────────────────────────────────────

export async function scanProject(
  projectRoot: string,
  opts: ScanOptions = {},
): Promise<FileRecord[]> {
  // Collect top-level subdirectories to shard across workers.
  let topEntries: fs.Dirent[];
  try {
    topEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const subtrees: string[] = [];
  const rules = new FilterRules(projectRoot, opts);

  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
    const full = path.join(projectRoot, entry.name);
    // Prune excluded / gitignored top-level dirs (dir-level rules only — the
    // include allowlist gates files, never directories — see shouldSkipDir).
    if (rules.shouldSkipDir(full)) continue;
    subtrees.push(full);
  }

  // Files directly in projectRoot are processed by a synthetic shard.
  const rootFiles: FileRecord[] = [];
  for (const entry of topEntries) {
    if (!entry.isFile()) continue;
    const full = path.join(projectRoot, entry.name);
    let stat: fs.Stats;
    try { stat = fs.statSync(full); } catch { continue; }
    if (rules.shouldSkip(full, stat.size)) continue;
    let mtime_ns: bigint;
    try { mtime_ns = fs.statSync(full, { bigint: true }).mtimeNs; } catch {
      mtime_ns = BigInt(stat.mtimeMs) * 1_000_000n;
    }
    rootFiles.push({ file_path: full, size_bytes: stat.size, mtime_ns });
  }

  if (subtrees.length === 0) return rootFiles;

  const workerCount = Math.min(
    opts.workerCount ?? Math.max(2, os.cpus().length - 1),
    subtrees.length,
  );

  const workerScript = fileURLToPath(import.meta.url);
  const workerInput: Omit<WorkerInput, 'subtreeRoot'> = {
    projectRoot,
    maxFileSizeKb: opts.maxFileSizeKb ?? 512,
    includeGlobs: opts.includeGlobs,
    excludeGlobs: opts.excludeGlobs,
  };

  // Distribute subtrees across worker pool.
  const shards: string[][] = Array.from({ length: workerCount }, () => []);
  subtrees.forEach((sub, i) => shards[i % workerCount].push(sub));

  const results = await Promise.all(
    shards.map((shard) => processShard(workerScript, shard, workerInput)),
  );

  return [rootFiles, ...results].flat();
}

function processShard(
  workerScript: string,
  subtrees: string[],
  base: Omit<WorkerInput, 'subtreeRoot'>,
): Promise<FileRecord[]> {
  return new Promise((resolve, reject) => {
    const allFiles: FileRecord[] = [];
    let pending = subtrees.length;

    if (pending === 0) { resolve([]); return; }

    for (const subtreeRoot of subtrees) {
      const worker = new Worker(workerScript, {
        workerData: { ...base, subtreeRoot } satisfies WorkerInput,
      });
      worker.on('message', (files: FileRecord[]) => {
        allFiles.push(...files);
        if (--pending === 0) resolve(allFiles);
      });
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Scanner worker exited with code ${code}`));
      });
    }
  });
}
