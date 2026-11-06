#!/usr/bin/env node
/**
 * Generates the per-component Tailwind source files of `@lenne.tech/ng-base/ui`: one
 * `projects/ng-base/ui/styles/components/<name>.css` per helm library, lt component, the upload component and the bug
 * reporter components, each
 * an `@source inline("…")` with the class candidates found in that component's sources plus `@import`s of the
 * components it uses. Apps that import `core.css` and only the component files they render ship a fraction of the
 * CSS of `theme.css` (which scans every component).
 *
 *   node scripts/generate-ui-sources.mjs          write
 *   node scripts/generate-ui-sources.mjs --check  fail when the committed files are stale
 *
 * Candidates are taken generously (every whitespace-separated token of every string literal and template attribute);
 * Tailwind ignores tokens that are no utility, so over-inclusion costs nothing, under-inclusion would lose styles. One
 * exception: a token with unbalanced `()`/`[]` (`(the` from a comment, `(checked()` from a template expression) makes
 * Tailwind drop the whole `@source inline()` list or part of it, so such tokens are never written.
 *
 * `--check` also compiles every component file on its own with Tailwind and fails when one yields no rule, or when
 * `dialog.css` lacks the overlay height limit (`LT_OVERLAY_CONTENT_CLASS`), the regression that hid dialog actions.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lib = join(root, 'projects/ng-base');
const helmDir = join(lib, 'ui/src/lib/helm');
const ltDir = join(lib, 'ui/src/lib/lt');
const filesUiDir = join(lib, 'files/ui/src/lib');
const bugUiDir = join(lib, 'bug/src/lib/ui');
const outDir = join(lib, 'ui/styles/components');
const check = process.argv.includes('--check');
/** Units without any Tailwind class on purpose (behaviour directives); every other unit must yield at least one rule. */
const STYLELESS = new Set(['lt-enter-action.css', 'lt-toolbar-item.css', 'lt-toolbar.css']);

/** Whether `()` and `[]` open and close in order (Tailwind's candidate parser needs it). */
function isBalanced(token) {
  const stack = [];
  for (const char of token) {
    if (char === '(' || char === '[') stack.push(char);
    else if (char === ')' || char === ']') {
      if (stack.pop() !== (char === ')' ? '(' : '[')) return false;
    }
  }
  return stack.length === 0;
}

/** Code-point order (as the default sort), stable across locales. */
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
const isSource = (file) => (file.endsWith('.ts') || file.endsWith('.html')) && !file.endsWith('.spec.ts');

