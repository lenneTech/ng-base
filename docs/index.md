---
title: ng-base
description: The Angular library of the lenne.tech stack, the counterpart of nuxt-extensions for Angular 22 apps on a nest-server API.
navigation:
  title: Overview
---

`@lenne.tech/ng-base` connects an Angular 22 app to [`@lenne.tech/nest-server`](https://github.com/lenneTech/nest-server):
Better Auth with 2FA, passkeys and social sign-in, TUS uploads, the AI module and offline sync. It also ships a
Spartan-based UI layer for Tailwind CSS 4, SSR server helpers, a bug reporter and Playwright helpers. It is the Angular
counterpart of [`@lenne.tech/nuxt-extensions`](https://github.com/lenneTech/nuxt-extensions).

- Angular `^22.2` (standalone, zoneless, OnPush, signals), Tailwind CSS 4, Spartan UI
- Template for apps: [ng-base-starter](https://github.com/lenneTech/ng-base-starter), created with
  `lt fullstack init --frontend angular`
- Every feature is opt-in through its `provideLt…()` function; entry points you do not import are not bundled

## Entry points

| Import                             | Content                                                                                                                            | Needs nest-server |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `@lenne.tech/ng-base`              | `provideLtNgBase()`, runtime config (`LT_RUNTIME_CONFIG`), `LtApiUrlService`, `LT_FETCH`, cookies, i18n, toasts, error translation | partly            |
| `@lenne.tech/ng-base/auth`         | `LtAuthService` (sign-in and sign-up, 2FA, passkeys, password and e-mail flows), and everything of `/auth/provide`                 | yes               |
| `@lenne.tech/ng-base/auth/provide` | `provideLtAuth()`, `ltAuthInterceptor`, guards, `LtAuthStore`, first-admin setup, without Better Auth                              | yes               |
| `@lenne.tech/ng-base/ui`           | Spartan helm (`Hlm*`), `lt-*` components, overlays, transitions, and everything of `/ui/provide`                                   | no                |
| `@lenne.tech/ng-base/ui/provide`   | `provideLtUi()` (toasts), color mode                                                                                               | no                |
| `@lenne.tech/ng-base/files`        | `provideLtFiles()`, `injectLtTusUpload()`, `LtFileService`                                                                         | yes               |
| `@lenne.tech/ng-base/files/ui`     | `<lt-tus-upload>`                                                                                                                  | yes               |
| `@lenne.tech/ng-base/share`        | `LtShareService` (Web Share API, clipboard fallback)                                                                               | no                |
| `@lenne.tech/ng-base/ai`           | `provideLtAi()`, `LtAiService`, `injectLtAiChat()`, services for connections, settings, usage, prompts and admin                   | yes               |
| `@lenne.tech/ng-base/sync`         | `provideLtSync()`, `injectLtOfflineSync()`                                                                                         | yes               |
| `@lenne.tech/ng-base/bug`          | `<lt-bug-report>`, `LtBugReportService`, and everything of `/bug/provide`                                                          | no                |
| `@lenne.tech/ng-base/bug/provide`  | `provideLtBug()`, `LT_BUG_ACTIVE`                                                                                                  | no                |
| `@lenne.tech/ng-base/bug/server`   | `ltBugReport()`: the report endpoint that creates the Linear issue (Node only)                                                     | –                 |
| `@lenne.tech/ng-base/server`       | `ltAngularRequestHandler()`, `ltSecurityHeaders()`, `ltBuildIdentity()`, `ltApiProxy()` and more (Node only)                       | –                 |
| `@lenne.tech/ng-base/testing`      | Playwright helpers                                                                                                                 | –                 |
| `@lenne.tech/ng-base/utils`        | `LtSeoService`, `LtStorageService`, `LtScrollService`, `ltFocusFirstInvalid()`, `ltMap()`                                          | no                |

## Pages

| Page                                                     | What it covers                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Getting started](./1.getting-started.md)                | Installation, `app.config.ts`, `server.ts` and styles                           |
| [Configuration](./2.configuration.md)                    | The `NG_*` runtime variables and the library texts (de/en)                      |
| [Authentication](./3.authentication.md)                  | `LtAuthService`, guards, JWT and cookie mode, sign-in through a social provider |
| [Working with nest-server](./4.nest-server.md)           | API URLs, requests, SSR, error codes, uploads, AI, offline sync                 |
| [UI](./5.ui.md)                                          | Theme, styles and bundle size, `lt-*` components, overlays and toasts           |
| [Bug reporting](./6.bug-reporting.md)                    | The bug.lt reporter that files issues in Linear                                 |
| [Testing](./7.testing.md)                                | Playwright helpers for E2E tests                                                |
| [Vendor mode](./8.vendor-mode.md)                        | ng-base copied into the app as `src/core/`                                      |
| [Differences to nuxt-extensions](./9.nuxt-extensions.md) | What ng-base does differently on purpose                                        |

## Versions and upgrades

The version follows the scheme of every lenne.tech base repository:

| Part    | Meaning                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------- |
| `MAJOR` | The Angular major (`22.x.x` = Angular 22). It moves only with Angular, never because a change is breaking |
| `MINOR` | A change an app has to act on when it updates, always with a migration guide                              |
| `PATCH` | A fix or addition an app takes over without doing anything                                                |

ng-base-starter carries the same version as the ng-base it pins. The migration guides are in
[`migration-guides/`](https://github.com/lenneTech/ng-base/tree/main/migration-guides), the changes of every release in
the [changelog](https://github.com/lenneTech/ng-base/blob/main/CHANGELOG.md). `22.0.0` is a rebuild; versions up to
`18.x` are reachable through the tag `v18.1.3`.
