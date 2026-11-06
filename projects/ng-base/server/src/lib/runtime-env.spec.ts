import { TestBed } from '@angular/core/testing';
import { LT_RUNTIME_CONFIG_DEFAULTS, LT_SERVER_RUNTIME_CONFIG, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';

import { LT_RUNTIME_FEATURE_KEYS, parseLtEnvValue, provideLtServerRuntimeConfig, readLtRequestContext, readLtRuntimeConfigFromEnv, toLtEnvKey } from './runtime-env';

afterEach(() => {
  vi.unstubAllEnvs();
  TestBed.resetTestingModule();
});

describe('toLtEnvKey()', () => {
  it('turns camelCase into SCREAMING_SNAKE', () => {
    expect(toLtEnvKey('loginPath')).toBe('LOGIN_PATH');
    expect(toLtEnvKey('twoFactorRedirectPath')).toBe('TWO_FACTOR_REDIRECT_PATH');
    expect(toLtEnvKey('errorTranslation')).toBe('ERROR_TRANSLATION');
    expect(toLtEnvKey('autoOpenOnError')).toBe('AUTO_OPEN_ON_ERROR');
    expect(toLtEnvKey('ai')).toBe('AI');
    expect(toLtEnvKey('oauth2Path')).toBe('OAUTH2_PATH');
  });
});

describe('parseLtEnvValue()', () => {
  it('returns undefined for an unset value of every type', () => {
    for (const type of ['array', 'boolean', 'number', 'string'] as const) {
      expect(parseLtEnvValue(undefined, type)).toBeUndefined();
    }
  });

  it('parses booleans case-insensitively (true/1/yes/on, false/0/no/off), anything else is undefined', () => {
    for (const raw of ['true', 'TRUE', '1', 'yes', 'Yes', 'on', 'ON']) {
      expect(parseLtEnvValue(raw, 'boolean')).toBe(true);
    }
    for (const raw of ['false', 'False', '0', 'no', 'NO', 'off', 'Off']) {
      expect(parseLtEnvValue(raw, 'boolean')).toBe(false);
    }
    for (const raw of ['maybe', '', 'truee', ' true', '2', 'y']) {
      expect(parseLtEnvValue(raw, 'boolean')).toBeUndefined();
    }
  });

  it('parses finite numbers, unparsable or infinite values are undefined', () => {
    expect(parseLtEnvValue('42', 'number')).toBe(42);
    expect(parseLtEnvValue('1.5', 'number')).toBe(1.5);
    expect(parseLtEnvValue('-3', 'number')).toBe(-3);
    expect(parseLtEnvValue('5242880', 'number')).toBe(5242880);
    expect(parseLtEnvValue('abc', 'number')).toBeUndefined();
    expect(parseLtEnvValue('12px', 'number')).toBeUndefined();
    expect(parseLtEnvValue('Infinity', 'number')).toBeUndefined();
    expect(parseLtEnvValue('NaN', 'number')).toBeUndefined();
  });

  it('treats a blank number value as unparsable (undefined), not as 0', () => {
    expect(parseLtEnvValue('', 'number')).toBeUndefined();
    expect(parseLtEnvValue('  ', 'number')).toBeUndefined();
    expect(parseLtEnvValue('0', 'number')).toBe(0);
  });

  it('splits arrays at commas, trims the parts and drops empty ones', () => {
    expect(parseLtEnvValue('/a, /b ,,/c ', 'array')).toEqual(['/a', '/b', '/c']);
    expect(parseLtEnvValue('/single', 'array')).toEqual(['/single']);
    expect(parseLtEnvValue(' , ', 'array')).toEqual([]);
  });

  it('returns strings unchanged', () => {
    expect(parseLtEnvValue('/anmelden', 'string')).toBe('/anmelden');
    expect(parseLtEnvValue('a, b', 'string')).toBe('a, b');
  });
});

describe('LT_RUNTIME_FEATURE_KEYS', () => {
  it('lists the runtime-overridable options per feature with their types', () => {
    expect(LT_RUNTIME_FEATURE_KEYS).toEqual({
      ai: { basePath: 'string' },
      auth: { basePath: 'string', enablePasskey: 'boolean', enableTwoFactor: 'boolean', loginPath: 'string', twoFactorRedirectPath: 'string' },
      bug: {
        autoOpenOnError: 'boolean',
        autoShow: 'boolean',
        buttonColor: 'string',
        buttonText: 'string',
        enableScreenshot: 'boolean',
        enabled: 'boolean',
        position: 'string',
      },
      errorTranslation: { defaultLocale: 'string', enabled: 'boolean', preload: 'boolean' },
      sync: { basePath: 'string' },
      tus: { defaultChunkSize: 'number', defaultEndpoint: 'string', resolveAgainstApi: 'boolean' },
    });
  });

  it('maps every env name to exactly one option', () => {
    const names = Object.entries(LT_RUNTIME_FEATURE_KEYS).flatMap(([feature, keys]) => Object.keys(keys).map((key) => `NG_PUBLIC_LT_${toLtEnvKey(feature)}_${toLtEnvKey(key)}`));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'NG_PUBLIC_LT_BUG_ENABLED',
        'NG_PUBLIC_LT_BUG_AUTO_SHOW',
        'NG_PUBLIC_LT_BUG_AUTO_OPEN_ON_ERROR',
        'NG_PUBLIC_LT_BUG_ENABLE_SCREENSHOT',
        'NG_PUBLIC_LT_BUG_POSITION',
        'NG_PUBLIC_LT_BUG_BUTTON_COLOR',
        'NG_PUBLIC_LT_BUG_BUTTON_TEXT',
        'NG_PUBLIC_LT_TUS_DEFAULT_ENDPOINT',
        'NG_PUBLIC_LT_AUTH_LOGIN_PATH',
      ]),
    );
  });
});

