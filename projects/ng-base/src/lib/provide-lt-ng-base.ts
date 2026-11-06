import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ApplicationRef, inject, makeEnvironmentProviders, PLATFORM_ID, provideAppInitializer, type EnvironmentProviders } from '@angular/core';

import { LtApiUrlService } from './api-url';
import { LT_ERROR_TRANSLATION_OPTIONS, LtErrorTranslationService, type LtErrorTranslationOptions } from './error-translation';
import { LT_I18N_OPTIONS, type LtI18nOptions } from './i18n';
import { provideLtPreHydrationInput, type LtPreHydrationInputOptions } from './pre-hydration-input';
import {
  LT_RUNTIME_CONFIG,
  LT_RUNTIME_CONFIG_DEFAULTS,
  LT_SERVER_RUNTIME_CONFIG,
  mergeLtFeatureOptions,
  mergeLtRuntimeConfig,
  readLtRuntimeConfigFromDocument,
  type LtRuntimeConfig,
} from './runtime-config';
import { LT_NG_BASE_VERSION } from './version';

/** Options of {@link provideLtNgBase}. */
export interface LtNgBaseConfig {
  /**
   * Check at startup that an API URL is configured for the current scope (default `true`): a warning in dev mode, a
   * console error in production. Turn it off for apps without a backend (ng-base/ui only).
   */
  configCheck?: boolean;
  /** Backend error translation (`#LTNS_xxxx`). Turn it off (`enabled: false`) for apps without nest-server. */
  errorTranslation?: LtErrorTranslationOptions;
  /** Library i18n (locale, extra messages). Bind `LT_I18N_ADAPTER` to use the app's i18n library. */
  i18n?: LtI18nOptions;
  /** Keep what users type into server-rendered fields before hydration (default on, see `provideLtPreHydrationInput`). */
  preHydrationInput?: LtPreHydrationInputOptions;
  /**
   * Static runtime configuration: the base that the per-request values of the SSR server (`NG_*` via
   * `readLtRequestContext()`, `<script id="ng-runtime-config">` in the browser) override. Use it for apps without SSR,
   * tests, or defaults.
   */
  runtime?: Partial<LtRuntimeConfig>;
}

/** Name of the window flag set once the app is stable (hydrated) in the browser; read by `waitForHydration()`. */
export const LT_HYDRATED_FLAG = '__ltNgBaseHydrated';

/**
 * Core providers of `@lenne.tech/ng-base`.
 *
 * - {@link LT_RUNTIME_CONFIG}: defaults ← `config.runtime` ← request context (server) / `<script id="ng-runtime-config">` (browser).
 * - Error translation options and preload of the backend translations (browser only, in the background: the start
 *   never waits for the API; until they arrive errors show the developer message).
 * - i18n options.
 * - API URL config check.
 * - Pre-hydration input preservation (typed text survives hydration).
 * - Hydration flag `window.__ltNgBaseHydrated` for the Playwright helpers.
 *
 * Feature providers live in the secondary entry points: `provideLtAuth()` (`/auth`), `provideLtFiles()` (`/files`),
 * `provideLtAi()` (`/ai`), `provideLtSync()` (`/sync`), `provideLtUi()` (`/ui`), `provideLtServerRuntimeConfig()` (`/server`).
 *
 * @example app.config.ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideHttpClient(withInterceptors([ltAuthInterceptor])),
 *     provideLtNgBase(),
 *     provideLtAuth({ systemSetup: { enabled: true } }),
 *     provideLtUi(),
 *   ],
 * };
 */
export function provideLtNgBase(config: LtNgBaseConfig = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: LT_RUNTIME_CONFIG,
      useFactory: () => {
        const base = mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, config.runtime);
        if (!isPlatformBrowser(inject(PLATFORM_ID))) {
          return mergeLtRuntimeConfig(base, inject(LT_SERVER_RUNTIME_CONFIG, { optional: true })?.public);
        }
        return mergeLtRuntimeConfig(base, readLtRuntimeConfigFromDocument(inject(DOCUMENT)));
      },
    },
    {
      provide: LT_ERROR_TRANSLATION_OPTIONS,
      useFactory: () =>
        mergeLtFeatureOptions<Required<LtErrorTranslationOptions>>(
          { defaultLocale: config.i18n?.defaultLocale ?? 'de', enabled: true, preload: true },
          config.errorTranslation,
          inject(LT_RUNTIME_CONFIG).lt.errorTranslation,
        ),
    },
    { provide: LT_I18N_OPTIONS, useValue: config.i18n ?? {} },
    provideLtPreHydrationInput(config.preHydrationInput),
    provideAppInitializer(() => {
      if (config.configCheck !== false) {
        inject(LtApiUrlService).reportMissing();
      }
    }),
    provideAppInitializer(() => {
      const options = inject(LT_ERROR_TRANSLATION_OPTIONS);
      if (!isPlatformBrowser(inject(PLATFORM_ID)) || !options.enabled || !options.preload) {
        return;
      }
      // Not awaited: a slow or hanging API must never hold the app start (the translations are a signal).
      void inject(LtErrorTranslationService).loadTranslations();
    }),
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }
      void inject(ApplicationRef)
        .whenStable()
        .then(() => {
          (globalThis as Record<string, unknown>)[LT_HYDRATED_FLAG] = true;
          (globalThis as Record<string, unknown>)['__ltNgBaseVersion'] = LT_NG_BASE_VERSION;
        });
    }),
  ]);
}
