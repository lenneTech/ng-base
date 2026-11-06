import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

import { API_LOG } from './support/env';

/**
 * Runs after every spec (project `api-log`): nest-server logs `JWKS verification error` for every JWT it cannot read —
 * in the Authorization header or in the `lt-jwt-token` cookie, which it reads as the raw JWT. 22.0.0 wrote that cookie
 * JSON-quoted, so every request carrying it produced the error while the flows stayed green over the header.
 */
test('the API logged no JWKS error during the run', () => {
  expect(existsSync(API_LOG), API_LOG).toBe(true);
  const log = readFileSync(API_LOG, 'utf8');
  expect(log.length, 'the API log is empty').toBeGreaterThan(0);
  expect(log.split('\n').filter((line) => line.includes('JWKS verification error'))).toEqual([]);
});
