#!/usr/bin/env node
/**
 * Quiet wrapper around the `check` chain: runs the steps of `check:fix` (default; auto-fixes format and lint) or
 * `check:raw` (`--no-fix`, read-only gate) one after another, shows one status line per step, stops at the first
 * failing step and prints its output tail. Exit code 0 only when every step passed (contract of the lt-dev
 * `running-check-script` skill). `--verbose` streams the full output.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const noFix = process.argv.includes('--no-fix');
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
const chain = scripts[noFix ? 'check:raw' : 'check:fix'];
const steps = chain.split('&&').map((step) => step.trim());

const run = (command) =>
  new Promise((resolve) => {
    const child = spawn(command, { cwd: root, env: { ...process.env, FORCE_COLOR: '0' }, shell: true, stdio: verbose ? 'inherit' : 'pipe' });
    let output = '';
    child.stdout?.on('data', (chunk) => (output += chunk));
    child.stderr?.on('data', (chunk) => (output += chunk));
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });

const started = Date.now();
for (const [index, step] of steps.entries()) {
  const t0 = Date.now();
  process.stdout.write(`[${index + 1}/${steps.length}] ${step} … `);
  const { code, output } = await run(step);
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  if (code !== 0) {
    console.log(`FAILED (${seconds}s)`);
    if (!verbose) {
      console.log(output.split('\n').slice(-60).join('\n'));
    }
    process.exit(1);
  }
  const plain = output.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
  const summary = plain.match(/Tests\s+(\d+ passed[^\n]*)/)?.[1] ?? plain.match(/(\d+ vulnerabilities? found[^\n]*)/i)?.[1] ?? '';
  console.log(`ok (${seconds}s)${summary ? ` — ${summary.trim()}` : ''}`);
}
console.log(`check passed in ${((Date.now() - started) / 1000).toFixed(0)}s (${noFix ? 'read-only' : 'with auto-fix'})`);
