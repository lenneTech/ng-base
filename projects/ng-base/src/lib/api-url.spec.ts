import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LtApiUrlService, resolveLtApiBaseUrl } from './api-url';
import { LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, LT_SERVER_RUNTIME_CONFIG, mergeLtRuntimeConfig } from './runtime-config';
import { resetLtWarnOnceState } from './warn-once';

describe('resolveLtApiBaseUrl', () => {
  it('prefers NG_API_URL on the server and never uses the proxy there', () => {
    expect(resolveLtApiBaseUrl({ apiProxy: true, apiUrl: 'https://api.example.com/', devMode: true, scope: 'server', serverApiUrl: 'http://api:3000/' })).toEqual({
      baseUrl: 'http://api:3000',
      missing: false,
      proxy: false,
      scope: 'server',
    });
  });

  it('falls back to the public URL on the server', () => {
    expect(resolveLtApiBaseUrl({ apiProxy: null, apiUrl: 'https://api.example.com', devMode: false, scope: 'server' }).baseUrl).toBe('https://api.example.com');
  });

  it('uses /api in the browser when the proxy is on, or unset in dev mode', () => {
    expect(resolveLtApiBaseUrl({ apiProxy: true, apiUrl: 'https://api.example.com', devMode: false, scope: 'browser' }).baseUrl).toBe('/api');
    expect(resolveLtApiBaseUrl({ apiProxy: null, apiUrl: 'https://api.example.com', devMode: true, scope: 'browser' }).proxy).toBe(true);
    expect(resolveLtApiBaseUrl({ apiProxy: false, apiUrl: 'https://api.example.com', devMode: true, scope: 'browser' }).baseUrl).toBe('https://api.example.com');
  });

  it('reports a missing URL', () => {
    expect(resolveLtApiBaseUrl({ apiProxy: false, apiUrl: '', devMode: false, scope: 'browser' })).toMatchObject({ baseUrl: '', missing: true });
  });
});

describe('LtApiUrlService', () => {
  beforeEach(() => resetLtWarnOnceState());

  function setup(runtime: Partial<typeof LT_RUNTIME_CONFIG_DEFAULTS>, platform: 'browser' | 'server' = 'browser', serverApiUrl?: string) {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, runtime) },
        ...(serverApiUrl ? [{ provide: LT_SERVER_RUNTIME_CONFIG, useValue: { public: {}, serverApiUrl } }] : []),
      ],
    });
    return TestBed.inject(LtApiUrlService);
  }

  it('builds URLs against the public API URL', () => {
    expect(setup({ apiProxy: false, apiUrl: 'https://api.example.com/' }).buildUrl('/iam/features')).toBe('https://api.example.com/iam/features');
  });

  it('adds a missing leading slash and keeps absolute URLs', () => {
    const service = setup({ apiProxy: false, apiUrl: 'https://api.example.com' });
    expect(service.buildUrl('iam/features')).toBe('https://api.example.com/iam/features');
    expect(service.buildUrl('https://other.example.com/x')).toBe('https://other.example.com/x');
  });

  it('uses NG_API_URL on the server', () => {
    expect(setup({ apiUrl: 'https://api.example.com' }, 'server', 'http://api:3000').buildUrl('/meta')).toBe('http://api:3000/meta');
  });

  it('warns once about a missing URL', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = setup({ apiProxy: false, apiUrl: '' });
    service.buildUrl('/a');
    service.buildUrl('/b');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
