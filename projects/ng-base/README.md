# @lenne.tech/ng-base

Angular library of the lenne.Tech stack, the Angular counterpart of [`@lenne.tech/nuxt-extensions`](https://github.com/lenneTech/nuxt-extensions).
It connects an Angular 22 app to [`@lenne.tech/nest-server`](https://github.com/lenneTech/nest-server) (Better Auth, TUS
upload, AI, offline sync), ships a Spartan-based UI layer for Tailwind CSS 4, SSR server helpers and Playwright helpers.

- Angular `^22.2` (standalone, zoneless, OnPush, signals), Tailwind CSS `4.3`, Spartan UI `1.9`
- Version scheme: MAJOR = Angular major (never raised for a breaking change), MINOR = a change an app has to act on
  when it updates, always with a [migration guide](https://github.com/lenneTech/ng-base/tree/main/migration-guides),
  PATCH = a fix or addition that needs no action. `ng-base-starter` carries the same version; there is no 22.0.3.
  `22.0.0` is a rebuild; versions up to `18.x` are reachable via tag `v18.1.3`.
- Template: [`ng-base-starter`](https://github.com/lenneTech/ng-base-starter) (`lt fullstack init --frontend angular`).

## Entry points

| Import                             | Content                                                                                                                                                                                                                                                                              | Needs nest-server |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `@lenne.tech/ng-base`              | `provideLtNgBase()`, runtime config (`LT_RUNTIME_CONFIG`), `LtApiUrlService`, `LT_FETCH`, `LtCookieService`, `ltSha256` + base64url, `tw`, `LtI18nService` (+ `LT_I18N_ADAPTER`), `LtToastService` (+ `LT_TOAST_ADAPTER`), `LtErrorTranslationService`                               | partly            |
| `@lenne.tech/ng-base/auth`         | `LtAuthService` (sign-in/up, 2FA, passkeys, password and email; Better Auth loaded on first use), `createLtAuthClient()`, and everything of `/auth/provide`                                                                                                                          | yes               |
| `@lenne.tech/ng-base/auth/provide` | `provideLtAuth()`, `ltAuthInterceptor`, `ltAuthGuard`, `ltGuestGuard()`, `ltRoleGuard()`, `ltSystemSetupGuard`, `LtAuthStore` (session signals, cookie/JWT transport, `validateSession()`, `signOut()`), `LtSystemSetupService`, `LtAuthStateService`, without Better Auth           | yes               |
| `@lenne.tech/ng-base/ui`           | Spartan helm (`Hlm*`), `LtOverlayService`, `provideLtUiOverlayDefaults()`, `LT_TRANSITIONS`, `lt-*` components, and everything of `/ui/provide`                                                                                                                                      | no                |
| `@lenne.tech/ng-base/ui/provide`   | `provideLtUi()` (Sonner toasts loaded lazily), `LtColorModeService`, `LT_COLOR_MODE_SCRIPT`, for `app.config.ts` without the component layer                                                                                                                                         | no                |
| `@lenne.tech/ng-base/files`        | `provideLtFiles()`, `injectLtTusUpload()`, `LtFileService` (TUS default `/tus`, works without the provider)                                                                                                                                                                          | yes               |
| `@lenne.tech/ng-base/files/ui`     | `<lt-tus-upload>` (`LtTusUploadComponent`), kept apart so `/files` does not pull the ui layer                                                                                                                                                                                        | yes               |
| `@lenne.tech/ng-base/share`        | `LtShareService` (Web Share API, clipboard fallback)                                                                                                                                                                                                                                 | no                |
| `@lenne.tech/ng-base/ai`           | `provideLtAi()`, `LtAiService`, `injectLtAiChat()`, connections/settings/status/usage/prompts/placeholders/admin services, `parseLtAiSseStream()`                                                                                                                                    | yes               |
| `@lenne.tech/ng-base/sync`         | `provideLtSync()`, `injectLtOfflineSync()`, protocol engine (`createLtSyncEngine()`), IndexedDB store, hint stream                                                                                                                                                                   | yes               |
| `@lenne.tech/ng-base/bug`          | `<lt-bug-report>` (`LtBugReport`, starts the capture), `LtBugReportService`, and everything of `/bug/provide`; capture engine, dialog and texts load lazily — bug reporter of `@lenne.tech/bug.lt`                                                                                   | no                |
| `@lenne.tech/ng-base/bug/provide`  | `provideLtBug()` (options only), `LT_BUG_ACTIVE` (on in this stage), `isLtBugActive()`, option types, for `app.config.ts` and the app shell; defaults and `resolveLtBugOptions()` are in `/bug`                                                                                      | no                |
| `@lenne.tech/ng-base/bug/server`   | `ltBugReport()` (`POST /_bug-lt/report` → Linear issue), `LtLinearClient`, `validateLtBugReport()`, `formatLtBugReportForLinear()`, redaction helpers (Node only)                                                                                                                    | –                 |
| `@lenne.tech/ng-base/server`       | `ltAngularRequestHandler()` (request context, runtime config and submit guard in the HTML), `provideLtServerRuntimeConfig()`, `readLtRuntimeConfigFromEnv()`, `ltSecurityHeaders()`, `applyLtHtmlCacheHeaders()`, `ltSecurityTxt()`, `ltBuildIdentity()`, `ltApiProxy()` (Node only) | –                 |
| `@lenne.tech/ng-base/testing`      | Playwright helpers: `waitForHydration()`, `gotoAndWaitForHydration()`, `fillInput()`, `generateTestUser()`, `generateTOTP()`, `createTestUser()`, `loginTestUser()` …                                                                                                                | –                 |
| `@lenne.tech/ng-base/utils`        | `LtSeoService`, `LtStorageService`, `LtScrollService`, `ltFocusFirstInvalid()`, `LtStandard` / `ltMap()`                                                                                                                                                                             | no                |

Every feature is opt-in through its `provideLt…()` function; entry points you do not import are not bundled.

## Installation

```bash
pnpm add @lenne.tech/ng-base better-auth @angular/cdk @spartan-ng/brain @ng-icons/core @ng-icons/lucide tw-animate-css
pnpm add tus-js-client            # optional: uploads (add "url-parse" to allowedCommonJsDependencies in angular.json)
pnpm add modern-screenshot        # optional: screenshots of the bug reporter (/bug)
pnpm add -D @playwright/test      # optional: /testing
```

Peers: `@angular/*` `^22.2`, `@angular/cdk` `^22.2`, `@spartan-ng/brain` `>=1.9 <2`, `@ng-icons/core` + `@ng-icons/lucide` `>=36`,
`rxjs` `^7.8`, `better-auth` `>=1.7.16 <1.8.0` (lock-step with nest-server), optional `@better-auth/passkey` (same range),
`tus-js-client` `>=4`, `modern-screenshot` `>=4.6`, `@playwright/test`. Dependencies: `clsx`, `tailwind-merge`, `class-variance-authority`.

## Setup

`src/app/app.config.ts`:

```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withInterceptors([ltAuthInterceptor])), // ltAuthInterceptor from '@lenne.tech/ng-base/auth/provide'
    provideLtNgBase(),
    provideLtAuth({ systemSetup: { enabled: true } }), // from '@lenne.tech/ng-base/auth/provide' (keeps LtAuthService out of the initial bundle)
    // provideLtFiles({ tus: { … } }) / provideLtAi({ basePath: … }): only with options — the defaults (/tus, /ai)
    // apply without them, and a call without options only adds the entry point to the initial bundle.
    provideLtSync(), // opt-in offline sync
    provideLtUi(), // from '@lenne.tech/ng-base/ui/provide': Sonner toasts (lazy), color mode; <hlm-toaster /> in a @defer block
  ],
};
```

`src/server.ts` (Express + `AngularNodeAppEngine`):

```ts
app.use(ltSecurityHeaders());
app.use(ltSecurityTxt()); // only where somebody reads the contact address
app.use(ltBuildIdentity()); // GET /api/build-identity
app.use(ltApiProxy()); // /api/* → NG_API_URL, only with NG_PUBLIC_API_PROXY=true
app.use(express.static(browserDistFolder, { index: false, maxAge: '1y', redirect: false }));
app.use(ltAngularRequestHandler(new AngularNodeAppEngine(), { appVersion: packageJson.version }));
```

`ltAngularRequestHandler()` reads the `NG_*` environment per request into a request context
(`AngularNodeAppEngine.handle(req, context)`, read in the app through `REQUEST_CONTEXT`), adds the HTML cache headers
and writes the public part as `<script id="ng-runtime-config">` into every HTML response, client-rendered routes
included. The browser reads that script, so one build runs on every stage. `NG_API_URL` never leaves the server.

`src/styles.css`:

```css
@import 'tailwindcss';
@import '@lenne.tech/ng-base/ui/styles/theme.css'; /* vendor mode: './core/ui/styles/theme.css' */
```

The theme brings the Spartan preset, the lenne.Tech palette (primary, secondary, success, info, warning, error, neutral
— as in nuxt-base-starter), the semantic tokens of the helm layer and the classes of every component, so nothing else
needs configuring. That is about 172 kB raw / 20 kB gzip of CSS. To stay within the CLI budget, import the core and only
the components the app renders (each file pulls the components it builds on):

```css
@import 'tailwindcss';
@import '@lenne.tech/ng-base/ui/styles/core.css';
@import '@lenne.tech/ng-base/ui/styles/components/sonner.css'; /* <hlm-toaster> */
@import '@lenne.tech/ng-base/ui/styles/components/lt-text-field.css'; /* + input, input-group, lt-form-field */
@import '@lenne.tech/ng-base/ui/styles/components/lt-header.css';
```

Measured: core 15 kB, core + five typical components 62 kB raw / 9 kB gzip. The files are generated from the
component sources (`scripts/generate-ui-sources.mjs`, checked by `pnpm run check`).

Bundle size: import providers from `@lenne.tech/ng-base/ui/provide` and render the toaster deferred, so the component
layer stays out of the initial bundle. Toasts above open dialogs: add `provideLtUiOverlayDefaults()` (from
`@lenne.tech/ng-base/ui`) to the providers of the lazy routes that open overlays, not to `app.config.ts` (it lives in
the CDK overlay module):

```html
@defer (on idle) { <app-toaster />
<!-- a tiny component that renders <hlm-toaster /> -->
}
```

## Runtime configuration

| Variable                                                              | Scope                  | Purpose                                                                                                                             |
| --------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `NG_PUBLIC_API_URL`                                                   | browser + SSR fallback | Public API URL                                                                                                                      |
| `NG_API_URL`                                                          | SSR only               | Internal API URL for server-side requests (never sent to the browser)                                                               |
| `NG_PUBLIC_SITE_URL`                                                  | public                 | App URL for redirect/callback URLs, SEO, security.txt                                                                               |
| `NG_PUBLIC_API_PROXY`                                                 | browser                | `true`: browser calls go to `/api/*` (dev proxy / `ltApiProxy()`); unset: on in dev mode with a warning                             |
| `NG_PUBLIC_COOKIE_PREFIX`                                             | public                 | Cookie namespace (`<prefix>-auth-state`), mirror the backend `COOKIE_PREFIX`                                                        |
| `NG_PUBLIC_STORAGE_PREFIX`                                            | public                 | `localStorage` prefix of `LtStorageService`                                                                                         |
| `NG_PUBLIC_LT_<FEATURE>_<OPTION>`                                     | public                 | Feature options, e.g. `NG_PUBLIC_LT_TUS_DEFAULT_ENDPOINT`, `NG_PUBLIC_LT_AUTH_LOGIN_PATH`, `NG_PUBLIC_LT_AUTH_SYSTEM_SETUP_ENABLED` |
| `NG_LT_SECURITY_TXT_*`                                                | server                 | `CONTACT`, `HOSTS`, `POLICY`, `PREFERRED_LANGUAGES`, `VALID_DAYS`                                                                   |
| `NG_PUBLIC_APP_COMMIT`, `APP_VERSION_COMMIT`, `NG_PUBLIC_APP_VERSION` | server                 | Build identity                                                                                                                      |

Without SSR (static hosting, foreign backend) pass the values in code: `provideLtNgBase({ runtime: { apiUrl: '…' } })`.

`NG_API_URL` is for requests only. `LtApiUrlService.buildUrl()` returns it during SSR, so its result never goes into the
HTML: a `src` or `href` with the internal host (`http://api:3000/…`) is unreachable for the browser. Every API URL that
ends up in the page (`src`, `href`, `srcset`, `poster`, CSS `url()`, meta tags) comes from
`LtApiUrlService.buildBrowserUrl()` or `LtFileService.getFileUrl()` / `getDownloadUrl()`, which use `NG_PUBLIC_API_URL`
(or `/api` behind the proxy) on the server too. `files/src/lib/file-service-ssr.spec.ts` renders a page with
`NG_API_URL=http://api:3000` and fails as soon as that host appears in the HTML.

## Auth in short

```ts
protected readonly auth = inject(LtAuthService);

await this.auth.signIn.email({ email, password });   // password is SHA-256 hashed before it leaves the browser
await this.auth.signIn.social({ provider: 'microsoft', callbackURL: '/auth/callback' }); // SSO, see below
this.auth.user();                                     // signal
this.auth.isAdmin();                                  // computed signal (UX gate only)
await this.auth.twoFactor.verifyTotp({ code });       // sets the user on success
await this.auth.authenticateWithPasskey();            // WebAuthn with nest-server challengeId
await this.auth.signOut();                            // flushes and wipes offline data when provideLtSync() is active
```

Routes: `canActivate: [ltAuthGuard]`, `canActivate: [ltGuestGuard('/app')]`, `canActivate: [ltRoleGuard('admin')]`,
root route `canActivateChild: [ltSystemSetupGuard]`. Import the guards, `ltAuthInterceptor` and `provideLtAuth()` from
`@lenne.tech/ng-base/auth/provide`, and `LtAuthStore` where a shell only reads the user or signs out: that entry carries
no Better Auth, 2FA or passkey code. `LtAuthService` (`/auth`) shares the same state and belongs on the pages that sign
in, register, verify 2FA or manage passkeys. `/auth` re-exports everything of `/auth/provide`, so either import works.

`validateSession()` (app start) checks the user of the `lt-auth-state` cookie against `GET /iam/get-session`. When the API
answers that no session exists (401, 403, or neither user nor session), that user is signed out and the call answers
`false`; a timeout or an error keeps the user, and so does JWT mode with a stored JWT (as in nuxt-extensions 4.0.6). The
next 401 still leads to the login page.

`lt-jwt-token` holds a JWT or nothing. After 2FA, a passkey or a social sign-in never store a token yourself: the service
puts the session in place, `authenticateWithPasskey()` returns `{ success, error?, user? }`, and `twoFactor.verifyTotp()`
/ `verifyBackupCode()` / `signIn.social()` drop Better Auth's opaque session token from their answer (a JWT of
`cookies: false` stays). That covers the returned value, also with `throw: true`; an `onSuccess` hook in the call
options sees the answer before. `twoFactor.enable()` / `disable()` and `changePassword({ revokeOtherSessions: true })`
replace the session (nest-server 12.11 binds a JWT to its session): a JWT in their answer replaces the stored one, the
transport stays, and any other token is dropped from the answer. `setUser(user)` without a mode keeps the transport when
it updates the signed-in user (same `id`, e.g. `twoFactorEnabled` after switching 2FA on); another user starts on the
cookie session.

**An API without JWT is not asked for one.** When `GET /iam/features` reports `jwt: false` (nest-server with
`betterAuth.jwt: false`, whose `/iam/token` answers 404), no sign-in, session check or 401 requests `/iam/token`: the app
stays on the cookie session, and a 401 reaches the caller and the session-loss handling unchanged. There is nothing to
configure, the API's flags decide; a JWT request at app start waits for a features request still on its way. An API that
reports `jwt: true`, or no `jwt` at all, is asked as before.

### Sign-in through a social provider

`LtAuthService.signIn.social(params)` signs in through a provider the API configured (`betterAuth.socialProviders` in
nest-server), for example Microsoft Entra ID for single sign-on. `GET /iam/features` lists the enabled providers as
`socialProviders`; `auth.features()` holds that answer, so a login page can show one button per entry. Since nest-server
12.11.0 the same answer carries `emailAndPassword`: when it is `false` the API signs in through a provider alone (and
reports `passkey` and `twoFactor` as `false`), so a login page can hide its email form.
`getClient().signIn.social()` is the same call without the auth state. Every field is documented on
`LtSocialSignInParams`.

```ts
// login page
protected readonly auth = inject(LtAuthService);
protected readonly providers = computed(() => {
  const value = this.auth.features()['socialProviders'];
  return Array.isArray(value) ? value : [];
});

// Interactive: the provider shows its account picker. Relative URLs become <NG_PUBLIC_SITE_URL>/…
protected signInWith(provider: string): Promise<LtAuthResponse> {
  return this.auth.signIn.social({ additionalParams: { prompt: 'select_account' }, callbackURL: '/auth/callback', errorCallbackURL: '/auth/login', provider });
}
```

```ts
// auth/callback page (no ltAuthGuard: the user is not loaded yet, the API has just set the session cookie)
constructor() {
  afterNextRender(async () => {
    const signedIn = await this.auth.validateSession();
    await this.router.navigateByUrl(signedIn ? '/app' : '/auth/login', { replaceUrl: true });
  });
}
```

Both shapes go to `POST <basePath>/sign-in/social`:

- **Redirect, the usual one.** The answer is the provider's authorization URL, and Better Auth's client navigates there:
  the page is left and nothing is stored yet. The provider sends the browser to the API, which sets the session cookie
  and redirects to `callbackURL`, where the user arrives through `validateSession()`.
- **ID token**, for an app inside a host that already knows the user (Microsoft Teams, a native shell). With `idToken`
  the API answers `{ token, user }` at once, without navigation. The service signs the user in like after 2FA: on the
  cookie session with a JWT from `/iam/token`, or in JWT mode when the API answers a JWT (`cookies: false`). The session
  token in that answer is removed. Since nest-server 12.11.0 the API answers `ID_TOKEN_NOT_SUPPORTED` unless the
  provider sets `disableIdTokenSignIn: false`.

- **A silent attempt is `additionalParams: { prompt: 'none' }`.** The provider answers without showing anything: with
  the session when the user has one there, otherwise through `errorCallbackURL` with `?error=login_required` (or
  `interaction_required`). That way back is the only one, so the page behind it must not start the attempt again:
  remember it per tab, and do not try silently after an explicit sign-out, or the user is signed in again at once.
- **`?error=` on `errorCallbackURL` is a code from the provider or from Better Auth** (`access_denied`,
  `signup_disabled`, …). Map it to your own text. Never render `error_description` or anything else from the query:
  anybody can put text there and send the link around.
- **`callbackURL`, `errorCallbackURL` and `newUserCallbackURL` are app URLs and never come from user input.** The
  service turns a relative value into an absolute one on `NG_PUBLIC_SITE_URL` (`absoluteAppUrl()`, as for
  `requestPasswordReset`); Better Auth itself would resolve it against the API. An absolute value goes through
  unchanged, and the API's `trustedOrigins` is the only check on it. A deep link the user should land on afterwards
  goes into their query only after it was validated as an app-relative path.
- **Nothing is hashed**: no credential travels, the parameters go through as they are. The request carries cookies in
  JWT mode too (`LT_AUTH_COOKIE_PATHS`): it sets Better Auth's OAuth `state` cookie, which the callback checks.

**An inline profile photo is not kept in the auth state.** Better Auth's Microsoft provider stores the user's photo in
`user.image` as a `data:` URL. In the `lt-auth-state` cookie a few KB of it push the cookie past the browser's limit of
4096 bytes; the browser drops it without an error, and the next page load reads as a logout. So `user().image` is
`undefined` for such a user, while an `http(s)` URL or a path stays (also when an earlier version stored the photo).
Where you render an avatar, read the photo from the session answer (`GET <basePath>/get-session`, e.g.
`(await auth.getClient()).getSession()`). An API that does not need the photo sets `disableProfilePhoto: true` on the
Microsoft provider.

## Server-side rendering: backend calls are anonymous

During SSR every API call of ng-base goes out **without** the user's session: `LT_FETCH` / `fetchWithAuth`,
`ltAuthInterceptor`, the AI services and offline sync. The server takes the auth state from the `lt-auth-state` cookie,
a display cache for UI gating and no proof of a session, and never reads `lt-jwt-token`; Node's `fetch` does not forward
the browser's cookies. The session cookie `iam.session_token` belongs to the API host anyway (host-only unless
nest-server's `crossSubDomainCookies` is set), so the app server usually never receives it.

For pages that show user data:

- **Load it in the browser**, for example in `afterNextRender()` or a resource that only starts when
  `isPlatformBrowser(…)`, with a skeleton for the first paint. `resource()` / `httpResource()` run during SSR too.
- **Render only public data on the server**, and never decide access there: a guard that reads `lt-auth-state` decides
  what to render, the API decides what the user may see.
- If a page truly needs user data in the SSR HTML, that needs a route of the app's own server that forwards the
  request's session to the API, set up per project together with a shared cookie domain. ng-base does not do it.

Unlike nuxt-extensions, `fetchWithAuth` is anonymous during SSR too (nuxt-extensions sends the request's `lt-jwt-token`
as bearer there): no SSR output depends on one user's token, and a cached route can never serve one user's data to the
next.

## Texts (de/en)

Library texts are German and English, chosen by the browser language, `LtI18nService.setLocale()` or an app i18n
library bound through `LT_I18N_ADAPTER` (Transloco, ngx-translate). Every entry point brings its own keys and registers
them on first use, so the initial bundle carries only the core's `lt.error.*`: `lt.ui.*`, `lt.auth.*`, `lt.files.*`,
`lt.share.*`, `lt.bug.*`. The same texts ship as JSON for the app's translation files: `i18n/{de,en}.json` (core) and
`i18n/<entry>/{de,en}.json`. App texts always win: `provideLtNgBase({ i18n: { messages } })`, `registerMessages()` or the
adapter override any key.

## Bug reporting

`@lenne.tech/ng-base/bug` is the Angular counterpart of `@lenne.tech/bug.lt` 1.6.9: a floating button takes a screenshot,
the dialog collects title, type, description, steps and attachments plus console output, network requests, user journey
and browser details, and the app's own SSR server creates the Linear issue.

```ts
// app.config.ts: all bug.lt options (position, buttonColor/Text/Icon, enable*, autoOpenOnError, theme, max*, userJourney)
import { provideLtBug } from '@lenne.tech/ng-base/bug/provide';
provideLtBug({ autoOpenOnError: true }),

// app.ts (imports: [LtBugReport] from '@lenne.tech/ng-base/bug')
protected readonly bugActive = inject(LT_BUG_ACTIVE); // from '@lenne.tech/ng-base/bug/provide'
```

```html
<!-- app.html: loaded only where the reporter is on; it starts the capture right after the first render -->
@if (bugActive) { @defer (on immediate) { <lt-bug-report /> } }
```

```ts
// server.ts, before express.json() and the Angular handler
app.use(ltBugReport()); // POST /_bug-lt/report
```

Only `@lenne.tech/ng-base/bug/provide` (`provideLtBug()`, `LT_BUG_ACTIVE`, about 1 kB) is in the initial bundle. Production
loads nothing else; in the other stages `<lt-bug-report>` brings the state service and the button and starts the capture
engine, the dialog (ui layer) and the texts (`lt.bug.*`, also shipped as `i18n/bug/{de,en}.json`) load on first use. Styles: `theme.css` includes the components; with `core.css` add `components/lt-bug-report.css`. Server env (never sent
to the browser): `NG_LINEAR_API_KEY`, `NG_LINEAR_TEAM_NAME` (name or key), `NG_LINEAR_PROJECT_NAME` (optional).
Screenshots need the optional peer `modern-screenshot`; without it the screenshot is skipped.

Off in production, decided at runtime per stage: the browser reads `NG_PUBLIC_APP_ENV` from the runtime config, the
endpoint from the environment. Without `NG_PUBLIC_APP_ENV` both fail closed (browser part only in dev mode, endpoint
`404`; set `NG_PUBLIC_APP_ENV=local` locally). `enabled` overrides on both sides; while off no capture hook is installed.
Per stage without a rebuild: `NG_PUBLIC_LT_BUG_ENABLED` switches both sides (browser part and endpoint, before the
`enabled` option); `NG_PUBLIC_LT_BUG_AUTO_SHOW`, `NG_PUBLIC_LT_BUG_AUTO_OPEN_ON_ERROR`, `NG_PUBLIC_LT_BUG_ENABLE_SCREENSHOT`,
`NG_PUBLIC_LT_BUG_POSITION`, `NG_PUBLIC_LT_BUG_BUTTON_COLOR` and `NG_PUBLIC_LT_BUG_BUTTON_TEXT` are browser-only.

Redaction before sending (and again on the server before Linear): `Authorization`, `Cookie`, `Set-Cookie`,
`X-System-Setup-Token` and similar headers become `[redacted]`; bodies of `/iam/`, `/system-setup/` and other auth
endpoints are never recorded; `token`, `code`, `password`, `secret`, `otp` … are redacted in every URL (nested
`callbackURL` included), console line and journey entry; values of password, one-time-code and card fields are never
recorded, not even with `captureInputValues`. Answers never contain the API key or Linear's error messages.

Differences to bug.lt 1.6.9:

- `enabled` is a runtime decision (one image for all stages) and fails closed; env names `NG_LINEAR_*`.
- bug.lt recorded auth bodies, query tokens and Option/AltGr characters; it fetched any URL given as attachment data
  (SSRF); here files are base64 data URLs only, the body is validated by hand, size-capped and rate-limited.
- Fixed: SSE/stream responses no longer wait for the body, XHR with non-text `responseType` no longer throws, `%c`
  removes only its style arguments, Edge/Safari/iOS detection, Linear lookups are paginated and reuse workspace labels,
  the screenshot is sent once (bug.lt: three copies).
- One UI on Spartan/lt components (no `ui: false` variant), Lucide bug icon, default color `#dc2626` (WCAG AA with
  text), submit validates and focuses the first invalid field, the reporter's own UI is left out of journey and
  screenshot, dialogs are recorded (`captureModalEvents` was a no-op in bug.lt).
- `theme` sets the screenshot background; the dialog follows the app color mode. No `<ErrorBoundary>` component (Angular
  has no subtree error capture): the app's `ErrorHandler` is wrapped (it keeps handling every error) and
  `LtBugReportService.reportError()` reports by hand; `LtBugReportService.open()` replaces `useBugReport().openModal()`.

## Differences to nuxt-extensions 4.0.5

ng-base follows nuxt-extensions release for release (last compared: 1.26.0 to 4.0.5). Behaviour that is the same in both
(2FA and passkey sign-in never expose the session token, one auth fetch with JWT renewal and `basePath`, file URLs on the
API with `GET /files/id/:id`, TUS on `/tus`, `enableAdmin` off with a warning, error translations that never hold back the
start, `includeDisabled` for AI prompts, no `/iam/token` against an API that reports `jwt: false`, the JWT of a replaced
session taken from the answer, `setUser()` keeping the transport for the same user) is not listed. What differs on purpose:

- The auth state lives in `LtAuthService` only: `getClient()` is the stateless client. It removes an opaque session token
  from every answer, but it never stores a JWT, also not the one in the answer of `twoFactor.verifyTotp()`,
  `verifyBackupCode()`, `enable()`, `disable()` or `changePassword()`. nuxt-extensions 4.0.5 stores those in
  `useLtAuthClient()` as well. Make these calls through `LtAuthService`, which keeps the session in place.

- Composables with per-call state are `inject…()` factories bound to the injection context (`injectLtTusUpload()`,
  `injectLtAiChat()`, `injectLtOfflineSync()`); shared state lives in root services (`LtAuthService`, `LtAi…Service`).
- `fetchWithAuth` is anonymous during SSR too (see "Server-side rendering: backend calls are anonymous").
- Transitions use Angular `animate.enter` / `animate.leave` classes with CSS variables for the durations, no Tailwind
  duration utilities.
- nest-server's real JWT mode (`cookies: false`, env `NSC__COOKIES=false`) works end to end: a JWT in a sign-in, 2FA or
  passkey answer puts the store into JWT mode, session checks keep the mode (a bearer-proven session never falls back to
  cookie mode), and a JWT expiring within 60 s is refreshed with itself as bearer before it is sent (nest-server's JWTs
  live 15 minutes and there is no cookie to mint a new one). An opaque Better Auth session token is never stored. Before
  nest-server 12.7.0 the browser must reach the API same-origin in this mode (`NG_PUBLIC_API_PROXY=true`). Since
  nest-server 12.11.0 a JWT is bound to its session: switching 2FA on replaces the session, and `twoFactor.verifyTotp()`
  takes the new session's JWT from the answer; a JWT issued before the update answers 401 once, and in this mode every
  user signs in once more.
- Passkeys work without `@better-auth/passkey` (WebAuthn calls go straight to `/iam/passkey/*`); the plugin can still be
  passed via `provideLtAuth({ plugins })`.
- Social sign-in (nuxt-extensions PR #34): `LtAuthService.signIn.social()` turns relative callback URLs into absolute
  app URLs (nuxt-extensions passes them on, and Better Auth resolves them against the API); `/sign-in/social` is in
  `LT_AUTH_COOKIE_PATHS`, so `fetchWithAuth` sends cookies there in JWT mode too, for Better Auth's OAuth `state` cookie
  (nuxt-extensions with `cookiesInJwtMode: 'auth-paths'` omits them); and with `throw: true` the session token is
  removed from the returned body as well (nuxt-extensions removes it from `{ data }` only).
- Pre-hydration input is preserved (`provideLtNgBase({ preHydrationInput })`, on by default): the first change
  detection after hydration overwrites typed text even with `withEventReplay()` (measured in the playground E2E), so
  fields are snapshot before and restored after hydration. `ltAngularRequestHandler()` also writes a guard into the
  HTML that blocks the native submit of forms without `action` before hydration (no password in a GET URL).
- Not ported: the form-label association repair (a Nuxt UI/reka-ui id divergence that Angular's id handling does not
  have).

## Vendor mode

`lt fullstack init --frontend angular` vendors `projects/ng-base/` into `projects/app/src/core/` (without specs,
`test-setup.ts`, the library `package.json`/tsconfigs and the library README/CLAUDE.md). Every `ng-package.json` is kept:
the CLI derives one `tsconfig` `paths` entry per entry point from its `lib.entryFile`, e.g. `@lenne.tech/ng-base` →
`src/core/src/public-api.ts`, `@lenne.tech/ng-base/auth` → `src/core/auth/src/public-api.ts`,
`@lenne.tech/ng-base/ui/provide` → `src/core/ui/provide/src/public-api.ts` (see `VENDOR.md` in `src/core/`). Imports
therefore stay the same in both modes. Entry points import each other only through the package specifier.

## License

MIT, © lenne.Tech GmbH
