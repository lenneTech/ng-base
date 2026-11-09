# Changelog

All notable changes to `@lenne.tech/ng-base` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are `MAJOR.MINOR.PATCH`: MAJOR is the Angular major
and never moves for a breaking change, MINOR is a change an app has to act on when it updates (with a guide in
[migration-guides/](migration-guides/)), PATCH a fix, improvement or addition an app takes over as is.

The history up to 18.x (Bootstrap, Apollo/GraphQL, legacy JWT auth) is reachable via the tag `v18.1.3` and the git
history; that line is not maintained any more.

## [22.0.5] - 2026-11-09

### Changed

- Built and tested with Angular 22.2.5 and Tailwind CSS 4.3.5, and tested against better-auth and
  `@better-auth/passkey` 1.7.18. The peer ranges stay as they are (`@angular/core` `^22.2.0`, better-auth
  `>=1.7.16 <1.8.0` in lock-step with nest-server); nothing changes for apps.
- Releases go out through npm Trusted Publishing only: 22.0.4 proved the route, so the npm token fallback is gone.

## [22.0.4] - 2026-11-07

22.0.3 is left out on purpose. From this version on `ng-base-starter` carries the version of the ng-base it pins, and
the starter had already released 22.0.3 (with ng-base 22.0.2) before that rule. Versions follow the scheme above, which
all lenne.Tech base repositories now share.

### Changed

- Releases are published through npm Trusted Publishing (OIDC) instead of a long-lived npm token, still with
  provenance. Nothing changes for apps; a version published that way shows `trustedPublisher` in its `_npmUser` on the
  registry.

## [22.0.2] - 2026-11-07

### Fixed

- `/ui`: `HlmDatePicker` and `HlmMonthYearPicker` use strict equality (`value !== null && value !== undefined` instead
  of `value != null`, same behaviour), so an app that vendors ng-base no longer gets two `eqeqeq` lint warnings from
  its `src/core/`. Patched in `scripts/generate-helm.mjs`; ng-base now lints the generated helm layer with the rules an
  app applies to its vendored core, so such a warning fails here first.

## [22.0.1] - 2026-11-06

### Added

- `/ai`: `LtAiPromptsService.load({ includeDisabled: true })` loads the disabled prompts too, for management pages
  (`GET /ai/prompts?includeDisabled=true`, nest-server 12.7.0; older servers ignore the parameter). Mutations reload in
  the mode of the last load. `enabledPrompts` holds only the enabled ones, for chat pickers that share the service.

### Fixed

- `/auth/provide`: the JWT cookie (`lt-jwt-token`) holds the raw JWT, the form nest-server reads from the cookie.
  22.0.0 wrote it JSON-quoted (`"eyJ…"`), so the cookie never authenticated and nest-server logged
  `JWKS verification error` for every request that carried it (the header path kept the flows working). A quoted value
  of 22.0.0 is still read and rewritten raw; no action needed.
- `/ui`: `hlmInput` and `hlmTextarea` with Signal Forms announce `aria-invalid` (and set `data-invalid`) only in the
  error state, once touched or submitted, like the red border; an untouched empty required field was announced as
  invalid. Patched in `scripts/generate-helm.mjs`, so a regenerated helm layer keeps it.
- `/bug`: the README now says what the code does: `NG_PUBLIC_LT_BUG_ENABLED` switches the browser part and the endpoint.

### Changed

- CI and publish workflows run on `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`,
  `pnpm/action-setup@v6`, `softprops/action-gh-release@v3` (Node 24) and `ubuntu-26.04` (pinned instead of `ubuntu-latest`).

## [22.0.0] - 2026-11-06

Complete rebuild for Angular 22 and nest-server 12.5, the Angular counterpart of `@lenne.tech/nuxt-extensions` 1.25.0.
Nothing of the 18.x API is kept; see [migration-guides/18.x-to-22.0.0.md](migration-guides/18.x-to-22.0.0.md).

### Added

- Angular 22.2 workspace: library `projects/ng-base` (ng-packagr, partial compilation) and an SSR `playground` app.
- Core `@lenne.tech/ng-base`: `provideLtNgBase()`, runtime configuration from the `NG_*` environment per request
  (`REQUEST_CONTEXT` on the server, `<script id="ng-runtime-config">` in the browser), `LtApiUrlService` (SSR, dev proxy),
  shared `LT_FETCH`, SSR-aware `LtCookieService`, `ltSha256` and base64url helpers, `tw`, signal-based `LtI18nService`
  with de/en texts and an adapter token (each entry point registers its texts on first use, so only `lt.error.*` is in
  the initial bundle), `LtToastService` bridge, `LtErrorTranslationService` (`#LTNS_xxxx`), API URL
  check, pre-hydration input preservation and a pre-hydration submit guard.
