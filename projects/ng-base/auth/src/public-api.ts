/*
 * Public API of `@lenne.tech/ng-base/auth`: Better Auth against nest-server (`/iam`) with signals, cookie/JWT dual
 * mode, 2FA, passkeys, guards, the 401 interceptor and the first-admin system setup.
 *
 * Everything of `@lenne.tech/ng-base/auth/provide` (providers, guards, interceptor, `LtAuthStore`, setup) is re-exported
 * here. Import those from `/auth/provide` in `app.config.ts` and the routes so the initial bundle does not carry
 * `LtAuthService`; use this entry where a page signs in, registers, verifies 2FA or manages passkeys.
 */
export * from '@lenne.tech/ng-base/auth/provide';
export { clearLtAuthPluginRegistry, createLtAuthClient, getLtAuthPluginRegistry, registerLtAuthPlugins, resolveLtAuthClientBase, resolveLtAuthClientUrl } from './lib/auth-client';
export type { LtAuthClient, LtAuthClientConfig } from './lib/auth-client';
export { LtAuthService } from './lib/auth-service';
