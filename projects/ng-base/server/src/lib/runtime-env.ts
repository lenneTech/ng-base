import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import { LT_SERVER_RUNTIME_CONFIG, type LtPublicFeatureConfig, type LtRequestContext, type LtRuntimeConfig, type LtServerRuntimeConfig } from '@lenne.tech/ng-base';

/** Environment map (`process.env` shape). */
export type LtEnv = Record<string, string | undefined>;

/**
 * Feature options that may be overridden at runtime via `NG_PUBLIC_LT_<FEATURE>_<OPTION>` (camelCase ↔ SCREAMING_SNAKE).
 * Only listed keys are read, so an env name maps to exactly one option. Values are parsed by the type of the default:
 * booleans (`true`/`false`), numbers, string arrays (comma-separated), strings.
 */
export const LT_RUNTIME_FEATURE_KEYS: Readonly<Record<string, Readonly<Record<string, 'array' | 'boolean' | 'number' | 'string'>>>> = {
  ai: { basePath: 'string' },
  auth: { basePath: 'string', loginPath: 'string', twoFactorRedirectPath: 'string', enablePasskey: 'boolean', enableTwoFactor: 'boolean' },
  bug: {
    autoOpenOnError: 'boolean',
    autoShow: 'boolean',
    buttonColor: 'string',
    buttonText: 'string',
    enabled: 'boolean',
    enableScreenshot: 'boolean',
    position: 'string',
  },
  errorTranslation: { defaultLocale: 'string', enabled: 'boolean', preload: 'boolean' },
  sync: { basePath: 'string' },
  tus: { defaultChunkSize: 'number', defaultEndpoint: 'string', resolveAgainstApi: 'boolean' },
};

/** Nested auth keys (`NG_PUBLIC_LT_AUTH_SYSTEM_SETUP_ENABLED`, `…_INTERCEPTOR_PUBLIC_PATHS`, …). */
const LT_RUNTIME_NESTED_KEYS: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, 'array' | 'boolean' | 'number' | 'string'>>>>>> = {
  auth: {
    interceptor: { enabled: 'boolean', publicPaths: 'array' },
    systemSetup: { enabled: 'boolean', setupPath: 'string' },
  },
};

/** `loginPath` → `LOGIN_PATH`. */
export function toLtEnvKey(camel: string): string {
  return camel.replace(/([a-z\d])([A-Z])/g, '$1_$2').toUpperCase();
}

/**
 * Read the runtime configuration from the server environment (default `process.env`), the counterpart of Nuxt's
 * `NUXT_*` → `runtimeConfig` mapping:
 *
 * | Variable | Target |
 * |---|---|
 * | `NG_PUBLIC_API_URL` | `apiUrl` |
 * | `NG_API_URL` | `serverApiUrl` (SSR only, never transferred) |
 * | `NG_PUBLIC_SITE_URL` | `siteUrl` |
 * | `NG_PUBLIC_STORAGE_PREFIX` | `storagePrefix` |
 * | `NG_PUBLIC_COOKIE_PREFIX` | `cookiePrefix` |
 * | `NG_PUBLIC_API_PROXY` | `apiProxy` (`true`/`false`; unset = `null`) |
 * | `NG_PUBLIC_APP_ENV` | `appEnv` |
 * | `NG_PUBLIC_APP_COMMIT`, fallback `APP_VERSION_COMMIT` | `appCommit` |
 * | `NG_PUBLIC_APP_VERSION` | `appVersion` (or `options.appVersion`) |
 * | `NG_PUBLIC_LT_<FEATURE>_<OPTION>` | `lt.<feature>.<option>` (see {@link LT_RUNTIME_FEATURE_KEYS}) |
 *
 * Unset variables stay `undefined`, so code defaults keep applying.
 */