- `/auth`: Better Auth client (`better-auth/client`) with SHA-256 hashing of every credential, `LtAuthService` with
  signals, cookie/JWT dual mode with JWT switch and refresh (also nest-server's real JWT mode `cookies: false`: JWTs from
  sign-in, 2FA and passkey answers, refreshed before expiry with themselves as bearer), 2FA, passkeys (nest-server `challengeId`), password
  change/reset, email verification, feature flags (SSR → browser), roles, sign-out hooks, `ltAuthInterceptor`,
  `ltAuthGuard`, `ltGuestGuard()`, `ltRoleGuard()`, `ltSystemSetupGuard`, `LtSystemSetupService`. The Better Auth client is
  loaded on the first auth action (`getClient()`), so guards, interceptor and session validation stay out of the
  initial bundle.
- `/auth/provide`: `provideLtAuth()`, `ltAuthInterceptor`, the guards, `LtAuthStore` (session signals, cookie/JWT
  transport, session validation, sign-out without Better Auth) and `LtSystemSetupService` in an own entry point, so
  `app.config.ts` and the routes keep `LtAuthService` and Better Auth out of the initial bundle; `/auth` re-exports it.
- `/ui`: Spartan UI 1.9 helm layer (style vega, generated by `scripts/generate-helm.mjs`), lenne.Tech palette and theme
  for Tailwind CSS 4 (`theme.css` with every component, or `core.css` plus per-component `components/<name>.css`
  generated from the sources), `LtOverlayService` (`injectLtOverlayData()`, `injectLtOverlayRef()`, `confirm()`),
  `provideLtUiOverlayDefaults()` for route-level overlay defaults,
  transitions for `animate.enter`/`animate.leave`, and `lt-*` components (breadcrumb, page title, form field, text field with unit and
  ENTER action, password input, read-only field, notice, toolbar, data view table/tiles, date and date-time picker,
  select/combobox, header, navigation menu with external links, footer, page card), Signal Forms compatible.
- `/ui/provide`: `provideLtUi()` (CDK overlay defaults, Sonner toasts loaded lazily, color mode at bootstrap) and
  `LtColorModeService`, in an own entry point so `app.config.ts` does not pull the component layer into the initial bundle.
- `/files`: `injectLtTusUpload()` (TUS, default endpoint `/tus`, `X-File-Id`, Bearer in JWT mode), `LtFileService`
  (URLs resolved against the API). `/files/ui`: `<lt-tus-upload>`.
- `/share`: `LtShareService`.
- `/ai`: all AI services of nest-server (prompt, SSE stream, chat, connections, settings, status, usage, prompts,
  placeholders, admin).
- `/sync`: offline sync (IndexedDB store, outbox, protocol engine, hint stream, BroadcastChannel, Web Locks) with
  `injectLtOfflineSync()`.
- `/bug`, `/bug/provide` and `/bug/server`: bug reporter, the counterpart of `@lenne.tech/bug.lt` 1.6.9: `provideLtBug()`
  and `LT_BUG_ACTIVE` in `/bug/provide` (runtime decision, off in production, fail closed without `NG_PUBLIC_APP_ENV`;
  nothing of the reporter in the initial bundle, production loads none of it), redacted capture of console, `fetch`/XHR, user
  journey and errors, `<lt-bug-report>` with a lazily loaded dialog and optional screenshots (`modern-screenshot`), and
  `ltBugReport()` creating Linear issues with screenshot and attachments (`NG_LINEAR_API_KEY`, `NG_LINEAR_TEAM_NAME`,
  `NG_LINEAR_PROJECT_NAME`).
- `/server`: `ltAngularRequestHandler()`, `readLtRequestContext()`, security headers, HTML cache headers, security.txt,
  build identity, same-origin API proxy.
- `/testing`: Playwright helpers incl. Angular hydration wait, TOTP, `createTestUser()`, `loginTestUser()`.
- `/utils`: `LtSeoService`, `LtStorageService`, `LtScrollService`, form helpers, `LtStandard` / `ltMap()`.
- Tooling: Vitest unit tests per service, Playwright E2E of the playground against nest-server-starter, oxlint + oxfmt,
  `check` script, version sync, package manifest check, Angular CLI baseline check, CI and publish workflows.

### Removed

- Everything of 18.x: Apollo/GraphQL services, GraphQL introspection meta, legacy JWT `AuthService`, class guards,
  `BaseModule.forRoot`, Bootstrap components, CMS and prototype modules, Storybook, Karma/Jasmine.
