import {
  isLtBodyExcludedUrl,
  isLtSensitiveHeader,
  isLtSensitiveKey,
  LT_BUG_REDACTED,
  redactLtBody,
  redactLtHeaders,
  redactLtText,
  redactLtUrl,
  redactLtValue,
  truncateLt,
} from './redact';

const R = LT_BUG_REDACTED;

describe('redaction', () => {
  it('redacts the credential headers case-insensitively and keeps the others', () => {
    expect(redactLtHeaders({ Authorization: 'Bearer abc', 'content-type': 'application/json', Cookie: 'session=1', 'set-cookie': 'a=b', 'X-System-Setup-Token': 'xyz' })).toEqual({
      Authorization: R,
      'content-type': 'application/json',
      Cookie: R,
      'set-cookie': R,
      'X-System-Setup-Token': R,
    });
    expect(isLtSensitiveHeader(' AUTHORIZATION ')).toBe(true);
    expect(isLtSensitiveHeader('accept')).toBe(false);
  });

  it('redacts token, code, password, secret and otp query parameters and keeps the others', () => {
    expect(redactLtUrl('https://app.test/auth/callback?code=abc123&state=ok&token=t0k&page=2')).toBe(`https://app.test/auth/callback?code=${R}&state=ok&token=${R}&page=2`);
    expect(redactLtUrl('/reset?password=hunter2&secret=s&otp=123456&access_token=x&apiKey=k')).toBe(`/reset?password=${R}&secret=${R}&otp=${R}&access_token=${R}&apiKey=${R}`);
    expect(redactLtUrl('https://app.test/#access_token=abc&scope=openid')).toBe(`https://app.test/#access_token=${R}&scope=openid`);
  });

  it('redacts tokens inside callbackURL values, plain and percent-encoded', () => {
    expect(redactLtUrl('https://api.test/iam/verify-email?token=aaa&callbackURL=https://app.test/done?token=bbb')).toBe(
      `https://api.test/iam/verify-email?token=${R}&callbackURL=https://app.test/done?token=${R}`,
    );
    const encoded = `https://api.test/iam/verify?callbackURL=${encodeURIComponent('https://app.test/x?token=bbb&lang=de')}`;
    const redacted = redactLtUrl(encoded);
    expect(redacted).not.toContain('bbb');
    expect(redacted).toContain('lang%3Dde');
  });

  it('redacts tokens in reset/verify paths, URL credentials, Bearer tokens and JWTs', () => {
    expect(redactLtUrl('https://api.test/iam/reset-password/abcdef123456?callbackURL=/x')).toBe(`https://api.test/iam/reset-password/${R}?callbackURL=/x`);
    expect(redactLtUrl('https://user:pass@host.test/path')).toBe(`https://${R}@host.test/path`);
    expect(redactLtText('header Bearer eyX.abc-123_def sent')).toBe(`header Bearer ${R} sent`);
    expect(redactLtText('Bearer token missing')).toBe('Bearer token missing');
    expect(redactLtText('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_nature-1 end')).toBe(`jwt ${R} end`);
  });

  it('redacts JSON pairs and labelled secrets in free text, also cut-off ones', () => {
    expect(redactLtText('{"email":"a@b.de","password":"hunter2","nested":{"newPassword":"x"}}')).toBe(`{"email":"a@b.de","password":"${R}","nested":{"newPassword":"${R}"}}`);
    expect(redactLtText('login failed, password: hunter2, user: max')).toBe(`login failed, password: ${R}, user: max`);
    expect(redactLtText('{"user":"max","token":"abc')).toBe(`{"user":"max","token":"${R}"`);
    expect(redactLtText('status code 500 for /api/users?page=1')).toBe('status code 500 for /api/users?page=1');
  });

  it('redacts bodies: JSON deep (objects and arrays), form-urlencoded and plain text', () => {
    expect(JSON.parse(redactLtBody('{"user":{"password":"a","name":"b"},"items":[{"token":"t"}],"code":"123"}'))).toEqual({
      code: R,
      items: [{ token: R }],
      user: { name: 'b', password: R },
    });
    expect(redactLtBody('email=a%40b.de&password=geheim&user%5Bpassword%5D=x')).toBe(`email=a%40b.de&password=${R}&user%5Bpassword%5D=${R}`);
    expect(redactLtValue(['see /x?token=1'])).toEqual([`see /x?token=${R}`]);
  });

  it('cuts long bodies with a marker', () => {
    expect(redactLtBody('x'.repeat(1500))).toMatch(/^x{1000}\.\.\. \[truncated 500 characters\]$/);
    expect(truncateLt('short', 10)).toBe('short');
  });

  it('knows which keys are secret', () => {
    for (const key of [
      'password',
      'newPassword',
      'current_password',
      'token',
      'accessToken',
      'refresh_token',
      'apiKey',
      'api-key',
      'code',
      'otp',
      'user[password]',
      'clientSecret',
      'twoFactorCode',
    ]) {
      expect(isLtSensitiveKey(key), key).toBe(true);
    }
    for (const key of ['email', 'name', 'postalCode', 'footprint', 'page', 'state', 'description']) {
      expect(isLtSensitiveKey(key), key).toBe(false);
    }
  });

  it('excludes the bodies of IAM, system setup and other auth endpoints', () => {
    for (const url of [
      '/iam/sign-in/email',
      'https://api.test/iam/reset-password',
      '/api/iam/two-factor/verify',
      '/system-setup/init',
      'https://api.test/auth/signin?x=1',
      '/iam',
    ]) {
      expect(isLtBodyExcludedUrl(url), url).toBe(true);
    }
    for (const url of ['/api/users', 'https://api.test/authors', '/iamges/1', '/api/articles?iam=1']) {
      expect(isLtBodyExcludedUrl(url), url).toBe(false);
    }
  });
});
