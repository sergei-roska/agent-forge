#!/usr/bin/env node

import { mkdir, readFile, writeFile, rm, cp, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SERVERS_DIR = resolve(ROOT, 'servers');
const OUT_ROOT = resolve(ROOT, 'standalone');

const args = process.argv.slice(2);
const requestedIds = args.filter((a) => !a.startsWith('--'));

function runOrThrow(cmd, cmdArgs, cwd = ROOT) {
  const res = spawnSync(cmd, cmdArgs, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${cmdArgs.join(' ')}`);
  }
}

async function listServerDirs() {
  const entries = await readdir(SERVERS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => resolve(SERVERS_DIR, e.name));
}

function pickExternalDeps(serverId, deps) {
  const external = [];
  if (deps['@modelcontextprotocol/sdk']) external.push('@modelcontextprotocol/sdk');
  if (deps['@lancedb/lancedb']) {
    external.push('@lancedb/lancedb');
    if (deps['apache-arrow']) external.push('apache-arrow');
  }
  if (deps['@huggingface/transformers']) external.push('@huggingface/transformers');
  if (deps['better-sqlite3']) external.push('better-sqlite3');
  if (deps['typescript']) external.push('typescript');
  if (serverId === 'web-observe-capture') {
    external.push('playwright');
    external.push('playwright-core');
    external.push('chromium-bidi');
  }
  return external;
}

function makeStandalonePackageJson(srcPkg, externalDeps, extraDependencies = {}, options = {}) {
  const dependencies = {};
  for (const dep of externalDeps) {
    if (dep === 'playwright-core' || dep === 'chromium-bidi') continue;
    dependencies[dep] = srcPkg.dependencies?.[dep] ?? 'latest';
  }
  for (const [k, v] of Object.entries(extraDependencies)) {
    dependencies[k] = v;
  }

  const binName = srcPkg.name.includes('/') ? srcPkg.name.split('/').pop() : srcPkg.name;

  return {
    name: srcPkg.name,
    version: srcPkg.version ?? '0.1.0',
    type: options.type ?? 'module',
    main: `dist/${options.entryFile ?? 'index.js'}`,
    bin: {
      [binName]: `dist/${options.entryFile ?? 'index.js'}`,
    },
    scripts: {
      build: "node -e \"console.log('Standalone bundle is prebuilt')\"",
      start: `node dist/${options.entryFile ?? 'index.js'}`,
    },
    engines: { node: '>=20.0.0' },
    publishConfig: {
      access: 'public',
    },
    dependencies,
  };
}

async function exportServer(serverDir) {
  const pkgPath = join(serverDir, 'package.json');
  const manifestPath = join(serverDir, 'server.manifest.json');
  const readmePath = join(serverDir, 'README.md');
  const entry = join(serverDir, 'src', 'index.ts');

  const srcPkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const serverId = manifest.id;
  const entryFile = 'index.js';

  const outDir = join(OUT_ROOT, serverId);
  const outDist = join(outDir, 'dist');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDist, { recursive: true });

  const deps = srcPkg.dependencies ?? {};
  const externalDeps = pickExternalDeps(serverId, deps);
  const esbuildBin = resolve(ROOT, 'node_modules', '.bin', 'esbuild');
  const esbuildArgs = [
    entry,
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node20',
    `--outfile=${join(outDist, entryFile)}`,
  ];

  esbuildArgs.push(`--alias:@agent-forge/mcp-core=${resolve(ROOT, 'packages', 'mcp-core', 'src', 'index.ts')}`);
  esbuildArgs.push(`--alias:@agent-forge/drupal-api-client=${resolve(ROOT, 'packages', 'drupal-api-client', 'src', 'index.ts')}`);
  esbuildArgs.push(`--alias:@agent-forge/filesystem-index=${resolve(ROOT, 'packages', 'filesystem-index', 'src', 'index.ts')}`);
  esbuildArgs.push(`--alias:@agent-forge/browser-observer=${resolve(ROOT, 'packages', 'browser-observer', 'src', 'index.ts')}`);

  for (const dep of externalDeps) {
    esbuildArgs.push(`--external:${dep}`);
    esbuildArgs.push(`--external:${dep}/*`);
  }

  runOrThrow(esbuildBin, esbuildArgs);

  if ((await readFile(readmePath, 'utf8')).length > 0) {
    await cp(readmePath, join(outDir, 'README.md'));
  }
  await cp(manifestPath, join(outDir, 'server.manifest.json'));

  try {
    await cp(resolve(ROOT, 'LICENSE'), join(outDir, 'LICENSE'));
  } catch (err) {
    // Ignore if root LICENSE is missing
  }

  const extraDependencies = {};
  if (serverId === 'web-observe-capture' && !deps.playwright) {
    const browserObserverPkg = JSON.parse(
      await readFile(resolve(ROOT, 'packages', 'browser-observer', 'package.json'), 'utf8'),
    );
    extraDependencies.playwright = browserObserverPkg.dependencies?.playwright ?? '^1.40.0';
  }

  const standalonePkg = makeStandalonePackageJson(srcPkg, externalDeps, extraDependencies, {
    entryFile,
    type: 'module',
  });
  await writeFile(join(outDir, 'package.json'), JSON.stringify(standalonePkg, null, 2) + '\n', 'utf8');

  const cursorSnippet = {
    mcpServers: {
      [serverId]: {
        command: 'node',
        args: [join(outDir, 'dist', entryFile)],
      },
    },
  };
  await writeFile(
    join(outDir, '.cursor.mcp.example.json'),
    JSON.stringify(cursorSnippet, null, 2) + '\n',
    'utf8',
  );

  console.log(`[export] ${serverId} -> ${outDir}`);
}

async function main() {
  const allServerDirs = await listServerDirs();
  const candidates = [];

  for (const serverDir of allServerDirs) {
    const manifestPath = join(serverDir, 'server.manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const id = manifest.id;
    if (requestedIds.length === 0 || requestedIds.includes(id)) {
      candidates.push(serverDir);
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      requestedIds.length
        ? `No servers matched: ${requestedIds.join(', ')}`
        : 'No servers found in ./servers',
    );
  }

  await mkdir(OUT_ROOT, { recursive: true });
  for (const serverDir of candidates) {
    await exportServer(serverDir);
  }

  console.log(`[export] done: ${candidates.length} server(s) in ${OUT_ROOT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
