/*
 * Public API of `@lenne.tech/ng-base/server` (Node only, import it in `server.ts` / `app.config.server.ts`):
 * runtime configuration from the `NG_*` environment, security headers, HTML cache headers, security.txt,
 * build identity and the same-origin API proxy.
 */
export { ltAngularRequestHandler, withLtRuntimeConfigScript } from './lib/angular-handler';
export type { LtAngularEngine, LtAngularRequestHandlerOptions } from './lib/angular-handler';
export { ltApiProxy, rewriteLtProxyCookie, rewriteLtProxyLocation } from './lib/api-proxy';
export type { LtApiProxyOptions } from './lib/api-proxy';
export {
  applyLtHtmlCacheHeaders,
  buildLtSecurityHeaders,
  isLtSecureRequest,
  LT_HSTS_VALUE,
  ltBuildIdentity,
  ltSecurityHeaders,
  ltSecurityTxt,
  resolveLtBuildCommit,
} from './lib/middlewares';
export type { LtBuildIdentityOptions, LtNodeMiddleware, LtSecurityTxtHandlerOptions } from './lib/middlewares';
export { LT_RUNTIME_FEATURE_KEYS, parseLtEnvValue, provideLtServerRuntimeConfig, readLtRequestContext, readLtRuntimeConfigFromEnv, toLtEnvKey } from './lib/runtime-env';
export type { LtEnv, LtRuntimeEnvOptions } from './lib/runtime-env';
export {
  allowedRequestOrigin,
  buildSecurityTxt as buildLtSecurityTxt,
  normalizeSecurityTxtContacts,
  normalizeSecurityTxtList,
  normalizeSecurityTxtValidDays,
  resolveSecurityTxt as resolveLtSecurityTxt,
  SECURITY_TXT_DEFAULT_CONTACT,
  SECURITY_TXT_DEFAULT_LANGUAGES,
  SECURITY_TXT_DEFAULT_VALID_DAYS,
  SECURITY_TXT_PATH,
  toSecurityTxtOrigin,
} from './lib/security-txt';
export type { SecurityTxtOptions as LtSecurityTxtOptions, SecurityTxtRuntimeConfig as LtSecurityTxtRuntimeConfig } from './lib/security-txt';
