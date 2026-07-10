import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const SERVERS_DIR = resolve(ROOT, 'servers');

async function getPublishedVersion(packageName) {
  try {
    const stdout = execSync(`pnpm view ${packageName} version`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    return stdout || null;
  } catch (err) {
    // If not published yet, return null
    return null;
  }
}

function bumpVersion(version) {
  const parts = version.split('.').map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    parts[2] += 1;
    return parts.join('.');
  }
  return version;
}

async function main() {
  const entries = await readdir(SERVERS_DIR, { withFileTypes: true });
  const serverDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  for (const dir of serverDirs) {
    const pkgPath = join(SERVERS_DIR, dir, 'package.json');
    let pkg;
    try {
      pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    } catch {
      continue;
    }

    const name = pkg.name;
    const currentVersion = pkg.version;
    if (!name || !currentVersion) continue;

    console.log(`Checking ${name} (local: ${currentVersion})...`);
    const publishedVersion = await getPublishedVersion(name);
    console.log(`Published version: ${publishedVersion || 'none'}`);

    if (publishedVersion && semverCompare(currentVersion, publishedVersion) <= 0) {
      const nextVersion = bumpVersion(publishedVersion);
      console.log(`Bumping ${name}: ${currentVersion} -> ${nextVersion}`);
      pkg.version = nextVersion;
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    } else {
      console.log(`${name} local version ${currentVersion} is already greater than published ${publishedVersion || 'none'}. No bump needed.`);
    }
  }
}

// Simple semver compare: returns -1 if v1 < v2, 1 if v1 > v2, 0 if v1 === v2
function semverCompare(v1, v2) {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (p1[i] < p2[i]) return -1;
    if (p1[i] > p2[i]) return 1;
  }
  return 0;
}

main().catch(console.error);
