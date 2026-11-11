#!/usr/bin/env node
/**
 * Verifies the built package (`dist/ng-base`) before it is published: every entry point is exported with types and an
 * fesm bundle, the shipped assets exist, nothing from the workspace leaks in, and the peer contract matches
 * (better-auth lock-step range, optional peers).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist/ng-base');
const errors = [];
const fail = (message) => errors.push(message);

if (!existsSync(join(dist, 'package.json'))) {
  console.error('dist/ng-base/package.json missing — run pnpm build first');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(dist, 'package.json'), 'utf8'));
const ENTRIES = ['', 'ai', 'auth', 'auth/provide', 'bug', 'bug/provide', 'bug/server', 'files', 'files/ui', 'server', 'share', 'sync', 'testing', 'ui', 'ui/provide', 'utils'];
for (const entry of ENTRIES) {
  const key = entry ? `./${entry}` : '.';
  const exported = manifest.exports?.[key];
  if (!exported?.types || !exported?.default) {
    fail(`exports["${key}"] lacks types/default`);
    continue;
  }
  for (const file of [exported.types, exported.default]) {
    if (!existsSync(join(dist, file))) fail(`exports["${key}"] points to missing ${file}`);
  }
}
for (const asset of [
  'ui/styles/theme.css',
  'ui/styles/palette.css',
  'ui/styles/transitions.css',
  'i18n/de.json',
  'i18n/en.json',
  'i18n/auth/de.json',
  'i18n/auth/en.json',
  'i18n/bug/de.json',
  'i18n/bug/en.json',
  'i18n/files/de.json',
  'i18n/files/en.json',
  'i18n/share/de.json',
  'i18n/share/en.json',
  'i18n/ui/de.json',
  'i18n/ui/en.json',
  'README.md',
  'LICENSE',
]) {
  if (!existsSync(join(dist, asset))) fail(`asset missing: ${asset}`);
}
const PEERS = {
  '@better-auth/passkey': '>=1.7.16 <1.8.0',
  '@playwright/test': '>=1.0.0',
  'better-auth': '>=1.7.16 <1.8.0',
  // The /ui styles and the lt-* components are Tailwind 4 classes; the app compiles them (DEV-4079 in nuxt-extensions).
  tailwindcss: '>=4.0.0',
  'tus-js-client': '>=4.0.0',
};
for (const [name, range] of Object.entries(PEERS)) {
  if (manifest.peerDependencies?.[name] !== range) fail(`peer ${name} must be "${range}", is "${manifest.peerDependencies?.[name]}"`);
}
for (const optional of ['@better-auth/passkey', '@playwright/test', 'tailwindcss', 'tus-js-client', '@angular/ssr']) {
  if (!manifest.peerDependenciesMeta?.[optional]?.optional) fail(`peer ${optional} must be optional`);
}
if (manifest.version !== JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version) fail('dist version differs from root package.json');
if (manifest.scripts || manifest.devDependencies) fail('dist manifest must not contain scripts/devDependencies');

const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
for (const file of walk(dist)) {
  const rel = file.slice(dist.length + 1);
  if (/\.spec\.|test-setup|(^|\/)\.env|\.tgz$/.test(rel)) fail(`must not be packed: ${rel}`);
}
const sources = walk(join(dist, 'fesm2022')).filter((file) => file.endsWith('.mjs'));
for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  if (/is not implemented yet/.test(text)) fail(`${file.slice(dist.length + 1)} still contains a contract stub ("is not implemented yet")`);
  if (/\/Users\/|projects\/ng-base\//.test(text.replace(/\/\/# sourceMappingURL=.*$/m, ''))) fail(`${file.slice(dist.length + 1)} leaks a workspace path`);
}

if (errors.length) {
  console.error(`Package manifest check failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`Package manifest OK (${ENTRIES.length} entry points, version ${manifest.version})`);
