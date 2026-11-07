# Versioning Strategy

## Version Schema: `MAJOR.MINOR.PATCH`

The same scheme in every lenne.Tech base repository, modelled on `@lenne.tech/nest-server` (repo owner, 2026-11-07).

| Part    | Meaning                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| `MAJOR` | Mirrors the Angular major version (`22.x.x` = Angular 22)                                                       |
| `MINOR` | A change an app has to act on when it updates (behaviour, code or configuration), always with a migration guide |
| `PATCH` | Improvements (bugfixes) or additions (new features) an app takes over without doing anything                    |

## Examples

- `22.0.0` -> Initial release for Angular 22 (the rebuild)
- `22.1.0` -> A change apps have to migrate, with `migration-guides/22.0.x-to-22.1.0.md`
- `22.1.5` -> Bugfix or new feature (drop-in)

## Important Rules

0. **Never promote a breaking change to a MAJOR.** The MAJOR digit states which Angular major this package targets
   and moves only when Angular does. A removed export, a changed signature, a renamed `NG_*` variable, a new required
   provider, a peer dependency an app has to add: all of them are MINOR releases here, however big they feel.
1. **Every MINOR release ships a migration guide** in `migration-guides/` and names it in its `CHANGELOG.md` section.
   A change that needs no action from an app is a PATCH, not a MINOR.
2. **ng-base-starter carries the same version.** Every ng-base version published to npm is followed by an
   ng-base-starter release with the same number that pins it, also when the bump is the only change. The starter
   follows ng-base, never the other way round.
3. **22.0.3 does not exist for ng-base.** The starter had released 22.0.3 (pinning ng-base 22.0.2) before rule 2; the
   next ng-base release is 22.0.4 and its `CHANGELOG.md` section says so. Remove this rule once 22.0.4 is out.
4. **Consider downstream impact**: apps consume ng-base via npm and as a vendored copy in `src/core/`.

## Release Process

1. Make changes; `pnpm run check` must pass
2. Bump `version` in the root `package.json`, then `pnpm run version:sync` (writes `projects/ng-base/package.json` and
   `LT_NG_BASE_VERSION`); `pnpm run version:check` is part of `check:raw`
3. Move the `[Unreleased]` section of `CHANGELOG.md` to `[<version>] - <date>`; for a MINOR add the migration guide
4. Commit, create the annotated tag `v<version>`, push both; `.github/workflows/publish.yml` publishes `dist/ng-base`
   to npm with provenance and creates the GitHub release from the CHANGELOG section
5. Release ng-base-starter with the same version (rule 2); `/lt-dev:publish ng-base` runs steps 2 to 5
