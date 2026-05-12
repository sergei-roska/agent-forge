#!/usr/bin/env node

import { mkdir, readdir, rm, cp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const STANDALONE_ROOT = resolve(ROOT, 'standalone');
const SANDBOX_ROOT = resolve(ROOT, '.standalone-smoke');

function run(cmd, args, cwd, env = {}) {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  return res.status ?? 1;
}

async function listStandalonePackages() {
  const entries = await readdir(STANDALONE_ROOT, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function detectServerIdFromDirName(pkgName) {
  return pkgName;
}

async function main() {
  await rm(SANDBOX_ROOT, { recursive: true, force: true });
  await mkdir(SANDBOX_ROOT, { recursive: true });

  const pkgs = await listStandalonePackages();
  if (pkgs.length === 0) {
    throw new Error('No standalone packages found. Run `pnpm export:standalone:all` first.');
  }

  const failures = [];

  for (const pkgName of pkgs) {
    const srcDir = join(STANDALONE_ROOT, pkgName);
    const dstDir = join(SANDBOX_ROOT, pkgName);
    await cp(srcDir, dstDir, { recursive: true });

    const serverId = detectServerIdFromDirName(pkgName);
    const env =
      serverId === 'drupal-codebase-introspect'
        ? { DRUPAL_ROOT_DIR: '/tmp' }
        : {
            DRUPAL_BASE_URL: 'http://127.0.0.1',
            DRUPAL_AUTH_TYPE: 'none',
          };

    console.log(`\n[verify] ${serverId}: npm install`);
    if (run('npm', ['install', '--legacy-peer-deps'], dstDir, env) !== 0) {
      failures.push(`${serverId}: npm install failed`);
      continue;
    }

    console.log(`[verify] ${serverId}: npm run build`);
    if (run('npm', ['run', 'build'], dstDir, env) !== 0) {
      failures.push(`${serverId}: npm run build failed`);
      continue;
    }

    console.log(`[verify] ${serverId}: npm run start (timeout)`);
    const status = run('timeout', ['5s', 'npm', 'run', 'start'], dstDir, env);
    if (status !== 0 && status !== 124) {
      failures.push(`${serverId}: npm run start failed with status ${status}`);
      continue;
    }
  }

  if (failures.length > 0) {
    console.error('\n[verify] failures:');
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }

  console.log('\n[verify] all standalone packages passed npm install/build/start smoke checks.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
