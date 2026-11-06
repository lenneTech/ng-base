import { isLtApiRequest, isLtAuthEndpoint, ltPathOf, ltRequestUrl, ltUrlRequiresCookies } from './auth-urls';

describe('isLtApiRequest', () => {
  it('matches the API base URL at a path boundary only', () => {
    expect(isLtApiRequest('https://api.example.com/iam/get-session', 'https://api.example.com')).toBe(true);
    expect(isLtApiRequest('https://api.example.com?x=1', 'https://api.example.com')).toBe(true);
    expect(isLtApiRequest('https://api.example.com', 'https://api.example.com')).toBe(true);
    // A look-alike host must never receive the token
    expect(isLtApiRequest('https://api.example.com.evil.test/steal', 'https://api.example.com')).toBe(false);
    expect(isLtApiRequest('https://other.example.com/x', 'https://api.example.com')).toBe(false);
  });

  it('matches the dev proxy prefix, relative or on the app origin', () => {
    expect(isLtApiRequest('/api/iam/sign-in/email', '/api')).toBe(true);
    expect(isLtApiRequest('http://localhost:3001/api/iam/token', '/api', 'http://localhost:3001')).toBe(true);
    expect(isLtApiRequest('/apis/other', '/api')).toBe(false);
    expect(isLtApiRequest('/assets/i18n.json', 'https://api.example.com')).toBe(false);
  });

  it('treats same-origin URLs as API requests when no API URL is configured (same-origin reverse proxy)', () => {
    expect(isLtApiRequest('/iam/get-session', '')).toBe(true);
    expect(isLtApiRequest('http://localhost:3000/iam/get-session', '', 'http://localhost:3000')).toBe(true);
    expect(isLtApiRequest('https://foreign.example.com/x', '', 'http://localhost:3000')).toBe(false);
    expect(isLtApiRequest('//foreign.example.com/x', '')).toBe(false);
  });
});

describe('auth URL predicates', () => {
  it('recognises auth-flow endpoints (their 401 is never session loss)', () => {
    expect(isLtAuthEndpoint('https://api.example.com/iam/sign-in/email')).toBe(true);
    expect(isLtAuthEndpoint('https://api.example.com/iam/get-session')).toBe(true);
    expect(isLtAuthEndpoint('https://api.example.com/iam/two-factor/verify-totp')).toBe(true);
    expect(isLtAuthEndpoint('https://api.example.com/measures')).toBe(false);
  });

  it('keeps cookies for passkey, 2FA and get-session even in JWT mode', () => {
    expect(ltUrlRequiresCookies('/iam/passkey/generate-authenticate-options')).toBe(true);
    expect(ltUrlRequiresCookies('/iam/two-factor/verify-totp')).toBe(true);
    expect(ltUrlRequiresCookies('/iam/get-session')).toBe(true);
    expect(ltUrlRequiresCookies('/measures')).toBe(false);
  });

  it('extracts URL strings and paths', () => {
    expect(ltRequestUrl('https://a.test/x')).toBe('https://a.test/x');
    expect(ltRequestUrl(new URL('https://a.test/y?z=1'))).toBe('https://a.test/y?z=1');
    expect(ltRequestUrl(new Request('https://a.test/r'))).toBe('https://a.test/r');
    expect(ltPathOf('/app/board?tab=1#top')).toBe('/app/board');
  });
});
