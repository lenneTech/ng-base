#!/usr/bin/env node
/**
 * Verifies the library texts (`projects/ng-base/**\/i18n/{de,en}.json`) against the code that uses them, the counterpart
 * of nuxt-extensions' `test/locale-keys.test.ts` (DEV-4069):
 *
 * - every `lt.*` key the code references is defined (a missing key shows the raw key to the user);
 * - every defined key is referenced, literally or under a dynamic prefix (`lt.bug.events.${type}`): nothing is shipped
 *   that no code can show;
 * - `de` and `en` define the same keys.
 *
 * References are quoted strings in `.ts` (comments removed) and `.html` files outside specs and the generated helm layer.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const library = join(root, 'projects/ng-base');
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? (name === 'node_modules' || name === 'helm' ? [] : walk(path)) : [path];
  });
const files = walk(library);
const keysOf = (tree, prefix = '') => Object.entries(tree).flatMap(([key, value]) => (typeof value === 'string' ? [`${prefix}${key}`] : keysOf(value, `${prefix}${key}.`)));

const defined = new Map();
for (const file of files.filter((path) => /\/i18n\/(de|en)\.json$/.test(path))) {
  const language = file.endsWith('de.json') ? 'de' : 'en';
  for (const key of keysOf(JSON.parse(readFileSync(file, 'utf8')))) {
    const entry = defined.get(key) ?? {};
    entry[language] = relative(root, file);
    defined.set(key, entry);
  }
}

const used = new Map();
const prefixes = new Set();
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
for (const file of files.filter((path) => /\.(ts|html)$/.test(path) && !path.endsWith('.spec.ts'))) {
  const source = file.endsWith('.ts') ? withoutComments(readFileSync(file, 'utf8')) : readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(['"`])(lt\.[\w.]*\w)\1/g)) {
    if (!used.has(match[2])) {
      used.set(match[2], relative(root, file));
    }
  }
  for (const match of source.matchAll(/`(lt\.[\w.]*\.)\$\{/g)) {
    prefixes.add(match[1]);
  }
}

const errors = [];
for (const [key, file] of used) {
  if (!defined.has(key) && ![...defined.keys()].some((candidate) => candidate.startsWith(`${key}.`))) {
    errors.push(`${key} is used in ${file} but defined in no locale file`);
  }
}
for (const [key, languages] of defined) {
  if (!languages.de || !languages.en) {
    errors.push(`${key} is defined only in ${languages.de ?? languages.en}`);
  }
  if (!used.has(key) && ![...prefixes].some((prefix) => key.startsWith(prefix))) {
    errors.push(`${key} (${languages.de ?? languages.en}) is used nowhere: remove it`);
  }
}

if (errors.length) {
  console.error(`i18n check failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`i18n OK (${defined.size} keys, all used and defined in de and en)`);
