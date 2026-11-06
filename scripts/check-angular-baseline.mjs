#!/usr/bin/env node
/**
 * Angular CLI baseline check: the workspace must look as if the pinned Angular CLI had generated it.
 *
 * It scaffolds a reference with the CLI version pinned in package.json —
 *   ng new ng-base --create-application=false --ai-config=claude-code
 *   ng generate library ng-base --prefix=lt
 *   ng generate application playground --ssr --style=tailwind --prefix=app
 * — and compares angular.json, the tsconfigs, ng-package.json, .editorconfig, .vscode/*, .mcp.json and the Angular
 * best-practice block of CLAUDE.md/AGENTS.md key by key. Every difference must be listed in ALLOWED below with its
 * reason (lt contract: prefix `lt`, package name, secondary entry points, SSR playground on port 3001 with proxy,
 * oxfmt instead of prettier, exact pins …). Anything else fails the check.
 *
 * Run it in the release gate and after every `ng update`: `pnpm run check:baseline` (`--verbose` lists the allowed
 * differences, `--keep` keeps the reference directory).
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');
const keep = process.argv.includes('--keep');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const cliVersion = pkg.devDependencies['@angular/cli'];
const ENTRIES = ['auth', 'ui', 'files', 'share', 'ai', 'sync', 'server', 'testing', 'utils'];

/**
 * Allowed differences: `file` + JSON pointer prefix (`path`), with the reason. A pointer matches itself and every
 * key below it. `kind` restricts the rule to `added` (only in the workspace), `removed` (only in the reference) or
 * `changed`; omitted = any.
 */
const ALLOWED = [
  // angular.json
  { file: 'angular.json', path: '/cli/analytics', reason: 'Telemetry off for the base repository' },
  {
    file: 'angular.json',
    path: '/projects/ng-base/architect/test/options/include',
    reason: 'Specs of the secondary entry points live next to src/ (<entry>/src/**), globs are relative to the source root',
  },
  { file: 'angular.json', path: '/projects/ng-base/architect/test/options/setupFiles', reason: 'Global test setup (fake-indexeddb for the offline sync tests)' },
  {
    file: 'angular.json',
    path: '/projects/playground/architect/build/options/allowedCommonJsDependencies',
    reason: 'url-parse is the CommonJS dependency of tus-js-client (TUS upload in /files); apps using uploads need the same entry',
  },
  { file: 'angular.json', path: '/projects/playground/architect/build/options/security/allowedHosts', reason: 'lt dev serves apps under *.localhost (Caddy); SSR host check' },
  {
    file: 'angular.json',
    path: '/projects/playground/architect/serve/options',
    kind: 'added',
    reason: 'Stack contract: app port 3001 (2FA/passkey origins) and the /api dev proxy',
  },
  // tsconfig.json
  {
    file: 'tsconfig.json',
    path: '/compilerOptions/paths',
    reason: 'Package name @lenne.tech/ng-base with secondary entry points, mapped to the sources (tests, playground, vendor-mode parity)',
  },
  { file: 'tsconfig.json', path: '/compilerOptions/resolveJsonModule', reason: 'The shipped de/en texts are JSON imports' },
  // library tsconfigs
  { file: 'projects/ng-base/tsconfig.lib.json', path: '/include', reason: 'Secondary entry points are mini libraries next to src/ (<entry>/src/**)' },
  { file: 'projects/ng-base/tsconfig.lib.json', path: '/exclude', reason: 'Specs and test fixtures of the secondary entry points' },
  { file: 'projects/ng-base/tsconfig.spec.json', path: '/include', reason: 'Specs of the secondary entry points and the global test setup' },
  { file: 'projects/ng-base/tsconfig.spec.json', path: '/compilerOptions/types', reason: 'Node types for the server/testing specs and fixtures' },
  // ng-package.json
  {
    file: 'projects/ng-base/ng-package.json',
    path: '/allowedNonPeerDependencies',
    reason: 'clsx, tailwind-merge, class-variance-authority of the Spartan helm layer are dependencies',
  },
  { file: 'projects/ng-base/ng-package.json', path: '/assets', reason: 'Ships the theme CSS, de/en texts, README and CLAUDE.md' },
  // .editorconfig is taken over unchanged; CLAUDE.md/AGENTS.md: only the best-practice block is compared.
];

const errors = [];
const allowed = [];

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: verbose ? 'inherit' : 'pipe', env: { ...process.env, NG_CLI_ANALYTICS: 'false' } });
}

const ts = createRequire(import.meta.url)('typescript');

