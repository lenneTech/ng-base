/*
 * Public API of `@lenne.tech/ng-base` (core).
 *
 * Runtime configuration, API URL resolution, the shared fetch token, SSR-aware cookies, crypto helpers, i18n with an
 * adapter to the app's translation library, the toast bridge and the nest-server error translation.
 * Feature entry points: `/auth`, `/ui`, `/files`, `/share`, `/ai`, `/sync`, `/server`, `/testing`, `/utils`.
 */
export { isLtAbsoluteUrl, LtApiUrlService, resolveLtApiBaseUrl } from './lib/api-url';
export type { LtApiUrlInputs, LtApiUrlResolution, LtRenderScope } from './lib/api-url';
export { LtCookieService, parseLtCookies } from './lib/cookie';
export type { LtCookieOptions } from './lib/cookie';
export { ltArrayBufferToBase64Url, ltBase64UrlToUint8Array, ltSha256 } from './lib/crypto';
export { extractLtErrorMessage, LT_ERROR_TRANSLATION_OPTIONS, LtErrorTranslationService } from './lib/error-translation';
export type { LtErrorTranslationOptions, LtErrorTranslationResponse, LtParsedError } from './lib/error-translation';
export { LT_FETCH, ltCredentialsFetch } from './lib/fetch';
export type { LtFetch } from './lib/fetch';
export { LT_I18N_ADAPTER, LT_I18N_MESSAGES, LT_I18N_OPTIONS, LtI18nService } from './lib/i18n';
export type { LtI18nAdapter, LtI18nMessages, LtI18nOptions } from './lib/i18n';
export { collectLtEditedFields, LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT, provideLtPreHydrationInput, restoreLtField } from './lib/pre-hydration-input';
export type { LtPreHydrationInputOptions } from './lib/pre-hydration-input';
export { LT_HYDRATED_FLAG, provideLtNgBase } from './lib/provide-lt-ng-base';
export type { LtNgBaseConfig } from './lib/provide-lt-ng-base';
export {
  injectLtRuntimeConfigScript,
  LT_RUNTIME_CONFIG,
  LT_RUNTIME_CONFIG_DEFAULTS,
  LT_RUNTIME_CONFIG_SCRIPT_ID,
  LT_SERVER_RUNTIME_CONFIG,
  mergeLtFeatureOptions,
  mergeLtRuntimeConfig,
  readLtRuntimeConfigFromDocument,
  serializeLtRuntimeConfig,
} from './lib/runtime-config';
export type { LtPublicFeatureConfig, LtRequestContext, LtRuntimeConfig, LtServerRuntimeConfig } from './lib/runtime-config';
export { LT_TOAST_ADAPTER, LtToastService } from './lib/toast';
export type { LtToastAdapter, LtToastColor, LtToastOptions } from './lib/toast';
export { tw } from './lib/tw';
export { LT_NG_BASE_VERSION } from './lib/version';
export { resetLtWarnOnceState, warnLtOnce } from './lib/warn-once';
