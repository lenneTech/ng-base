import { inject, InjectionToken, REQUEST_CONTEXT } from '@angular/core';

import { LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT } from './pre-hydration-input';

/**
 * Feature options that can be overridden per stage at runtime (`NG_PUBLIC_LT_<FEATURE>_<OPTION>`).
 *
 * Each feature provider (`provideLtAuth`, `provideLtFiles`, `provideLtAi`, `provideLtSync`, `provideLtNgBase`)
 * merges, in this order: its defaults, the options passed in code, and the values found here.
 */
export interface LtPublicFeatureConfig {
  ai?: Record<string, unknown>;
  auth?: Record<string, unknown>;
  errorTranslation?: Record<string, unknown>;
  sync?: Record<string, unknown>;
  tus?: Record<string, unknown>;
  [feature: string]: Record<string, unknown> | undefined;
}

/**
 * Public runtime configuration of the app, the Angular counterpart of Nuxt's `runtimeConfig.public`.
 *
 * With SSR the server reads it per request from the `NG_*` environment (`readLtRequestContext()` in
 * `@lenne.tech/ng-base/server`), passes it to `AngularNodeAppEngine.handle(req, context)` as request context
 * (`REQUEST_CONTEXT`) and writes it as JSON `<script id="ng-runtime-config">` into every HTML response, also for
 * `RenderMode.Client` routes; the browser reads that script. One build can therefore be promoted from stage to stage.
 * Without SSR the values come from `provideLtNgBase({ runtime })`.
 *
 * Projects may carry additional public values (e.g. `plausibleApiHost`); they travel the same way.
 * Never put a secret here: everything in this object reaches the browser.
 */
export interface LtRuntimeConfig {
  [key: string]: unknown;
  /** Commit of the running build (`NG_PUBLIC_APP_COMMIT`, fallback `APP_VERSION_COMMIT`), `unknown` when unset. */
  appCommit?: string;
  /**
   * Deployment stage (`NG_PUBLIC_APP_ENV`), using nest-server's NODE_ENV block names: `local`, `ci`, `e2e`, `develop`,
   * `test`, `production`. Only `production` counts as production; features that are off in production fail closed.
   */
  appEnv?: string;
  /** Version of the running build (from the server, e.g. package.json). */
  appVersion?: string;
  /** Public API base URL (`NG_PUBLIC_API_URL`), e.g. `https://api.example.com`. Empty = relative to the app origin. */
  apiUrl: string;
  /**
   * Route browser API calls through the dev-server proxy under `/api` (`NG_PUBLIC_API_PROXY`).
   * `null` = not configured: the proxy is used in dev mode (`isDevMode()`) with a one-time warning.
   * Never used during SSR.
   */
  apiProxy: boolean | null;
  /** Opt-in cookie namespace (`NG_PUBLIC_COOKIE_PREFIX`); must mirror the backend `COOKIE_PREFIX`. */
  cookiePrefix: string;
  /** Feature options overridden at runtime (`NG_PUBLIC_LT_*`). */
  lt: LtPublicFeatureConfig;
  /** Absolute public URL of the app (`NG_PUBLIC_SITE_URL`), used for redirect/callback URLs, SEO and security.txt. */
  siteUrl: string;
  /** Prefix for `localStorage` keys (`NG_PUBLIC_STORAGE_PREFIX`). */
  storagePrefix: string;
}

/** Defaults of {@link LtRuntimeConfig}. */
export const LT_RUNTIME_CONFIG_DEFAULTS: LtRuntimeConfig = {
  apiProxy: null,
  apiUrl: '',
  cookiePrefix: '',
  lt: {},
  siteUrl: '',
  storagePrefix: '',
};

/** The resolved public runtime configuration (defaults ← `provideLtNgBase({ runtime })` ← request context / `<script id="ng-runtime-config">`). */
export const LT_RUNTIME_CONFIG = new InjectionToken<LtRuntimeConfig>('LT_RUNTIME_CONFIG');

/** What the SSR server passes to `AngularNodeAppEngine.handle(req, context)` (see `readLtRequestContext()`). */
export interface LtRequestContext {
  /** Public runtime configuration (also written into the HTML as `<script id="ng-runtime-config">`). */
  runtimeConfig: Partial<LtRuntimeConfig>;
  /** Internal API URL for SSR requests only (`NG_API_URL`), never sent to the browser. */
  serverApiUrl?: string;
}