export function readLtRuntimeConfigFromEnv(env: LtEnv = processEnv(), options: LtRuntimeEnvOptions = {}): LtServerRuntimeConfig {
  const value = (name: string) => {
    const raw = env[name]?.trim();
    return raw ? raw : undefined;
  };
  const lt: LtPublicFeatureConfig = {};
  for (const [feature, keys] of Object.entries(LT_RUNTIME_FEATURE_KEYS)) {
    const options: Record<string, unknown> = {};
    for (const [key, type] of Object.entries(keys)) {
      const parsed = parseLtEnvValue(value(`NG_PUBLIC_LT_${toLtEnvKey(feature)}_${toLtEnvKey(key)}`), type);
      if (parsed !== undefined) {
        options[key] = parsed;
      }
    }
    for (const [group, groupKeys] of Object.entries(LT_RUNTIME_NESTED_KEYS[feature] ?? {})) {
      const nested: Record<string, unknown> = {};
      for (const [key, type] of Object.entries(groupKeys)) {
        const parsed = parseLtEnvValue(value(`NG_PUBLIC_LT_${toLtEnvKey(feature)}_${toLtEnvKey(group)}_${toLtEnvKey(key)}`), type);
        if (parsed !== undefined) {
          nested[key] = parsed;
        }
      }
      if (Object.keys(nested).length) {
        options[group] = nested;
      }
    }
    if (Object.keys(options).length) {
      lt[feature] = options;
    }
  }
  const apiProxy = parseLtEnvValue(value('NG_PUBLIC_API_PROXY'), 'boolean') as boolean | undefined;
  const commit = [value('NG_PUBLIC_APP_COMMIT'), value('APP_VERSION_COMMIT')].find((candidate) => candidate && candidate !== 'unknown');
  const publicConfig: Partial<LtRuntimeConfig> = {
    apiProxy,
    apiUrl: value('NG_PUBLIC_API_URL'),
    appCommit: commit ?? 'unknown',
    appEnv: value('NG_PUBLIC_APP_ENV'),
    appVersion: options.appVersion ?? value('NG_PUBLIC_APP_VERSION'),
    cookiePrefix: value('NG_PUBLIC_COOKIE_PREFIX'),
    lt,
    siteUrl: value('NG_PUBLIC_SITE_URL'),
    storagePrefix: value('NG_PUBLIC_STORAGE_PREFIX'),
  };
  return { public: { ...publicConfig, ...options.extend?.(env) }, serverApiUrl: value('NG_API_URL') ?? '' };
}

/** Options of {@link readLtRuntimeConfigFromEnv} / {@link readLtRequestContext}. */
export interface LtRuntimeEnvOptions {
  /** Version of the running build (e.g. from package.json); overrides `NG_PUBLIC_APP_VERSION`. */
  appVersion?: string;
  /** Additional public values of the project (e.g. `{ plausibleApiHost: env.NG_PUBLIC_PLAUSIBLE_API_HOST }`). */
  extend?: (env: LtEnv) => Record<string, unknown>;
}

/**
 * Build the request context for `AngularNodeAppEngine.handle(req, context)` from the environment, per request (a
 * changed env needs no rebuild). Angular code reads it through `REQUEST_CONTEXT` (`LT_SERVER_RUNTIME_CONFIG`), and the
 * public part must be written into the HTML with `injectLtRuntimeConfigScript()` / `ltAngularRequestHandler()`.
 */
export function readLtRequestContext(env: LtEnv = processEnv(), options: LtRuntimeEnvOptions = {}): LtRequestContext {
  const config = readLtRuntimeConfigFromEnv(env, options);
  return { runtimeConfig: config.public, serverApiUrl: config.serverApiUrl };
}

/** Parse one env value by its option type (`undefined` for unset or unparsable values). */
export function parseLtEnvValue(raw: string | undefined, type: 'array' | 'boolean' | 'number' | 'string'): unknown {
  if (raw === undefined) {
    return undefined;
  }
  switch (type) {
    case 'boolean':
      return /^(true|1|yes|on)$/i.test(raw) ? true : /^(false|0|no|off)$/i.test(raw) ? false : undefined;
    case 'number': {
      // `Number('')` is 0: a blank value is unparsable, not zero.
      const number = raw.trim() ? Number(raw) : Number.NaN;
      return Number.isFinite(number) ? number : undefined;
    }
    case 'array':
      return raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    default:
      return raw;
  }
}

/**
 * Alternative to the request context for servers that call `handle(req)` without one: reads the `NG_*` environment
 * at request time in the app (every SSR render bootstraps it) and provides `LT_SERVER_RUNTIME_CONFIG`. The browser
 * still needs `<script id="ng-runtime-config">` in the HTML, so prefer `ltAngularRequestHandler()`, which does both.
 */
export function provideLtServerRuntimeConfig(env?: LtEnv | (() => LtEnv)): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: LT_SERVER_RUNTIME_CONFIG,
      useFactory: () => readLtRuntimeConfigFromEnv(typeof env === 'function' ? env() : (env ?? processEnv())),
    },
  ]);
}

function processEnv(): LtEnv {
  return (globalThis as { process?: { env?: LtEnv } }).process?.env ?? {};
}
