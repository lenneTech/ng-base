#!/usr/bin/env node
/**
 * Keeps the three version sources in sync with the root `package.json` (the one `/lt-dev:publish` bumps):
 * `projects/ng-base/package.json` (published manifest) and `LT_NG_BASE_VERSION` in the library source.
 *
 *   node scripts/sync-version.mjs          write
 *   node scripts/sync-version.mjs --check  fail (exit 1) when anything differs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const libManifest = join(root, 'projects/ng-base/package.json');
const versionFiles = ['projects/ng-base/src/lib/version.ts', 'projects/ng-base/lib/version.ts'].map((file) => join(root, file));

const problems = [];
const manifest = JSON.parse(readFileSync(libManifest, 'utf8'));
if (manifest.version !== version) {
  problems.push(`projects/ng-base/package.json has ${manifest.version}, root has ${version}`);
  manifest.version = version;
  if (!check) writeFileSync(libManifest, `${JSON.stringify(manifest, null, 2)}\n`);
}
const versionFile = versionFiles.find((file) => {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
});
if (!versionFile) {
  console.error('version.ts not found');
  process.exit(1);
}
const source = readFileSync(versionFile, 'utf8');
const next = source.replace(/LT_NG_BASE_VERSION = '[^']*'/, `LT_NG_BASE_VERSION = '${version}'`);
if (next !== source) {
  problems.push(`LT_NG_BASE_VERSION differs from ${version}`);
  if (!check) writeFileSync(versionFile, next);
}

if (check && problems.length) {
  console.error(`Version out of sync (run pnpm run version:sync):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(problems.length ? `Synced version ${version}: ${problems.length} file(s) updated` : `Version ${version} in sync`);
