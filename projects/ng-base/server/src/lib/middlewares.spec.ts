/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  applyLtHtmlCacheHeaders,
  buildLtSecurityHeaders,
  isLtSecureRequest,
  LT_HSTS_VALUE,
  ltBuildIdentity,
  ltSecurityHeaders,
  ltSecurityTxt,
  resolveLtBuildCommit,
  type LtNodeMiddleware,
} from './middlewares';

interface FakeRequest {
  headers?: Record<string, string | string[]>;
  method?: string;
  socket?: { encrypted?: boolean };
  url?: string;
}

/** Minimal `ServerResponse` double that records status, headers and body. */
function fakeResponse(preset: Record<string, string> = {}) {
  const headers = new Map<string, number | string | string[]>(Object.entries(preset).map(([name, value]) => [name.toLowerCase(), value]));
  const state = { body: undefined as string | undefined, ended: false, headers, statusCode: 200 };
  const res = {
    end(chunk?: string) {
      state.ended = true;
      state.body = chunk;
    },
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    hasHeader: (name: string) => headers.has(name.toLowerCase()),
    removeHeader: (name: string) => void headers.delete(name.toLowerCase()),
    setHeader(name: string, value: number | string | string[]) {
      headers.set(name.toLowerCase(), value);
      return res;
    },
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
  };
  return { res: res as unknown as ServerResponse, state };
}

