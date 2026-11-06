import { PLATFORM_ID, REQUEST_CONTEXT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';

import { LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT } from './pre-hydration-input';
import { provideLtNgBase } from './provide-lt-ng-base';
import {
  injectLtRuntimeConfigScript,
  LT_RUNTIME_CONFIG,
  LT_RUNTIME_CONFIG_DEFAULTS,
  LT_RUNTIME_CONFIG_SCRIPT_ID,
  mergeLtFeatureOptions,
  mergeLtRuntimeConfig,
  readLtRuntimeConfigFromDocument,
  serializeLtRuntimeConfig,
} from './runtime-config';

describe('runtime config script', () => {
  it('escapes characters that could break out of the script element', () => {
    const serialized = serializeLtRuntimeConfig({ siteUrl: '</script><!-- &  ' });
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('>');
    expect(serialized).not.toContain('&');
    expect(JSON.parse(serialized)).toEqual({ siteUrl: '</script><!-- &  ' });
  });

  it('injects the script as first child of <head> and leaves documents without head untouched', () => {
    const html = injectLtRuntimeConfigScript('<html><head lang="de"><title>x</title></head></html>', { apiUrl: 'https://api.example.com' });
    expect(html).toContain(`<head lang="de"><script>${LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT}</script><script id="${LT_RUNTIME_CONFIG_SCRIPT_ID}" type="application/json">`);
    const withoutGuard = injectLtRuntimeConfigScript('<html><head><title>x</title></head></html>', { apiUrl: 'x' }, { submitGuard: false });
    expect(withoutGuard).toContain(`<head><script id="${LT_RUNTIME_CONFIG_SCRIPT_ID}"`);
    expect(withoutGuard).not.toContain(LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT);
    expect(injectLtRuntimeConfigScript('<p>fragment</p>', { apiUrl: 'x' })).toBe('<p>fragment</p>');
  });

  it('reads the script back from a document and ignores broken content', () => {
    document.head.innerHTML = `<script id="${LT_RUNTIME_CONFIG_SCRIPT_ID}" type="application/json">${serializeLtRuntimeConfig({ apiUrl: 'https://api.example.com' })}</script>`;
    expect(readLtRuntimeConfigFromDocument(document)).toEqual({ apiUrl: 'https://api.example.com' });
    document.head.innerHTML = `<script id="${LT_RUNTIME_CONFIG_SCRIPT_ID}" type="application/json">{broken</script>`;
    expect(readLtRuntimeConfigFromDocument(document)).toBeNull();
    document.head.innerHTML = '';
    expect(readLtRuntimeConfigFromDocument(document)).toBeNull();
  });
});

describe('merging', () => {
  it('never lets undefined override and merges lt per feature', () => {
    const merged = mergeLtRuntimeConfig(
      LT_RUNTIME_CONFIG_DEFAULTS,
      { apiUrl: 'a', lt: { tus: { defaultEndpoint: '/tus' } } },
      { apiUrl: undefined, lt: { tus: { defaultChunkSize: 1 } } },
    );
    expect(merged.apiUrl).toBe('a');
    expect(merged.lt['tus']).toEqual({ defaultChunkSize: 1, defaultEndpoint: '/tus' });
  });

  it('merges nested feature options one level deep', () => {
    expect(
      mergeLtFeatureOptions({ interceptor: { enabled: true, publicPaths: [] as string[] }, loginPath: '/a' }, { interceptor: { publicPaths: ['/x'] } }, { loginPath: undefined }),
    ).toEqual({
      interceptor: { enabled: true, publicPaths: ['/x'] },
      loginPath: '/a',
    });
  });
});

describe('provideLtNgBase runtime config', () => {
  afterEach(() => (document.head.innerHTML = ''));

  it('uses the request context on the server', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: REQUEST_CONTEXT, useValue: { runtimeConfig: { apiUrl: 'https://api.example.com' }, serverApiUrl: 'http://api:3000' } },
        provideLtNgBase({ configCheck: false, errorTranslation: { enabled: false }, runtime: { siteUrl: 'https://app.example.com' } }),
      ],
    });
    expect(TestBed.inject(LT_RUNTIME_CONFIG)).toMatchObject({ apiUrl: 'https://api.example.com', siteUrl: 'https://app.example.com' });
  });

  it('reads the document script in the browser, over the code defaults', () => {
    document.head.innerHTML = `<script id="${LT_RUNTIME_CONFIG_SCRIPT_ID}" type="application/json">${serializeLtRuntimeConfig({ apiUrl: 'https://api.stage.example.com' })}</script>`;
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideLtNgBase({ configCheck: false, errorTranslation: { enabled: false }, runtime: { apiUrl: 'http://localhost:3000' } }),
      ],
    });
    expect(TestBed.inject(DOCUMENT)).toBe(document);
    expect(TestBed.inject(LT_RUNTIME_CONFIG).apiUrl).toBe('https://api.stage.example.com');
  });
});