describe('readLtRuntimeConfigFromEnv()', () => {
  it('maps every documented variable to its target', () => {
    const config = readLtRuntimeConfigFromEnv({
      NG_API_URL: 'http://api.internal:3000',
      NG_PUBLIC_API_PROXY: 'true',
      NG_PUBLIC_API_URL: 'https://api.example.com',
      NG_PUBLIC_APP_COMMIT: 'abc1234',
      NG_PUBLIC_APP_ENV: 'develop',
      NG_PUBLIC_APP_VERSION: '1.2.3',
      NG_PUBLIC_COOKIE_PREFIX: 'shop',
      NG_PUBLIC_SITE_URL: 'https://app.example.com',
      NG_PUBLIC_STORAGE_PREFIX: 'shop-',
    });
    expect(config).toEqual({
      public: {
        apiProxy: true,
        apiUrl: 'https://api.example.com',
        appCommit: 'abc1234',
        appEnv: 'develop',
        appVersion: '1.2.3',
        cookiePrefix: 'shop',
        lt: {},
        siteUrl: 'https://app.example.com',
        storagePrefix: 'shop-',
      },
      serverApiUrl: 'http://api.internal:3000',
    });
  });

  it('keeps NG_API_URL server-only: never part of the public config', () => {
    const config = readLtRuntimeConfigFromEnv({ NG_API_URL: 'http://api.internal:3000', NG_PUBLIC_API_URL: 'https://api.example.com' });
    expect(config.serverApiUrl).toBe('http://api.internal:3000');
    expect(JSON.stringify(config.public)).not.toContain('api.internal');
    expect(Object.keys(config.public)).not.toContain('serverApiUrl');
  });

  it('leaves unset and blank variables undefined, so the code defaults keep applying', () => {
    const config = readLtRuntimeConfigFromEnv({ NG_API_URL: '  ', NG_PUBLIC_API_URL: '', NG_PUBLIC_COOKIE_PREFIX: '   ', NG_PUBLIC_SITE_URL: '\t' });
    expect(config.public.apiUrl).toBeUndefined();
    expect(config.public.siteUrl).toBeUndefined();
    expect(config.public.cookiePrefix).toBeUndefined();
    expect(config.public.storagePrefix).toBeUndefined();
    expect(config.public.appEnv).toBeUndefined();
    expect(config.public.appVersion).toBeUndefined();
    expect(config.public.apiProxy).toBeUndefined();
    expect(config.public.lt).toEqual({});
    expect(config.serverApiUrl).toBe('');
  });

  it('trims the values', () => {
    const config = readLtRuntimeConfigFromEnv({ NG_PUBLIC_API_URL: '  https://api.example.com  ', NG_PUBLIC_LT_AUTH_LOGIN_PATH: ' /anmelden ' });
    expect(config.public.apiUrl).toBe('https://api.example.com');
    expect(config.public.lt?.auth).toEqual({ loginPath: '/anmelden' });
  });

  it('NG_PUBLIC_API_PROXY: true/false, unset stays undefined and resolves to the null default after merging', () => {
    expect(readLtRuntimeConfigFromEnv({ NG_PUBLIC_API_PROXY: 'false' }).public.apiProxy).toBe(false);
    expect(readLtRuntimeConfigFromEnv({ NG_PUBLIC_API_PROXY: 'on' }).public.apiProxy).toBe(true);
    expect(readLtRuntimeConfigFromEnv({ NG_PUBLIC_API_PROXY: 'maybe' }).public.apiProxy).toBeUndefined();
    const unset = readLtRuntimeConfigFromEnv({});
    expect(unset.public.apiProxy).toBeUndefined();
    expect(mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, unset.public).apiProxy).toBeNull();
  });

  describe('appCommit', () => {
    it('uses NG_PUBLIC_APP_COMMIT first', () => {
      expect(readLtRuntimeConfigFromEnv({ APP_VERSION_COMMIT: 'turbo', NG_PUBLIC_APP_COMMIT: 'public' }).public.appCommit).toBe('public');
    });

    it('falls back to APP_VERSION_COMMIT', () => {
      expect(readLtRuntimeConfigFromEnv({ APP_VERSION_COMMIT: 'turbo' }).public.appCommit).toBe('turbo');
      expect(readLtRuntimeConfigFromEnv({ APP_VERSION_COMMIT: 'turbo', NG_PUBLIC_APP_COMMIT: ' ' }).public.appCommit).toBe('turbo');
    });

    it('skips the placeholder "unknown" in favour of the fallback', () => {
      expect(readLtRuntimeConfigFromEnv({ APP_VERSION_COMMIT: 'turbo', NG_PUBLIC_APP_COMMIT: 'unknown' }).public.appCommit).toBe('turbo');
    });

    it('is "unknown" when nothing usable is set', () => {
      expect(readLtRuntimeConfigFromEnv({}).public.appCommit).toBe('unknown');
      expect(readLtRuntimeConfigFromEnv({ APP_VERSION_COMMIT: 'unknown', NG_PUBLIC_APP_COMMIT: 'unknown' }).public.appCommit).toBe('unknown');
    });
  });

  it('appVersion: options.appVersion overrides NG_PUBLIC_APP_VERSION', () => {
    expect(readLtRuntimeConfigFromEnv({ NG_PUBLIC_APP_VERSION: '1.0.0' }, { appVersion: '2.0.0' }).public.appVersion).toBe('2.0.0');
    expect(readLtRuntimeConfigFromEnv({}, { appVersion: '2.0.0' }).public.appVersion).toBe('2.0.0');
    expect(readLtRuntimeConfigFromEnv({ NG_PUBLIC_APP_VERSION: '1.0.0' }).public.appVersion).toBe('1.0.0');
  });

  it('extend: adds project values to the public config and receives the same env', () => {
    const env = { NG_PUBLIC_PLAUSIBLE_API_HOST: 'https://plausible.example.com' };
    const extend = vi.fn((source: Record<string, string | undefined>) => ({ plausibleApiHost: source['NG_PUBLIC_PLAUSIBLE_API_HOST'] }));
    const config = readLtRuntimeConfigFromEnv(env, { extend });
    expect(extend).toHaveBeenCalledWith(env);
    expect(config.public['plausibleApiHost']).toBe('https://plausible.example.com');
  });

  it('reads process.env by default', () => {
    vi.stubEnv('NG_PUBLIC_SITE_URL', 'https://from-process.example.com');
    vi.stubEnv('NG_API_URL', 'http://process-api.internal:3000');
    const config = readLtRuntimeConfigFromEnv();
    expect(config.public.siteUrl).toBe('https://from-process.example.com');
    expect(config.serverApiUrl).toBe('http://process-api.internal:3000');
  });

  describe('feature options (NG_PUBLIC_LT_<FEATURE>_<OPTION>)', () => {
    it('reads the bug reporter keys', () => {
      const { lt } = readLtRuntimeConfigFromEnv({
        NG_PUBLIC_LT_BUG_AUTO_OPEN_ON_ERROR: 'true',
        NG_PUBLIC_LT_BUG_AUTO_SHOW: 'false',
        NG_PUBLIC_LT_BUG_BUTTON_COLOR: '#123456',
        NG_PUBLIC_LT_BUG_BUTTON_TEXT: 'Fehler melden',
        NG_PUBLIC_LT_BUG_ENABLED: 'yes',
        NG_PUBLIC_LT_BUG_ENABLE_SCREENSHOT: '0',
        NG_PUBLIC_LT_BUG_POSITION: 'bottom-left',
      }).public;
      expect(lt?.['bug']).toEqual({
        autoOpenOnError: true,
        autoShow: false,
        buttonColor: '#123456',
        buttonText: 'Fehler melden',
        enableScreenshot: false,
        enabled: true,
        position: 'bottom-left',
      });
    });

    it('reads the auth, tus, ai, sync and errorTranslation keys with their types', () => {
      const { lt } = readLtRuntimeConfigFromEnv({
        NG_PUBLIC_LT_AI_BASE_PATH: '/assistant',
        NG_PUBLIC_LT_AUTH_BASE_PATH: '/auth',
        NG_PUBLIC_LT_AUTH_ENABLE_PASSKEY: 'false',
        NG_PUBLIC_LT_AUTH_ENABLE_TWO_FACTOR: 'true',
        NG_PUBLIC_LT_AUTH_LOGIN_PATH: '/anmelden',
        NG_PUBLIC_LT_AUTH_TWO_FACTOR_REDIRECT_PATH: '/2fa',
        NG_PUBLIC_LT_ERROR_TRANSLATION_DEFAULT_LOCALE: 'en',
        NG_PUBLIC_LT_ERROR_TRANSLATION_ENABLED: 'true',
        NG_PUBLIC_LT_ERROR_TRANSLATION_PRELOAD: 'off',
        NG_PUBLIC_LT_SYNC_BASE_PATH: '/replicate',
        NG_PUBLIC_LT_TUS_DEFAULT_CHUNK_SIZE: '1048576',
        NG_PUBLIC_LT_TUS_DEFAULT_ENDPOINT: '/uploads',
        NG_PUBLIC_LT_TUS_RESOLVE_AGAINST_API: 'false',
      }).public;
      expect(lt).toEqual({
        ai: { basePath: '/assistant' },
        auth: { basePath: '/auth', enablePasskey: false, enableTwoFactor: true, loginPath: '/anmelden', twoFactorRedirectPath: '/2fa' },
        errorTranslation: { defaultLocale: 'en', enabled: true, preload: false },
        sync: { basePath: '/replicate' },
        tus: { defaultChunkSize: 1048576, defaultEndpoint: '/uploads', resolveAgainstApi: false },
      });
    });

    it('reads the nested auth keys (systemSetup, interceptor), publicPaths as array', () => {
      const { lt } = readLtRuntimeConfigFromEnv({
        NG_PUBLIC_LT_AUTH_INTERCEPTOR_ENABLED: 'false',
        NG_PUBLIC_LT_AUTH_INTERCEPTOR_PUBLIC_PATHS: '/i18n, /health,, /public ',
        NG_PUBLIC_LT_AUTH_SYSTEM_SETUP_ENABLED: 'true',
        NG_PUBLIC_LT_AUTH_SYSTEM_SETUP_SETUP_PATH: '/einrichten',
      }).public;
      expect(lt?.auth).toEqual({
        interceptor: { enabled: false, publicPaths: ['/i18n', '/health', '/public'] },
        systemSetup: { enabled: true, setupPath: '/einrichten' },
      });
    });

    it('adds a nested group only when one of its keys is set', () => {
      const { lt } = readLtRuntimeConfigFromEnv({ NG_PUBLIC_LT_AUTH_SYSTEM_SETUP_ENABLED: 'true' }).public;
      expect(lt?.auth).toEqual({ systemSetup: { enabled: true } });
    });

    it('drops unparsable values and features without any value', () => {
      const { lt } = readLtRuntimeConfigFromEnv({
        NG_PUBLIC_LT_AUTH_ENABLE_PASSKEY: 'maybe',
        NG_PUBLIC_LT_BUG_ENABLED: '',
        NG_PUBLIC_LT_TUS_DEFAULT_CHUNK_SIZE: 'big',
        NG_PUBLIC_LT_TUS_DEFAULT_ENDPOINT: '/uploads',
      }).public;
      expect(lt).toEqual({ tus: { defaultEndpoint: '/uploads' } });
    });

    it('ignores keys that are not listed', () => {
      const { lt } = readLtRuntimeConfigFromEnv({
        NG_PUBLIC_LT_AUTH_ADMIN_SECRET: 'x',
        NG_PUBLIC_LT_AUTH_INTERCEPTOR_FOO: 'x',
        NG_PUBLIC_LT_UNKNOWN_BASE_PATH: '/x',
        NG_PUBLIC_LT_BUG_BUTTON_ICON: 'bug',
      }).public;
      expect(lt).toEqual({});
    });
  });
});

