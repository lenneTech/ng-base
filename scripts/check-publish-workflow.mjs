#!/usr/bin/env node
/**
 * Verifies `.github/workflows/publish.yml` against what npm Trusted Publishing (OIDC, DEV-3143) needs. The workflow
 * runs only on a release tag, so a mistake here shows on a release day: a tag on GitHub and nothing on npm, or a
 * publish that silently went out with the long-lived NPM_TOKEN instead.
 *
 * - `id-token: write` at workflow level and no job-level `permissions:` (that block replaces the workflow's and drops
 *   the OIDC token, so npm falls back to the token without a word);
 * - npm installed pinned to a major >= 12 before the publish (Trusted Publishing needs npm >= 11.5.1);
 * - exactly one `npm publish`, with `--ignore-scripts`, so no lifecycle script runs in the publish step;
 * - that step runs unconditionally and without `continue-on-error`: either turns a failed or skipped publish into a
 *   green run that still creates the GitHub release;
 * - no npm token from a secret anywhere: since 22.0.4 (`_npmUser.trustedPublisher` on the registry) ng-base publishes
 *   through Trusted Publishing only.
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

if (publishSteps.length > 1) fail('more than one step runs npm publish: Trusted Publishing is the only route (DEV-3143)');
const [publish] = publishSteps;
if (publish !== undefined) {
  const npmInstall = steps.findIndex((step) => /\bnpm install -g npm@/.test(step));
  const major = Number(/\bnpm install -g npm@(\d+)\s*$/m.exec(steps[npmInstall] ?? '')?.[1]);
  if (npmInstall === -1 || npmInstall > publish) fail('npm for Trusted Publishing is not installed before the publish');
  else if (!(major >= 12)) fail('npm must be installed pinned to a major >= 12 (npm@<major>, never @latest)');

  const check = steps.findIndex((step) => /\brun: pnpm run check:raw$/m.test(step));
  if (check === -1 || check > publish) fail('the check:raw gate does not run before the publish');

  if (/^\s+continue-on-error: (?!false\s*$)/m.test(steps[publish])) {
    fail('the publish step has continue-on-error: a failed publish would end the run green and still create the GitHub release');
  }
  if (/^\s+if:/m.test(steps[publish])) fail('the publish step runs conditionally: a skipped publish would still create the GitHub release');
}

// Secret names are case-insensitive in GitHub Actions.
if (/secrets\.NPM_TOKEN\b/i.test(code)) fail('NPM_TOKEN is referenced: ng-base publishes through Trusted Publishing only');
if (/NODE_AUTH_TOKEN:\s*\$\{\{[^}]*\bsecrets\./i.test(code)) fail('NODE_AUTH_TOKEN comes from a secret: ng-base publishes through Trusted Publishing only');

if (errors.length) {
  console.error(`Publish workflow check failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('Publish workflow OK (Trusted Publishing only)');
