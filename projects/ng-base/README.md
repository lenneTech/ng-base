# @lenne.tech/ng-base

Angular library of the lenne.Tech stack, the Angular counterpart of [`@lenne.tech/nuxt-extensions`](https://github.com/lenneTech/nuxt-extensions).
It connects an Angular 22 app to [`@lenne.tech/nest-server`](https://github.com/lenneTech/nest-server) (Better Auth, TUS
upload, AI, offline sync), ships a Spartan-based UI layer for Tailwind CSS 4, SSR server helpers and Playwright helpers.

- Angular `^22.2` (standalone, zoneless, OnPush, signals), Tailwind CSS `4.3`, Spartan UI `1.9`
- Version scheme: major = Angular major. `22.0.0` is a rebuild; versions up to `18.x` are reachable via tag `v18.1.3`.
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

## Auth in short

```ts
protected readonly auth = inject(LtAuthService);

await this.auth.signIn.email({ email, password });   // password is SHA-256 hashed before it leaves the browser
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
Per stage without a rebuild: `NG_PUBLIC_LT_BUG_ENABLED`, `NG_PUBLIC_LT_BUG_AUTO_SHOW`, `NG_PUBLIC_LT_BUG_AUTO_OPEN_ON_ERROR`,
`NG_PUBLIC_LT_BUG_ENABLE_SCREENSHOT`, `NG_PUBLIC_LT_BUG_POSITION`, `NG_PUBLIC_LT_BUG_BUTTON_COLOR`, `NG_PUBLIC_LT_BUG_BUTTON_TEXT`
(browser part; the endpoint keeps its own `enabled` option).

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

## Differences to nuxt-extensions 1.25.0

- Composables with per-call state are `inject…()` factories bound to the injection context (`injectLtTusUpload()`,
  `injectLtAiChat()`, `injectLtOfflineSync()`); shared state lives in root services (`LtAuthService`, `LtAi…Service`).
- Bugs not ported: the user is set after 2FA verification; one shared auth fetch (`LT_FETCH`) refreshes a stale JWT for
  AI, SSE and sync too; file URLs resolve against the API; the TUS endpoint defaults to `/tus`; the missing
  `passkeyAlreadyRegistered` text exists; transitions use Angular `animate.enter`/`animate.leave` classes.
- nest-server's real JWT mode (`cookies: false`, env `NSC__COOKIES=false`) works end to end: a JWT in a sign-in, 2FA or
  passkey answer puts the store into JWT mode, session checks keep the mode (a bearer-proven session never falls back to
  cookie mode), and a JWT expiring within 60 s is refreshed with itself as bearer before it is sent (nest-server's JWTs
  live 15 minutes and there is no cookie to mint a new one). An opaque Better Auth session token is never stored. Before
  nest-server 12.7.0 the browser must reach the API same-origin in this mode (`NG_PUBLIC_API_PROXY=true`).
- The Better Auth admin plugin is off by default (`enableAdmin`), nest-server does not serve it.
- Passkeys work without `@better-auth/passkey` (WebAuthn calls go straight to `/iam/passkey/*`); the plugin can still be
  passed via `provideLtAuth({ plugins })`.
- Pre-hydration input is preserved (`provideLtNgBase({ preHydrationInput })`, on by default): the first change
  detection after hydration overwrites typed text even with `withEventReplay()` (measured in the playground E2E), so
  fields are snapshot before and restored after hydration. `ltAngularRequestHandler()` also writes a guard into the
  HTML that blocks the native submit of forms without `action` before hydration (no password in a GET URL).
- Not ported: the form-label association repair (a Nuxt UI/reka-ui id divergence that Angular's id handling does not
  have).
- File URLs use nest-server 12.5's real routes (`/files/id/:id`, `/files/info/:id`); nuxt-extensions built
  `/files/:id` and `/files/download/:id`, which answer 404.

## Vendor mode

`lt fullstack init --frontend angular` vendors `projects/ng-base/` into `projects/app/src/core/` (without specs,
`test-setup.ts`, the library `package.json`/tsconfigs and the library README/CLAUDE.md). Every `ng-package.json` is kept:
the CLI derives one `tsconfig` `paths` entry per entry point from its `lib.entryFile`, e.g. `@lenne.tech/ng-base` →
`src/core/src/public-api.ts`, `@lenne.tech/ng-base/auth` → `src/core/auth/src/public-api.ts`,
`@lenne.tech/ng-base/ui/provide` → `src/core/ui/provide/src/public-api.ts` (see `VENDOR.md` in `src/core/`). Imports
therefore stay the same in both modes. Entry points import each other only through the package specifier.

## License

MIT, © lenne.Tech GmbH