describe('readLtRequestContext()', () => {
  it('returns the public part as runtimeConfig and the server-only API URL separately', () => {
    const env = { NG_API_URL: 'http://api.internal:3000', NG_PUBLIC_API_URL: 'https://api.example.com' };
    const context = readLtRequestContext(env, { appVersion: '3.0.0' });
    expect(context).toEqual({ runtimeConfig: readLtRuntimeConfigFromEnv(env, { appVersion: '3.0.0' }).public, serverApiUrl: 'http://api.internal:3000' });
    expect(context.runtimeConfig.appVersion).toBe('3.0.0');
    expect(JSON.stringify(context.runtimeConfig)).not.toContain('api.internal');
  });

  it('reads process.env by default', () => {
    vi.stubEnv('NG_PUBLIC_API_URL', 'https://process.example.com');
    expect(readLtRequestContext().runtimeConfig.apiUrl).toBe('https://process.example.com');
  });
});

describe('provideLtServerRuntimeConfig()', () => {
  it('provides LT_SERVER_RUNTIME_CONFIG from an env object', () => {
    const env = { NG_API_URL: 'http://api.internal:3000', NG_PUBLIC_API_URL: 'https://api.example.com' };
    TestBed.configureTestingModule({ providers: [provideLtServerRuntimeConfig(env)] });
    expect(TestBed.inject(LT_SERVER_RUNTIME_CONFIG)).toEqual(readLtRuntimeConfigFromEnv(env));
  });

  it('reads an env function lazily, when the config is injected (per render)', () => {
    const env = vi.fn(() => ({ NG_PUBLIC_SITE_URL: 'https://lazy.example.com' }));
    TestBed.configureTestingModule({ providers: [provideLtServerRuntimeConfig(env)] });
    expect(env).not.toHaveBeenCalled();
    expect(TestBed.inject(LT_SERVER_RUNTIME_CONFIG)?.public.siteUrl).toBe('https://lazy.example.com');
    expect(env).toHaveBeenCalledTimes(1);
  });

  it('reads process.env at injection time by default', () => {
    TestBed.configureTestingModule({ providers: [provideLtServerRuntimeConfig()] });
    vi.stubEnv('NG_API_URL', 'http://late.internal:3000');
    expect(TestBed.inject(LT_SERVER_RUNTIME_CONFIG)?.serverApiUrl).toBe('http://late.internal:3000');
  });
});
