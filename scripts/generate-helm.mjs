#!/usr/bin/env node
/**
 * Generates the Spartan helm layer into the `/ui` entry point of the library.
 *
 * The Spartan CLI (`ng g @spartan-ng/cli:ui`) needs an nx workspace and cannot target a secondary entry
 * point of a publishable library. This script reproduces what its generator does, without nx:
 *
 * 1. read the helm templates shipped in the `@spartan-ng/cli` package (`src/generators/ui/libs/<name>/files`),
 * 2. replace the `<%- importAlias %>/<lib>` imports with relative imports inside `ui/helm/`,
 * 3. run the CLI's own style transform (`spartan-*` placeholder classes → Tailwind classes of the chosen style).
 *
 * Usage (the CLI package is only downloaded, never installed into this workspace):
 *
 *   mkdir -p /tmp/spartan && cd /tmp/spartan && npm pack @spartan-ng/cli@1.9.0 && tar xzf spartan-ng-cli-1.9.0.tgz
 *   (cd package && npm install --no-save ts-morph@25.0.1 postcss postcss-selector-parser zod@3.25.76 tailwind-merge@3)
 *   node scripts/generate-helm.mjs --cli /tmp/spartan/package [--style vega] [name …]
 *
 * Without names every helm library listed in `supported-ui-libraries.json` is generated. Existing files in
 * `projects/ng-base/ui/src/lib/helm/<name>/` are overwritten; lenne.Tech components live in `ui/src/lib/lt/` and are never touched.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const helmDir = join(root, 'projects/ng-base/ui/src/lib/helm');

const args = process.argv.slice(2);
const option = (flag, fallback) => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return fallback;
  }
  const [value] = args.splice(index, 2).slice(1);
  return value;
};
const cliDir = option('--cli');
const style = option('--style', 'vega');
if (!cliDir || !existsSync(join(cliDir, 'src/generators/ui/libs'))) {
  console.error('Pass --cli <path to the extracted @spartan-ng/cli package> (see the header of this script).');
  process.exit(1);
}

const require = createRequire(join(cliDir, 'package.json'));
const { createStyleMap } = require('./src/generators/base/lib/styles/create-style-map.js');
const { transformStyle } = require('./src/generators/base/lib/styles/transform.js');
const libsDir = join(cliDir, 'src/generators/ui/libs');
const supported = JSON.parse(readFileSync(join(cliDir, 'src/generators/ui/supported-ui-libraries.json'), 'utf8'));
const styleMap = createStyleMap(readFileSync(join(cliDir, `src/generators/ui/style-${style}.css`), 'utf8'));

// Left out because they need third-party packages ng-base does not want to impose on every consumer
// (`@tanstack/charts`, `embla-carousel`, `ngx-scrollbar`, `ngx-pagination`). Generate them into an app instead.
const EXCLUDED = new Set(['carousel', 'chart', 'scroll-area']);
const DROPPED_FILES = { pagination: ['lib/hlm-numbered-pagination.ts', 'lib/hlm-numbered-pagination-query-params.ts'] };

const names = args.length ? args : Object.keys(supported).filter((name) => !EXCLUDED.has(name));
const walk = (dir) => readdirSync(dir).flatMap((entry) => (statSync(join(dir, entry)).isDirectory() ? walk(join(dir, entry)) : [join(dir, entry)]));
const toPosix = (path) => path.split(sep).join('/');

let written = 0;
for (const name of names) {
  const filesDir = join(libsDir, name, 'files');
  if (!existsSync(filesDir)) {
    console.error(`Unknown helm library: ${name}`);
    process.exit(1);
  }
  const dropped = (DROPPED_FILES[name] ?? []).map((file) => `${file}.template`);
  for (const template of walk(filesDir)) {
    if (dropped.includes(toPosix(relative(filesDir, template)))) {
      continue;
    }
    const target = join(helmDir, name, relative(filesDir, template).replace(/\.template$/, ''));
    const targetDir = dirname(target);
    let source = readFileSync(template, 'utf8').replace(/(['"])<%- importAlias %>\/([\w-]+)\1/g, (_, quote, lib) => {
      let path = toPosix(relative(targetDir, join(helmDir, lib)));
      if (!path.startsWith('.')) {
        path = `./${path}`;
      }
      return `${quote}${path}${quote}`;
    });
    if (source.includes('<%')) {
      console.error(`Unhandled template expression in ${template}`);
      process.exit(1);
    }
    if (target.endsWith('.ts')) {
      source = await transformStyle(source, { styleMap });
    }
    for (const file of DROPPED_FILES[name] ?? []) {
      const symbol = `./${file.replace(/\.ts$/, '')}`;
      const className = file
        .replace(/^lib\/hlm-/, '')
        .replace(/\.ts$/, '')
        .replace(/(^|-)(\w)/g, (_, __, char) => char.toUpperCase());
      source = source
        .split('\n')
        .filter((line) => !line.includes(`'${symbol}'`) && line.trim() !== `Hlm${className},`)
        .join('\n');
    }
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(target, source);
    written++;
  }
}
console.log(`Generated ${written} files for ${names.length} helm libraries (style ${style}) into ${toPosix(relative(root, helmDir))}`);
