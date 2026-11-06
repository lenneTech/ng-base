import { inject, InjectionToken, isDevMode } from '@angular/core';
import { LT_RUNTIME_CONFIG } from '@lenne.tech/ng-base';

import type { LtBugOptions } from './bug-types';

/** Options passed to `provideLtBug()`; `null` when the provider is missing (the reporter stays off). */
export const LT_BUG_INPUT_OPTIONS = new InjectionToken<LtBugOptions | null>('LT_BUG_INPUT_OPTIONS', { factory: () => null });

/** Dev mode flag used for the fail-closed decision (a token so tests can simulate a production build). */
export const LT_BUG_DEV_MODE = new InjectionToken<boolean>('LT_BUG_DEV_MODE', { factory: () => isDevMode() });

/**
 * Whether the bug reporter is on in this app and stage: `provideLtBug()` is present and the runtime decision
 * ({@link isLtBugActive}) says on. The same on the server and in the browser (no hydration mismatch), so the app
 * shell can keep the reporter's chunk out of production entirely:
 *
 * @example app.html
 * @if (bugActive) { @defer (on immediate) { <lt-bug-report /> } }
 */
export const LT_BUG_ACTIVE = new InjectionToken<boolean>('LT_BUG_ACTIVE', {
  factory: () => {
    const options = inject(LT_BUG_INPUT_OPTIONS);
    if (options === null) {
      return false;
    }
    // Only `enabled` matters here (runtime `lt.bug.enabled` over the code option), so the defaults and the option
    // resolution stay in the lazy `@lenne.tech/ng-base/bug`.
    const runtime = inject(LT_RUNTIME_CONFIG, { optional: true });
    const runtimeEnabled = (runtime?.lt?.['bug'] as { enabled?: unknown } | undefined)?.enabled;
    const enabled = typeof runtimeEnabled === 'boolean' ? runtimeEnabled : options.enabled;
    return isLtBugActive({ enabled }, runtime?.appEnv, inject(LT_BUG_DEV_MODE));
  },
});

/**
 * Whether the reporter is active (decided at runtime, so one build serves every stage):
 *
 * 1. `enabled` set explicitly wins.
 * 2. App env (`NG_PUBLIC_APP_ENV`) `production` / `prod` → off, any other value → on.
 * 3. No app env → only in dev mode (`isDevMode()`): a production build without the variable fails closed.
 */
export function isLtBugActive(options: Pick<LtBugOptions, 'enabled'>, appEnv: unknown, devMode: boolean): boolean {
  if (typeof options.enabled === 'boolean') {
    return options.enabled;
  }
  const env = typeof appEnv === 'string' ? appEnv.trim().toLowerCase() : '';
  if (!env) {
    return devMode;
  }
  return env !== 'production' && env !== 'prod';
}