/**
 * Runtime configuration on the server: public part plus the server-only API URL. Read from `REQUEST_CONTEXT`
 * (an {@link LtRequestContext}) by default; `provideLtServerRuntimeConfig()` provides it from the environment instead
 * for servers that pass no request context. `null` in the browser.
 */
export interface LtServerRuntimeConfig {
  /** Public part. */
  public: Partial<LtRuntimeConfig>;
  /** Internal API URL for SSR requests only (`NG_API_URL`), never sent to the browser. */
  serverApiUrl: string;
}

/** Server-only runtime configuration (see {@link LtServerRuntimeConfig}). `null` in the browser. */
export const LT_SERVER_RUNTIME_CONFIG = new InjectionToken<LtServerRuntimeConfig | null>('LT_SERVER_RUNTIME_CONFIG', {
  factory: () => {
    const context = inject(REQUEST_CONTEXT, { optional: true }) as Partial<LtRequestContext> | null;
    if (!context || typeof context !== 'object' || !context.runtimeConfig) {
      return null;
    }
    return { public: context.runtimeConfig, serverApiUrl: context.serverApiUrl ?? '' };
  },
});

/** Id of the JSON `<script>` that carries the public runtime configuration into the browser. */
export const LT_RUNTIME_CONFIG_SCRIPT_ID = 'ng-runtime-config';

/** Read the runtime configuration the server wrote into the document (`null` when missing or unreadable). */
export function readLtRuntimeConfigFromDocument(doc: Document | null | undefined): Partial<LtRuntimeConfig> | null {
  const text = doc?.getElementById?.(LT_RUNTIME_CONFIG_SCRIPT_ID)?.textContent;
  if (!text) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Partial<LtRuntimeConfig>) : null;
  } catch {
    return null;
  }
}

/**
 * Serialise the public runtime configuration for an inline `<script type="application/json">`: `<`, `>`, `&`, U+2028
 * and U+2029 are escaped, so a value can never close the script element, open a comment or form an HTML entity.
 */
export function serializeLtRuntimeConfig(config: Partial<LtRuntimeConfig>): string {
  return JSON.stringify(config)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Insert the runtime configuration as the first child of `<head>` (documents without `<head>` stay untouched), by
 * default preceded by the pre-hydration submit guard (`LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT`).
 */
export function injectLtRuntimeConfigScript(html: string, config: Partial<LtRuntimeConfig>, options: { submitGuard?: boolean } = {}): string {
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (!head) {
    return html;
  }
  const at = head.index + head[0].length;
  const guard = options.submitGuard === false ? '' : `<script>${LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT}</script>`;
  return `${html.slice(0, at)}${guard}<script id="${LT_RUNTIME_CONFIG_SCRIPT_ID}" type="application/json">${serializeLtRuntimeConfig(config)}</script>${html.slice(at)}`;
}

/**
 * Merge partial runtime configurations onto a base. `lt` is merged per feature; `undefined` values never
 * override (an unset env variable keeps the code default).
 */
export function mergeLtRuntimeConfig(base: LtRuntimeConfig, ...overrides: (Partial<LtRuntimeConfig> | null | undefined)[]): LtRuntimeConfig {
  const result: LtRuntimeConfig = { ...base, lt: { ...base.lt } };
  for (const override of overrides) {
    if (!override) {
      continue;
    }
    for (const [key, value] of Object.entries(override) as [keyof LtRuntimeConfig, unknown][]) {
      if (value === undefined) {
        continue;
      }
      if (key === 'lt') {
        for (const [feature, options] of Object.entries((value ?? {}) as LtPublicFeatureConfig)) {
          result.lt[feature] = { ...result.lt[feature], ...definedEntries(options ?? {}) };
        }
        continue;
      }
      (result as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * Merge feature options: defaults ← code options ← runtime overrides. Nested plain objects are merged one level
 * deep (e.g. `auth.interceptor`), arrays and primitives replace. `undefined` never overrides.
 */
export function mergeLtFeatureOptions<T extends object>(defaults: T, ...overrides: (object | null | undefined)[]): T {
  const result: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const override of overrides) {
    if (!override) {
      continue;
    }
    for (const [key, value] of Object.entries(override)) {
      if (value === undefined) {
        continue;
      }
      const current = result[key];
      result[key] = isPlainObject(current) && isPlainObject(value) ? { ...current, ...definedEntries(value) } : value;
    }
  }
  return result as T;
}

function definedEntries(source: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