function run(middleware: LtNodeMiddleware, request: FakeRequest = {}, preset: Record<string, string> = {}) {
  const { res, state } = fakeResponse(preset);
  const next = vi.fn<(error?: unknown) => void>();
  const req = { headers: {}, method: 'GET', socket: {}, url: '/', ...request } as unknown as IncomingMessage;
  middleware(req, res, next);
  return { next, state };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('isLtSecureRequest()', () => {
  it('trusts X-Forwarded-Proto first (first value, case-insensitive)', () => {
    expect(isLtSecureRequest({ headers: { 'x-forwarded-proto': 'https' } })).toBe(true);
    expect(isLtSecureRequest({ headers: { 'x-forwarded-proto': 'HTTPS' } })).toBe(true);
    expect(isLtSecureRequest({ headers: { 'x-forwarded-proto': 'https, http' } })).toBe(true);
    expect(isLtSecureRequest({ headers: { 'x-forwarded-proto': ['https', 'http'] } as unknown as IncomingMessage['headers'] })).toBe(true);
    expect(isLtSecureRequest({ headers: { 'x-forwarded-proto': 'http' }, socket: { encrypted: true } })).toBe(false);
  });

  it('falls back to the TLS socket', () => {
    expect(isLtSecureRequest({ headers: {}, socket: { encrypted: true } })).toBe(true);
    expect(isLtSecureRequest({ headers: {}, socket: {} })).toBe(false);
    expect(isLtSecureRequest({ headers: {} })).toBe(false);
  });
});

describe('buildLtSecurityHeaders()', () => {
  const base = {
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Referrer-Policy': 'strict-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-DNS-Prefetch-Control': 'off',
    'X-Frame-Options': 'DENY',
    'X-Permitted-Cross-Domain-Policies': 'none',
  };

  it('returns the documented set without HSTS on plain HTTP', () => {
    expect(buildLtSecurityHeaders({ secure: false })).toEqual(base);
  });

  it('adds HSTS on HTTPS', () => {
    expect(buildLtSecurityHeaders({ secure: true })).toEqual({ ...base, 'Strict-Transport-Security': LT_HSTS_VALUE });
    expect(LT_HSTS_VALUE).toBe('max-age=31536000; includeSubDomains');
  });

  it('sets no Content-Security-Policy (by design, as nuxt-base-starter)', () => {
    for (const secure of [false, true]) {
      expect(Object.keys(buildLtSecurityHeaders({ secure })).map((name) => name.toLowerCase())).not.toContain('content-security-policy');
    }
  });

  it('returns a fresh object each time (the shared set cannot be mutated by a caller)', () => {
    const first = buildLtSecurityHeaders({ secure: false });
    first['X-Frame-Options'] = 'SAMEORIGIN';
    expect(buildLtSecurityHeaders({ secure: false })['X-Frame-Options']).toBe('DENY');
  });
});

describe('ltSecurityHeaders()', () => {
  it('sets the security headers, removes X-Powered-By and calls next()', () => {
    const { next, state } = run(ltSecurityHeaders(), {}, { 'X-Powered-By': 'Express' });
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect(state.headers.has('x-powered-by')).toBe(false);
    expect(Object.fromEntries(state.headers)).toEqual({
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'referrer-policy': 'strict-origin',
      'x-content-type-options': 'nosniff',
      'x-dns-prefetch-control': 'off',
      'x-frame-options': 'DENY',
      'x-permitted-cross-domain-policies': 'none',
    });
    expect(state.ended).toBe(false);
  });

  it('sets HSTS only on HTTPS requests', () => {
    expect(run(ltSecurityHeaders(), { headers: { 'x-forwarded-proto': 'https' } }).state.headers.get('strict-transport-security')).toBe(LT_HSTS_VALUE);
    expect(run(ltSecurityHeaders(), { socket: { encrypted: true } }).state.headers.get('strict-transport-security')).toBe(LT_HSTS_VALUE);
    expect(run(ltSecurityHeaders(), { headers: { 'x-forwarded-proto': 'http' } }).state.headers.has('strict-transport-security')).toBe(false);
    expect(run(ltSecurityHeaders()).state.headers.has('strict-transport-security')).toBe(false);
  });

  it('never sets a Content-Security-Policy', () => {
    expect(run(ltSecurityHeaders(), { headers: { 'x-forwarded-proto': 'https' } }).state.headers.has('content-security-policy')).toBe(false);
  });

  it('never overwrites a header that is already set', () => {
    const { state } = run(ltSecurityHeaders(), { headers: { 'x-forwarded-proto': 'https' } }, { 'Strict-Transport-Security': 'max-age=60', 'X-Frame-Options': 'SAMEORIGIN' });
    expect(state.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(state.headers.get('strict-transport-security')).toBe('max-age=60');
    expect(state.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('applyLtHtmlCacheHeaders()', () => {
  it('sets private, no-cache and Vary: Cookie on HTML without Cache-Control', () => {
    const response = new Response('<html></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    expect(applyLtHtmlCacheHeaders(response)).toBe(true);
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    expect(response.headers.get('vary')).toBe('Cookie');
  });

  it('appends Cookie to an existing Vary', () => {
    const response = new Response('<html></html>', { headers: { 'content-type': 'text/html', vary: 'Accept-Encoding' } });
    expect(applyLtHtmlCacheHeaders(response)).toBe(true);
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Cookie');
  });

  it('keeps an own Cache-Control untouched', () => {
    const response = new Response('<html></html>', { headers: { 'cache-control': 'public, max-age=60', 'content-type': 'text/html' } });
    expect(applyLtHtmlCacheHeaders(response)).toBe(false);
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(response.headers.get('vary')).toBeNull();
  });

  it('ignores non-HTML responses', () => {
    const json = new Response('{}', { headers: { 'content-type': 'application/json' } });
    expect(applyLtHtmlCacheHeaders(json)).toBe(false);
    expect(json.headers.get('cache-control')).toBeNull();
    expect(json.headers.get('vary')).toBeNull();
  });
});

describe('resolveLtBuildCommit()', () => {
  it('uses NG_PUBLIC_APP_COMMIT, then APP_VERSION_COMMIT, then "unknown"', () => {
    expect(resolveLtBuildCommit({ APP_VERSION_COMMIT: 'turbo', NG_PUBLIC_APP_COMMIT: 'public' })).toBe('public');
    expect(resolveLtBuildCommit({ APP_VERSION_COMMIT: 'turbo' })).toBe('turbo');
    expect(resolveLtBuildCommit({})).toBe('unknown');
  });

  it('skips blank values and the placeholder "unknown"', () => {
    expect(resolveLtBuildCommit({ APP_VERSION_COMMIT: 'turbo', NG_PUBLIC_APP_COMMIT: '  ' })).toBe('turbo');
    expect(resolveLtBuildCommit({ APP_VERSION_COMMIT: 'turbo', NG_PUBLIC_APP_COMMIT: 'unknown' })).toBe('turbo');
    expect(resolveLtBuildCommit({ APP_VERSION_COMMIT: '', NG_PUBLIC_APP_COMMIT: 'unknown' })).toBe('unknown');
  });

  it('reads process.env by default', () => {
    vi.stubEnv('NG_PUBLIC_APP_COMMIT', 'from-process');
    expect(resolveLtBuildCommit()).toBe('from-process');
  });
});

describe('ltBuildIdentity()', () => {
  it('answers GET /api/build-identity with { commit, version } as JSON, no-store', () => {
    const { next, state } = run(ltBuildIdentity({ env: { APP_VERSION_COMMIT: 'abc1234', NG_PUBLIC_APP_VERSION: '1.2.3' } }), { url: '/api/build-identity' });
    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(200);
    expect(state.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(state.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(state.body ?? '')).toEqual({ commit: 'abc1234', version: '1.2.3' });
  });

  it('ignores the query string', () => {
    const { state } = run(ltBuildIdentity({ env: {} }), { url: '/api/build-identity?ts=1' });
    expect(JSON.parse(state.body ?? '')).toEqual({ commit: 'unknown', version: '0.0.0' });
  });

  it('prefers options.version over NG_PUBLIC_APP_VERSION and defaults to 0.0.0', () => {
    expect(JSON.parse(run(ltBuildIdentity({ env: { NG_PUBLIC_APP_VERSION: '1.0.0' }, version: '2.0.0' }), { url: '/api/build-identity' }).state.body ?? '')).toEqual({
      commit: 'unknown',
      version: '2.0.0',
    });
    expect(JSON.parse(run(ltBuildIdentity({ env: {} }), { url: '/api/build-identity' }).state.body ?? '')['version']).toBe('0.0.0');
  });

  it('serves a custom path', () => {
    const middleware = ltBuildIdentity({ env: {}, path: '/_build' });
    expect(run(middleware, { url: '/_build' }).state.ended).toBe(true);
    expect(run(middleware, { url: '/api/build-identity' }).next).toHaveBeenCalledOnce();
  });

  it('calls next() for other paths and methods', () => {
    const middleware = ltBuildIdentity({ env: {} });
    for (const request of [
      { url: '/' },
      { url: '/api/build-identity/x' },
      { url: '/api/build-identityx' },
      { method: 'POST', url: '/api/build-identity' },
      { method: 'HEAD', url: '/api/build-identity' },
    ]) {
      const { next, state } = run(middleware, request);
      expect(next).toHaveBeenCalledOnce();
      expect(state.ended).toBe(false);
    }
  });

  it('reads process.env per request by default', () => {
    const middleware = ltBuildIdentity();
    vi.stubEnv('NG_PUBLIC_APP_COMMIT', 'first');
    expect(JSON.parse(run(middleware, { url: '/api/build-identity' }).state.body ?? '')['commit']).toBe('first');
    vi.stubEnv('NG_PUBLIC_APP_COMMIT', 'second');
    expect(JSON.parse(run(middleware, { url: '/api/build-identity' }).state.body ?? '')['commit']).toBe('second');
  });
});

describe('ltSecurityTxt()', () => {
  const NOW = new Date('2026-11-06T19:10:00.000Z');
  const PATH = '/.well-known/security.txt';

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });

  it('serves the default file: default contact, Expires 180 days ahead at midnight UTC, de/en, Canonical from NG_PUBLIC_SITE_URL', () => {
    const { next, state } = run(ltSecurityTxt({ env: { NG_PUBLIC_SITE_URL: 'https://app.example.com/start' } }), { url: PATH });
    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(200);
    expect(state.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(state.headers.get('cache-control')).toBe('no-store');
    expect(state.body).toBe(
      [
        'Contact: mailto:security@lenne.tech',
        'Expires: 2027-05-05T00:00:00.000Z',
        'Preferred-Languages: de, en',
        'Canonical: https://app.example.com/.well-known/security.txt',
        '',
      ].join('\n'),
    );
  });

  it('answers HEAD without a body', () => {
    const { state } = run(ltSecurityTxt({ env: {} }), { method: 'HEAD', url: PATH });
    expect(state.statusCode).toBe(200);
    expect(state.ended).toBe(true);
    expect(state.body).toBeUndefined();
  });

  it('ignores the query string', () => {
    expect(run(ltSecurityTxt({ env: {} }), { url: `${PATH}?x=1` }).state.statusCode).toBe(200);
  });

  it('calls next() for other paths and methods', () => {
    const middleware = ltSecurityTxt({ env: {} });
    for (const request of [{ url: '/' }, { url: '/security.txt' }, { url: `${PATH}/x` }, { method: 'POST', url: PATH }, { method: 'PUT', url: PATH }]) {
      const { next, state } = run(middleware, request);
      expect(next).toHaveBeenCalledOnce();
      expect(state.ended).toBe(false);
    }
  });

  it('uses the options', () => {
    const { state } = run(
      ltSecurityTxt({
        contact: ['mailto:security@customer.example', 'https://customer.example/security'],
        env: {},
        policy: '/disclosure',
        preferredLanguages: ['en'],
        siteUrl: 'https://customer.example',
        validDays: 30,
      }),
      { url: PATH },
    );
    expect(state.body).toBe(
      [
        'Contact: mailto:security@customer.example',
        'Contact: https://customer.example/security',
        'Expires: 2026-12-06T00:00:00.000Z',
        'Policy: https://customer.example/disclosure',
        'Preferred-Languages: en',
        'Canonical: https://customer.example/.well-known/security.txt',
        '',
      ].join('\n'),
    );
  });

  it('lets NG_LT_SECURITY_TXT_* override the options per stage', () => {
    const { state } = run(
      ltSecurityTxt({
        contact: 'mailto:options@customer.example',
        env: {
          NG_LT_SECURITY_TXT_CONTACT: 'mailto:env@customer.example',
          NG_LT_SECURITY_TXT_HOSTS: 'www.customer.example, alt.customer.example',
          NG_LT_SECURITY_TXT_POLICY: 'https://customer.example/policy',
          NG_LT_SECURITY_TXT_PREFERRED_LANGUAGES: 'fr, de',
          NG_LT_SECURITY_TXT_VALID_DAYS: '30',
          NG_PUBLIC_SITE_URL: 'https://customer.example',
        },
        hosts: ['ignored.example'],
        policy: '/ignored',
        preferredLanguages: ['en'],
        validDays: 90,
      }),
      { headers: { host: 'alt.customer.example' }, url: PATH },
    );
    expect(state.body).toBe(
      [
        'Contact: mailto:env@customer.example',
        'Expires: 2026-12-06T00:00:00.000Z',
        'Policy: https://customer.example/policy',
        'Preferred-Languages: fr, de',
        'Canonical: https://customer.example/.well-known/security.txt',
        'Canonical: https://alt.customer.example/.well-known/security.txt',
        '',
      ].join('\n'),
    );
  });

  it('ignores empty env overrides', () => {
    const { state } = run(ltSecurityTxt({ contact: 'mailto:options@customer.example', env: { NG_LT_SECURITY_TXT_CONTACT: '', NG_LT_SECURITY_TXT_VALID_DAYS: '' } }), { url: PATH });
    expect(state.body).toContain('Contact: mailto:options@customer.example\n');
    expect(state.body).toContain('Expires: 2027-05-05T00:00:00.000Z\n');
  });

  it('reads several comma-separated contacts from NG_LT_SECURITY_TXT_CONTACT', () => {
    for (const value of ['mailto:a@customer.example,https://customer.example/security', 'mailto:a@customer.example, https://customer.example/security']) {
      const { state } = run(ltSecurityTxt({ env: { NG_LT_SECURITY_TXT_CONTACT: value } }), { url: PATH });
      expect(state.body).toContain('Contact: mailto:a@customer.example\nContact: https://customer.example/security\n');
    }
  });

  it('adds the requested host as second Canonical only when it is an allowed host (X-Forwarded-Host first)', () => {
    const middleware = ltSecurityTxt({ env: {}, hosts: ['www.customer.example'], siteUrl: 'https://customer.example' });
    const canonicals = (headers: Record<string, string>) => (run(middleware, { headers, url: PATH }).state.body ?? '').split('\n').filter((line) => line.startsWith('Canonical:'));
    expect(canonicals({ host: 'WWW.customer.example' })).toEqual([
      'Canonical: https://customer.example/.well-known/security.txt',
      'Canonical: https://www.customer.example/.well-known/security.txt',
    ]);
    expect(canonicals({ host: 'internal:4000', 'x-forwarded-host': 'www.customer.example, proxy.internal' })).toHaveLength(2);
    expect(canonicals({ host: 'evil.example' })).toEqual(['Canonical: https://customer.example/.well-known/security.txt']);
    expect(canonicals({ host: 'www.customer.example', 'x-forwarded-host': 'evil.example' })).toEqual(['Canonical: https://customer.example/.well-known/security.txt']);
  });

  it('never writes an unlisted request host into the file', () => {
    const { state } = run(ltSecurityTxt({ env: {} }), { headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' }, url: PATH });
    expect(state.body).not.toContain('evil.example');
  });

  it('answers 404 when no valid contact is configured', () => {
    for (const contact of ['security@customer.example', 'http://customer.example/security', '']) {
      const { next, state } = run(ltSecurityTxt({ contact: contact || [], env: {} }), { url: PATH });
      expect(next).not.toHaveBeenCalled();
      expect(state.statusCode).toBe(404);
      expect(state.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(state.body).toBe('Not Found');
    }
    expect(run(ltSecurityTxt({ env: { NG_LT_SECURITY_TXT_CONTACT: 'security@customer.example' } }), { url: PATH }).state.statusCode).toBe(404);
  });

  it('drops values that would forge an additional field', () => {
    const { state } = run(
      ltSecurityTxt({
        contact: ['mailto:ok@customer.example', 'mailto:x@customer.example\nPolicy: https://evil.example'],
        env: { NG_LT_SECURITY_TXT_POLICY: 'https://customer.example/policy\nContact: mailto:evil@evil.example' },
        preferredLanguages: ['de', 'en\nContact: mailto:evil@evil.example'],
      }),
      { url: PATH },
    );
    expect(state.body).not.toContain('evil');
    expect(state.body).toContain('Contact: mailto:ok@customer.example\n');
    expect(state.body).toContain('Preferred-Languages: de\n');
    expect(state.body).not.toContain('Policy:');
  });

  it('builds Expires per request, so it never goes stale', () => {
    const middleware = ltSecurityTxt({ env: {} });
    expect(run(middleware, { url: PATH }).state.body).toContain('Expires: 2027-05-05T00:00:00.000Z');
    vi.setSystemTime(new Date('2027-03-01T08:00:00.000Z'));
    expect(run(middleware, { url: PATH }).state.body).toContain('Expires: 2027-08-28T00:00:00.000Z');
  });

  it('reads process.env by default', () => {
    vi.stubEnv('NG_LT_SECURITY_TXT_CONTACT', 'mailto:process@customer.example');
    vi.stubEnv('NG_PUBLIC_SITE_URL', 'https://process.example');
    const { state } = run(ltSecurityTxt(), { url: PATH });
    expect(state.body).toContain('Contact: mailto:process@customer.example\n');
    expect(state.body).toContain('Canonical: https://process.example/.well-known/security.txt\n');
  });
});
