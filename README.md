# ng-base

Workspace of [`@lenne.tech/ng-base`](projects/ng-base/README.md), the Angular library of the lenne.Tech stack
(Angular 22, Tailwind CSS 4, Spartan UI, nest-server integration). Template for apps:
[`ng-base-starter`](https://github.com/lenneTech/ng-base-starter).

| Path                   | Content                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `projects/ng-base/`    | The library (primary entry point plus `auth`, `ui`, `files`, `share`, `ai`, `sync`, `server`, `testing`, `utils`) |
| `projects/playground/` | SSR app for library E2E tests against a local nest-server-starter (API :3000, app :3001)                          |
| `scripts/`             | `check`, version sync, package manifest check, Angular baseline check, Spartan helm generator                     |
| `migration-guides/`    | Migration guides per major                                                                                        |

## Development

```bash
pnpm install
pnpm test            # unit tests (Vitest)
pnpm build           # library → dist/ng-base
pnpm dev             # playground on http://localhost:3001 (API proxy → http://localhost:3000)
pnpm test:e2e        # playground E2E (needs nest-server-starter on :3000)
NG_BASE_E2E_AUTH_MODE=jwt pnpm test:e2e   # the same in nest-server's real JWT mode (cookies: false)
pnpm run check       # full gate with auto-fix (check:raw = read-only)
pnpm run check:baseline   # compare the workspace with a fresh Angular CLI scaffold (release gate, after ng update)
```

Test a change in an app (e.g. ng-base-starter): `pnpm build`, then in the app
`"@lenne.tech/ng-base": "file:../ng-base/dist/ng-base"` with `"dependenciesMeta": { "@lenne.tech/ng-base": { "injected": true } }`
and `pnpm install` after every ng-base build. Not `pnpm link`: the symlinked package resolves `@angular/core` from this
workspace, two copies end up in the app and SSR fails with `NG0203`.

## Release

Bump the version in `package.json`, run `pnpm run version:sync`, update `CHANGELOG.md`, commit, create the annotated
tag `v<version>` and push it. The publish workflow runs the gate and publishes `dist/ng-base` to npm with provenance.

## License

MIT, © lenne.Tech GmbH
