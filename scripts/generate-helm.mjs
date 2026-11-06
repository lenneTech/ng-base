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

/**
 * lenne.Tech patches of generated files. `aria-invalid` / `data-invalid` of Spartan's `BrnInput` / `BrnTextarea` follow
 * raw validity, so an untouched empty required field is announced as invalid before the user typed anything; the red
 * border already waits for the error state (`spartanInvalid`: invalid and touched or submitted). The patch binds both
 * attributes to that error state on the hlm directive as well. Angular writes an attribute binding only when its own
 * value changes, so the hlm binding switches between equivalent values (`null`/`undefined` remove the attribute,
 * `'true'`/`true` set it) whenever the raw validity changes: it then writes after Spartan's binding every time
 * Spartan's does (typing and clearing a field without leaving it stays unannounced). Every replacement is asserted,
 * so a changed template fails here instead of silently losing the patch.
 */
function invalidFollowsErrorState(brn) {
  return (source) => {
    const steps = [
      ["import { Directive } from '@angular/core';", "import { computed, Directive, inject } from '@angular/core';"],
      ["import { BrnFieldControlDescribedBy } from '@spartan-ng/brain/field';", "import { BrnFieldControl, BrnFieldControlDescribedBy } from '@spartan-ng/brain/field';"],
      [/host: \{ ('data-slot': '[\w-]+') \},/, `host: {\n\t\t$1,\n\t\t'[attr.aria-invalid]': '_ltAttr()',\n\t\t'[attr.data-invalid]': '_ltAttr()',\n\t},`],
      [
        /(export class Hlm\w+ \{\n)/,
        `$1\tprivate readonly _ltBrn = inject(${brn});\n\tprivate readonly _ltField = inject(BrnFieldControl, { optional: true });\n\t/** lenne.Tech: invalid only in the error state (touched or submitted), like the red border. */\n\tprotected readonly _ltInvalid = computed(() => this._ltBrn.forceInvalid() || !!this._ltField?.spartanInvalid());\n\t/** Changes with every raw-validity change, so this binding always writes after the host directive's (see generate-helm.mjs). */\n\tprotected readonly _ltAttr = computed(() => {\n\t\tconst raw = !!this._ltField?.invalid();\n\t\treturn this._ltInvalid() ? (raw ? 'true' : true) : raw ? null : undefined;\n\t});\n\n`,
      ],
    ];
    for (const [pattern, replacement] of steps) {
      const next = source.replace(pattern, replacement);
      if (next === source) {
        console.error(`generate-helm: patch for ${brn} no longer applies (${pattern})`);
        process.exit(1);
      }
      source = next;
    }
    return source;
  };
}
const PATCHES = {
  'input/lib/hlm-input.ts': invalidFollowsErrorState('BrnInput'),
  'textarea/lib/hlm-textarea.ts': invalidFollowsErrorState('BrnTextarea'),
};

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
    const patch = PATCHES[toPosix(relative(helmDir, target))];
    if (patch) {
      source = patch(source);
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
