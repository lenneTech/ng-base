/*
 * Public API of `@lenne.tech/ng-base/auth/provide`: the light half of auth for `app.config.ts` and the routes —
 * `provideLtAuth()`, `ltAuthInterceptor`, the guards, the session store (`LtAuthStore`: signals, cookie/JWT transport,
 * session validation, sign-out) and the first-admin setup. No Better Auth, no passkey or 2FA code, so it keeps the
 * initial bundle small. `@lenne.tech/ng-base/auth` re-exports all of it and adds `LtAuthService` with the Better Auth
 * flows. This entry never imports `@lenne.tech/ng-base/auth`.
 */
export { ltAuthGuard, ltGuestGuard, ltRoleGuard, ltSystemSetupGuard } from './lib/auth-guards';
export { ltAuthInterceptor, LtUnauthorizedHandler } from './lib/auth-interceptor';
export {
  LT_AUTH_DEFAULTS,
  LT_AUTH_INPUT_OPTIONS,
  LT_AUTH_OPTIONS,
  LT_AUTH_STATE_COOKIE_DEFAULT,
  LT_JWT_TOKEN_COOKIE_DEFAULT,
  resolveLtAuthCookieNames,
  resolveLtCookiePrefix,
} from './lib/auth-options';
export type { LtAuthCookieNamesOptions, LtAuthOptions, LtResolvedAuthOptions } from './lib/auth-options';
export { LT_AUTH_COOKIE_MAX_AGE, LtAuthStateService, resolveLtAuthState } from './lib/auth-state';
export { hasLtRole, LT_AUTH_FEATURES_STATE_KEY, LT_AUTH_SIGN_OUT_HOOKS, LT_VALIDATE_SESSION_TIMEOUT_MS, LtAuthStore, readLtAuthAnswer } from './lib/auth-store';
export type { LtAuthAnswer, LtAuthSignOutHook } from './lib/auth-store';
export type {
  LtAuthCallOptions,
  LtAuthError,
  LtAuthFeatures,
  LtAuthMode,
  LtAuthResponse,
  LtAuthResponseData,
  LtAuthState,
  LtNoStrayCredential,
  LtPasskey,
  LtPasskeyAuthResult,
  LtPasskeyRegisterResult,
  LtSystemSetupInput,
  LtSystemSetupStatus,
  LtTwoFactorEnableResult,
  LtUser,
  LtUserInput,
} from './lib/auth-types';
export { isLtApiRequest, isLtAuthEndpoint, LT_AUTH_COOKIE_PATHS, LT_AUTH_ENDPOINT_FRAGMENTS, LT_AUTH_PUBLIC_PATHS } from './lib/auth-urls';
export { provideLtAuth } from './lib/provide-lt-auth';
export { LT_SYSTEM_SETUP_STATE_KEY, LT_SYSTEM_SETUP_TOKEN_HEADER, LtSystemSetupService } from './lib/system-setup';
export type { LtSystemSetupError } from './lib/system-setup';
