import * as server from '@lenne.tech/ng-base/bug/server';

import * as browser from './redact';

// The server entry keeps its own copy of the redaction (it must not import browser code); both must behave identically.
const VECTORS = [
  'https://api.test/iam/verify-email?token=aaa&callbackURL=https%3A%2F%2Fapp.test%2Fdone%3Ftoken%3Dbbb',
  '{"password":"x","list":[{"secret":"y"}],"name":"n"}',
  'email=a%40b.de&password=geheim',
  'Bearer abc.def-123456 and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
  'https://user:pass@host/reset-password/tok123?code=1',
  'password: hunter2 / otp=123456',
  '/system-setup/init',
];

describe('redaction parity browser ↔ server', () => {
  it('both entries share the same constants', () => {
    expect(server.LT_BUG_REDACTED).toBe(browser.LT_BUG_REDACTED);
    expect(server.LT_BUG_SENSITIVE_HEADERS).toEqual(browser.LT_BUG_SENSITIVE_HEADERS);
    expect(server.LT_BUG_BODY_EXCLUDED_SEGMENTS).toEqual(browser.LT_BUG_BODY_EXCLUDED_SEGMENTS);
  });

  it('both entries redact the same way', () => {
    for (const vector of VECTORS) {
      expect(server.redactLtText(vector), vector).toBe(browser.redactLtText(vector));
      expect(server.redactLtUrl(vector), vector).toBe(browser.redactLtUrl(vector));
      expect(server.redactLtBody(vector), vector).toBe(browser.redactLtBody(vector));
      expect(server.isLtBodyExcludedUrl(vector), vector).toBe(browser.isLtBodyExcludedUrl(vector));
      expect(server.isLtSensitiveKey(vector), vector).toBe(browser.isLtSensitiveKey(vector));
    }
    const headers = { Authorization: 'x', Cookie: 'y', Location: '/x?token=1', 'X-System-Setup-Token': 'z' };
    expect(server.redactLtHeaders(headers)).toEqual(browser.redactLtHeaders(headers));
  });
});
