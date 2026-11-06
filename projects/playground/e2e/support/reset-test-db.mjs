#!/usr/bin/env node
/**
 * Drops the E2E database before the API starts. Run by the API `webServer` command of `playwright.config.ts` with the
 * API checkout as working directory, whose node_modules provide the `mongodb` driver. Not a `globalSetup`: Playwright
 * starts the web servers before the global setup, and dropping the database under a running API loses its indexes.
 *
 * Refuses anything but the database `ng-base-playground-e2e` on a loopback host.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

const EXPECTED_DB = 'ng-base-playground-e2e';
const uri = process.env.NSC__MONGOOSE__URI ?? '';

let target;
try {
  target = new URL(uri);
} catch {
  target = null;
}
const dbName = target?.pathname.replace(/^\//, '');
if (!target || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || dbName !== EXPECTED_DB) {
  console.error(`[e2e] Refusing to drop "${uri}": only ${EXPECTED_DB} on a loopback host is reset.`);
  process.exit(1);
}

const { MongoClient } = createRequire(join(process.cwd(), 'package.json'))('mongodb');
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  await client.db(dbName).dropDatabase();
  console.log(`[e2e] Dropped database ${dbName}`);
} finally {
  await client.close();
}
