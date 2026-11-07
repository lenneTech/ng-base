#!/usr/bin/env node
/**
 * Verifies `.github/workflows/publish.yml` against what npm Trusted Publishing (OIDC, DEV-3143) needs. The workflow
 * runs only on a release tag, so a mistake here shows on a release day: a tag on GitHub and nothing on npm, or a
 * publish that silently went out with the long-lived NPM_TOKEN instead.
 *
 * - `id-token: write` at workflow level and no job-level `permissions:` (that block replaces the workflow's and drops
 *   the OIDC token, so npm falls back to the token without a word);
 * - npm installed pinned to a major >= 12 before the first publish (Trusted Publishing needs npm >= 11.5.1);
 * - every `npm publish` with `--ignore-scripts`, so no lifecycle script runs in a step that can publish;
 * - the first publish step holds no NPM_TOKEN; the token appears only in a fallback publish step that runs when the
 *   first one failed (and disappears once a release went out through OIDC);
 * - `continue-on-error` only on a publish step a fallback follows: it turns a failed publish into a green step, so
 *   without a fallback (or on the fallback itself) the run ends green and still creates the GitHub release.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(root, '.github/workflows/publish.yml'), 'utf8');
const errors = [];
const fail = (message) => errors.push(message);

// Comments explain the steps and may name the token; only the YAML itself counts.
const code = workflow
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');
const marker = '\n    steps:\n';
const steps = code.includes(marker)
  ? code
      .slice(code.indexOf(marker) + marker.length)
      .split(/\n(?= {6}- )/)
      .map((step) => step.trim())
      .filter(Boolean)
  : [];
if (steps.length < 5) fail('could not read the steps of the publish job');

const permissions = /^permissions:\n((?: {2}\S[^\n]*\n?)+)/m.exec(code)?.[1] ?? '';
if (!/^ {2}id-token: write$/m.test(permissions)) fail('workflow-level permissions lack "id-token: write"');
if (/^ {4}permissions:/m.test(code)) fail('a job-level "permissions:" replaces the workflow block and drops id-token');

const publishSteps = steps.flatMap((step, index) => (/\bnpm publish\b/.test(step) ? [index] : []));
if (!publishSteps.length) fail('no step runs npm publish');
for (const index of publishSteps) {
  const publishLines = steps[index].split('\n').filter((line) => /\bnpm publish\b/.test(line));
  if (publishLines.some((line) => !/\s--ignore-scripts\b/.test(line))) fail(`step ${index + 1}: npm publish without --ignore-scripts`);
}

const [first, ...fallbacks] = publishSteps;
if (first !== undefined) {
  const npmInstall = steps.findIndex((step) => /\bnpm install -g npm@/.test(step));
  const major = Number(/\bnpm install -g npm@(\d+)\s*$/m.exec(steps[npmInstall] ?? '')?.[1]);
  if (npmInstall === -1 || npmInstall > first) fail('npm for Trusted Publishing is not installed before the first publish');
  else if (!(major >= 12)) fail('npm must be installed pinned to a major >= 12 (npm@<major>, never @latest)');

  const check = steps.findIndex((step) => /\brun: pnpm run check:raw$/m.test(step));
  if (check === -1 || check > first) fail('the check:raw gate does not run before the first publish');

  if (/secrets\.NPM_TOKEN/.test(steps[first])) fail('the first publish step holds NPM_TOKEN: it must go out through OIDC');
  const id = /^\s+id: ([\w-]+)$/m.exec(steps[first])?.[1];
  const continuesOnError = (index) => /^\s+continue-on-error: (?!false\s*$)/m.test(steps[index]);
  if (fallbacks.length && (!id || !/^\s+continue-on-error: true$/m.test(steps[first]))) {
    fail('the first publish step needs an id and continue-on-error, so the fallback can run after it');
  }
  if (!fallbacks.length && continuesOnError(first)) {
    fail('the only publish step has continue-on-error: a failed publish would end the run green (remove it with the fallback)');
  }
  for (const index of fallbacks) {
    if (continuesOnError(index)) fail(`step ${index + 1}: the fallback publish must fail the run (no continue-on-error)`);
    if (!id || !new RegExp(`^\\s+if: steps\\.${id}\\.outcome == 'failure'$`, 'm').test(steps[index])) {
      fail(`step ${index + 1}: a further publish runs only when the first one failed`);
    }
  }
}

const tokenSteps = steps.flatMap((step, index) => (/secrets\.NPM_TOKEN/.test(step) ? [index] : []));
if (code.split('secrets.NPM_TOKEN').length - 1 !== tokenSteps.length) fail('NPM_TOKEN is referenced outside a step (workflow or job env)');
for (const index of tokenSteps) {
  if (!fallbacks.includes(index)) fail(`step ${index + 1} holds NPM_TOKEN but is not a fallback publish step`);
}

if (errors.length) {
  console.error(`Publish workflow check failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`Publish workflow OK (${publishSteps.length} publish step${publishSteps.length === 1 ? '' : 's'}, ${tokenSteps.length ? 'NPM_TOKEN fallback' : 'OIDC only'})`);