/** Parse JSON with comments and trailing commas (tsconfig, .vscode) via the TypeScript parser. */
function readJson(file) {
  const { config, error } = ts.parseConfigFileTextToJson(file, readFileSync(file, 'utf8'));
  if (error) {
    throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`);
  }
  return config;
}

function flatten(value, pointer = '', out = new Map()) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, out);
    }
    if (!Object.keys(value).length) out.set(pointer, '{}');
    return out;
  }
  out.set(pointer, JSON.stringify(value));
  return out;
}

function isAllowed(file, pointer, kind) {
  return ALLOWED.find((rule) => rule.file === file && (pointer === rule.path || pointer.startsWith(`${rule.path}/`)) && (!rule.kind || rule.kind === kind));
}

function compareJson(file, referenceFile, actualFile) {
  if (!existsSync(actualFile)) {
    errors.push(`${file}: missing in the workspace`);
    return;
  }
  const reference = flatten(readJson(referenceFile));
  const actual = flatten(readJson(actualFile));
  for (const [pointer, value] of reference) {
    const kind = !actual.has(pointer) ? 'removed' : actual.get(pointer) !== value ? 'changed' : null;
    if (!kind) continue;
    const rule = isAllowed(file, pointer, kind);
    const line = `${file} ${pointer}: ${kind} (reference ${value}${kind === 'changed' ? `, workspace ${actual.get(pointer)}` : ''})`;
    if (rule) allowed.push(`${line} — ${rule.reason}`);
    else errors.push(line);
  }
  for (const [pointer, value] of actual) {
    if (reference.has(pointer)) continue;
    const rule = isAllowed(file, pointer, 'added');
    const line = `${file} ${pointer}: added (${value})`;
    if (rule) allowed.push(`${line} — ${rule.reason}`);
    else errors.push(line);
  }
}

function compareText(file, referenceFile, actualFile) {
  if (!existsSync(actualFile)) {
    errors.push(`${file}: missing in the workspace`);
  } else if (readFileSync(referenceFile, 'utf8') !== readFileSync(actualFile, 'utf8')) {
    errors.push(`${file}: differs from the CLI reference`);
  }
}

const work = mkdtempSync(join(tmpdir(), 'ng-base-baseline-'));
try {
  console.log(`Scaffolding the reference with @angular/cli@${cliVersion} …`);
  const cli = ['dlx', `@angular/cli@${cliVersion}`];
  run('pnpm', [...cli, 'new', 'ng-base', '--create-application=false', '--skip-install', '--skip-git', '--package-manager=pnpm', '--ai-config=claude-code'], work);
  const ref = join(work, 'ng-base');
  run('pnpm', [...cli, 'generate', 'library', 'ng-base', '--prefix=lt', '--skip-install'], ref);
  run('pnpm', [...cli, 'generate', 'application', 'playground', '--ssr', '--style=tailwind', '--prefix=app', '--skip-install'], ref);

  for (const file of [
    'angular.json',
    'tsconfig.json',
    'projects/ng-base/ng-package.json',
    'projects/ng-base/tsconfig.lib.json',
    'projects/ng-base/tsconfig.lib.prod.json',
    'projects/ng-base/tsconfig.spec.json',
    'projects/playground/tsconfig.app.json',
    'projects/playground/tsconfig.spec.json',
    'projects/playground/.postcssrc.json',
    '.vscode/extensions.json',
    '.vscode/launch.json',
    '.vscode/tasks.json',
    '.mcp.json',
  ]) {
    compareJson(file, join(ref, file), join(root, file));
  }
  compareText('.editorconfig', join(ref, '.editorconfig'), join(root, '.editorconfig'));

  // Secondary entry points follow the same pattern as the generated library: <entry>/ng-package.json → src/public-api.ts.
  for (const entry of ENTRIES) {
    const dir = join(root, 'projects/ng-base', entry);
    const manifest = existsSync(join(dir, 'ng-package.json')) ? readJson(join(dir, 'ng-package.json')) : null;
    if (manifest?.lib?.entryFile !== 'src/public-api.ts') errors.push(`projects/ng-base/${entry}/ng-package.json: lib.entryFile must be src/public-api.ts`);
    if (!existsSync(join(dir, 'src/public-api.ts'))) errors.push(`projects/ng-base/${entry}/src/public-api.ts missing`);
    if (!existsSync(join(dir, 'src/lib'))) errors.push(`projects/ng-base/${entry}/src/lib missing`);
  }
  if (!existsSync(join(root, 'projects/ng-base/src/public-api.ts'))) errors.push('projects/ng-base/src/public-api.ts missing');

  // Own components: template in an own .html file (helm layer excluded).
  const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
  for (const file of walk(join(root, 'projects')).filter((path) => path.endsWith('.ts') && !path.includes('/helm/') && !path.endsWith('.spec.ts'))) {
    const source = readFileSync(file, 'utf8');
    if (/@Component\(\{[\s\S]*?\btemplate\s*:/.test(source)) errors.push(`${file.slice(root.length + 1)}: inline template (use templateUrl)`);
  }

  // The Angular best-practice block of CLAUDE.md / AGENTS.md must be the CLI text, verbatim.
  const block = readFileSync(join(ref, 'CLAUDE.md'), 'utf8').trim();
  for (const file of ['CLAUDE.md', 'AGENTS.md']) {
    if (!existsSync(join(root, file)) || !readFileSync(join(root, file), 'utf8').includes(block)) errors.push(`${file}: the Angular best-practice block differs from the CLI text`);
  }
} finally {
  if (keep) console.log(`Reference kept in ${work}`);
  else rmSync(work, { force: true, recursive: true });
}

if (verbose && allowed.length) {
  console.log(`Allowed differences:\n- ${allowed.join('\n- ')}`);
}
if (errors.length) {
  console.error(
    `Angular baseline check failed (${errors.length}):\n- ${errors.join('\n- ')}\nFix the workspace, or add a reasoned entry to ALLOWED in scripts/check-angular-baseline.mjs.`,
  );
  process.exit(1);
}
console.log(`Angular baseline OK (CLI ${cliVersion}, ${allowed.length} allowed differences)`);