/** Class candidates of one source file. */
function candidates(file) {
  const text = readFileSync(file, 'utf8');
  const chunks = [];
  if (file.endsWith('.html')) {
    for (const match of text.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) chunks.push(match[1]);
    for (const match of text.matchAll(/'([^'\n]*)'/g)) chunks.push(match[1]);
  } else {
    for (const match of text.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`]*)`/g)) chunks.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  const tokens = new Set();
  for (const chunk of chunks) {
    for (const token of chunk.split(/\s+/)) {
      // Characters that would break `@source inline("…")` (quotes, braces = brace expansion, backslash) are skipped.
      if (token && token.length < 200 && /^[\x21-\x7e]+$/.test(token) && !/["{}\\`$]/.test(token) && /[a-z]/.test(token) && isBalanced(token)) tokens.add(token);
    }
  }
  return tokens;
}

/** Component units: name → { files, deps }. */
const units = new Map();
for (const name of readdirSync(helmDir).sort()) {
  const files = walk(join(helmDir, name)).filter(isSource);
  const deps = new Set();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/from '(?:\.\.\/)+(?:helm\/)?([\w-]+)'/g)) {
      if (match[1] !== name && existsSync(join(helmDir, match[1]))) deps.add(match[1]);
    }
  }
  units.set(name, { deps, files });
}
// LtOverlayService (a service, no component) sets the default content classes of every dialog it opens.
units.get('dialog')?.files.push(join(ltDir, 'overlay.ts'));
for (const file of readdirSync(ltDir).sort()) {
  if (!file.endsWith('.ts') || file.endsWith('.spec.ts') || file === 'index.ts') continue;
  const base = basename(file, '.ts');
  const files = [join(ltDir, file), ...(existsSync(join(ltDir, `${base}.html`)) ? [join(ltDir, `${base}.html`)] : [])];
  const source = readFileSync(join(ltDir, file), 'utf8');
  if (!/@Component\(|@Directive\(/.test(source)) continue;
  const deps = new Set();
  for (const match of source.matchAll(/from '\.\.\/helm\/([\w-]+)'/g)) deps.add(match[1]);
  for (const match of source.matchAll(/from '\.\/([\w-]+)'/g)) {
    if (existsSync(join(ltDir, `${match[1]}.ts`)) && /@Component\(|@Directive\(/.test(readFileSync(join(ltDir, `${match[1]}.ts`), 'utf8'))) deps.add(`lt-${match[1]}`);
  }
  units.set(`lt-${base}`, { deps, files });
}
for (const file of readdirSync(filesUiDir).sort()) {
  if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
  const base = basename(file, '.ts');
  const files = [join(filesUiDir, file), ...(existsSync(join(filesUiDir, `${base}.html`)) ? [join(filesUiDir, `${base}.html`)] : [])];
  const source = readFileSync(join(filesUiDir, file), 'utf8');
  if (!/@Component\(/.test(source)) continue;
  const deps = new Set();
  for (const match of source.matchAll(/\bHlm(\w+?)Imports\b/g)) {
    const helm = match[1].replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    if (existsSync(join(helmDir, helm))) deps.add(helm);
  }
  deps.add('utils');
  units.set(`lt-${base}`, { deps, files });
}
// Bug reporter (`@lenne.tech/ng-base/bug`): one unit per component in bug/src/lib/ui. Dependencies: helm libraries
// (`Hlm…Imports`), lt components (`LtFormField` → lt-form-field) and sibling components, also lazily imported ones
// (`import('./bug-report-dialog')`), so `lt-bug-report.css` brings the dialog's classes along.
const kebab = (name) => name.replace(/([a-z\d])([A-Z])/g, '$1-$2').toLowerCase();
for (const file of existsSync(bugUiDir) ? readdirSync(bugUiDir).sort() : []) {
  if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
  const base = basename(file, '.ts');
  const source = readFileSync(join(bugUiDir, file), 'utf8');
  if (!/@Component\(/.test(source)) continue;
  const files = [join(bugUiDir, file), ...(existsSync(join(bugUiDir, `${base}.html`)) ? [join(bugUiDir, `${base}.html`)] : [])];
  const deps = new Set(['utils']);
  for (const match of source.matchAll(/\bHlm(\w+?)Imports\b/g)) {
    const helm = kebab(match[1]);
    if (existsSync(join(helmDir, helm))) deps.add(helm);
  }
  for (const match of source.matchAll(/\bLt([A-Z]\w*)\b/g)) deps.add(`lt-${kebab(match[1])}`);
  for (const match of source.matchAll(/(?:from |import\()'\.\/([\w-]+)'/g)) {
    if (match[1] !== base && existsSync(join(bugUiDir, `${match[1]}.ts`))) deps.add(`lt-${match[1]}`);
  }
  units.set(`lt-${base}`, { deps, files });
}

const expected = new Map();
for (const [name, unit] of units) {
  const tokens = new Set();
  for (const file of unit.files) for (const token of candidates(file)) tokens.add(token);
  const imports = [...unit.deps].filter((dep) => units.has(dep) && dep !== name).sort(byCodePoint);
  const lines = [
    `/* Generated by scripts/generate-ui-sources.mjs from ${relative(lib, unit.files[0]).split('\\').join('/')} — do not edit. */`,
    ...imports.map((dep) => `@import './${dep}.css';`),
    `@source inline("${[...tokens].sort(byCodePoint).join(' ')}");`,
    '',
  ];
  expected.set(`${name}.css`, lines.join('\n'));
}
const index = [
  '/* Generated by scripts/generate-ui-sources.mjs — every component (imported by theme.css). */',
  ...[...expected.keys()].sort(byCodePoint).map((file) => `@import './${file}';`),
  '',
].join('\n');
expected.set('index.css', index);

if (check) {
  const stale = [];
  for (const [file, content] of expected) {
    const path = join(outDir, file);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) stale.push(file);
  }
  const extra = existsSync(outDir) ? readdirSync(outDir).filter((file) => !expected.has(file)) : [];
  if (stale.length || extra.length) {
    console.error(`UI source files are stale (run node scripts/generate-ui-sources.mjs): ${[...stale, ...extra].join(', ')}`);
    process.exit(1);
  }
  await checkCompiles();
  console.log(`UI source files up to date and compiling (${expected.size - 1} components)`);
} else {
  rmSync(outDir, { force: true, recursive: true });
  mkdirSync(outDir, { recursive: true });
  for (const [file, content] of expected) writeFileSync(join(outDir, file), content);
  console.log(`Generated ${expected.size - 1} component source files into ${relative(root, outDir)}`);
}

/**
 * Compile every component file on its own (Tailwind without source detection) and fail when one yields no rule, or
 * when `dialog.css` misses the classes of `LT_OVERLAY_CONTENT_CLASS`.
 */
async function checkCompiles() {
  const { default: postcss } = await import('postcss');
  const { default: tailwind } = await import('@tailwindcss/postcss');
  const failures = [];
  const compile = async (file) => {
    const css = `@import 'tailwindcss/utilities' source(none);\n@import './${file}';\n`;
    return (await postcss([tailwind({ base: outDir, optimize: false })]).process(css, { from: join(outDir, '__check.css') })).css;
  };
  for (const file of [...expected.keys()].filter((name) => name !== 'index.css')) {
    const css = await compile(file);
    const hasRule = /\.[^\s{]+\s*\{/.test(css);
    if (!hasRule && !STYLELESS.has(file)) failures.push(`${file}: no rule (Tailwind dropped its @source list?)`);
    if (hasRule && STYLELESS.has(file)) failures.push(`${file}: has rules now, remove it from STYLELESS`);
  }
  const overlay = readFileSync(join(ltDir, 'overlay.ts'), 'utf8').match(/LT_OVERLAY_CONTENT_CLASS = '([^']+)'/)?.[1] ?? '';
  const dialog = await compile('dialog.css');
  for (const name of overlay.split(/\s+/).filter(Boolean)) {
    if (!dialog.includes(`.${name.replace(/[[\]():%/.!]/g, (c) => `\\${c}`)}`)) failures.push(`dialog.css: ${name} missing`);
  }
  if (!overlay) failures.push('overlay.ts: LT_OVERLAY_CONTENT_CLASS not found');
  if (failures.length) {
    console.error(`UI source files do not compile as expected:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
}
