# @lenne.tech/ng-base — notes for AI coding agents in consuming apps

This file ships with the package. It tells an agent working in an app (ng-base-starter, a generated lt project, or a
vendored copy in `projects/app/src/core/`) how to use the library correctly.

## Where things are

| Need                                                                                                       | Import                             |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Runtime config, API URLs, cookies, i18n, toasts, error translation                                         | `@lenne.tech/ng-base`              |
| Providers, guards, interceptor, auth state (`LtAuthStore`), first-admin setup — for `app.config.ts`/routes | `@lenne.tech/ng-base/auth/provide` |
| Sign-in/up, 2FA, passkeys, password/e-mail flows (`LtAuthService`, loads Better Auth lazily)               | `@lenne.tech/ng-base/auth`         |
| `provideLtUi()`, color mode — for `app.config.ts`                                                          | `@lenne.tech/ng-base/ui/provide`   |
| Spartan helm (`Hlm*`), `lt-*` components, overlays, transitions                                            | `@lenne.tech/ng-base/ui`           |
| TUS upload, file URLs (`<lt-tus-upload>`: `@lenne.tech/ng-base/files/ui`)                                  | `@lenne.tech/ng-base/files`        |
| AI services and chat                                                                                       | `@lenne.tech/ng-base/ai`           |
| Offline sync                                                                                               | `@lenne.tech/ng-base/sync`         |
| Bug reporter `provideLtBug()`, `LT_BUG_ACTIVE` — for `app.config.ts` and the app shell                     | `@lenne.tech/ng-base/bug/provide`  |
| `<lt-bug-report>`, `LtBugReportService`; report endpoint for `server.ts`: `…/bug/server`                   | `@lenne.tech/ng-base/bug`          |
| SSR server helpers (`server.ts` only)                                                                      | `@lenne.tech/ng-base/server`       |
| Playwright helpers (E2E only)                                                                              | `@lenne.tech/ng-base/testing`      |
| SEO, storage, scroll, form focus, model mapping                                                            | `@lenne.tech/ng-base/utils`        |

In vendor mode the same specifiers resolve to `src/core/` through `tsconfig` `paths`; never import `src/core/...`
relatively. Changes to the vendored core belong upstream in `lenneTech/ng-base`.

## Rules

- Auth goes through `LtAuthService` only. Never send a plaintext password: the service hashes every credential
  (SHA-256) itself, so pass the raw form value once and never hash it yourself as well.
- `lt-jwt-token` holds a JWT or nothing. After a passkey or 2FA sign-in never store a token yourself:
  `authenticateWithPasskey()` returns `{ success, error?, user? }`, and `twoFactor.verifyTotp()` / `verifyBackupCode()`
  set the session and return no session token.
- SSR backend calls are anonymous (also `fetchWithAuth`): load user data in the browser (`afterNextRender()`, or a
  resource that only starts when `isPlatformBrowser(…)`), render public data on the server, never decide access there.
- API URLs that go into the HTML (`src`, `href`, `srcset`, `poster`, CSS `url()`, meta tags) come from
  `LtFileService.getFileUrl()` / `getDownloadUrl()` or `LtApiUrlService.buildBrowserUrl()`. `buildUrl()` is for
  requests only: during SSR it returns the internal `NG_API_URL`, which the browser cannot reach.
- `lt-auth-state` is a UI cache. Guards (`ltAuthGuard`, `ltRoleGuard`) gate UI only; the backend authorises every
  request. Do not build security decisions on `isAdmin()`.
- Redirect/callback URLs for auth mails are absolute app URLs from `NG_PUBLIC_SITE_URL` (`LtAuthService.absoluteAppUrl`),
  never derived from user input or the request.
- `HttpClient` calls to the API need `ltAuthInterceptor` in `provideHttpClient(withInterceptors([...]))`; raw `fetch`
  calls should use `inject(LT_FETCH)` to get cookie/JWT handling.
- Configuration is runtime only (`NG_*` env read by `ltAngularRequestHandler()` per request). Do not add Angular
  `environment.ts` files for API URLs.
- Use the `lt-*` components and helm directives with the theme tokens (`bg-primary`, `text-muted-foreground`,
  `text-error` …) instead of raw colors, so dark mode and the lenne.Tech palette keep working.
- Backend error messages carry `#LTNS_xxxx:` codes: show them with `LtErrorTranslationService.translateError()` /
  `showErrorToast()`.
- Per-call state comes from `inject…()` factories (`injectLtTusUpload()`, `injectLtAiChat()`,
  `injectLtOfflineSync()`): call them in a field initializer or constructor (injection context).
- Bundle size: `app.config.ts` and the route config import only from the `…/provide` entry points
  (`@lenne.tech/ng-base/auth/provide`, `@lenne.tech/ng-base/ui/provide`, `@lenne.tech/ng-base/bug/provide`), render
  `<hlm-toaster>` in a `@defer` block, call `provideLtFiles()`/`provideLtAi()` only with options, and import `core.css`
  plus the `components/<name>.css` files of the components the app renders instead of `theme.css` when the CLI budget
  is tight.
- Bug reporter: `provideLtBug()` from `…/bug/provide` in `app.config.ts`; in the app shell
  `@if (bugActive) { @defer (on immediate) { <lt-bug-report /> } }` with `bugActive = inject(LT_BUG_ACTIVE)`;
  `app.use(ltBugReport())` in `server.ts` before `express.json()`. It is off in production and fails closed without
  `NG_PUBLIC_APP_ENV`; `NG_PUBLIC_LT_BUG_ENABLED` switches it per stage. Linear credentials (`NG_LINEAR_API_KEY` …)
  stay server env and never go into the runtime config.
- E2E: wait with `gotoAndWaitForHydration()` / `waitForHydration()` before interacting with SSR pages.
