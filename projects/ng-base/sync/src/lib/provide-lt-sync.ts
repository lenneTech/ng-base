import { isPlatformBrowser } from '@angular/common';
import { inject, InjectionToken, makeEnvironmentProviders, PLATFORM_ID, provideAppInitializer, type EnvironmentProviders } from '@angular/core';
import { LT_FETCH, LT_RUNTIME_CONFIG, LtApiUrlService, mergeLtFeatureOptions } from '@lenne.tech/ng-base';
import { LT_AUTH_SIGN_OUT_HOOKS, type LtAuthSignOutHook } from '@lenne.tech/ng-base/auth/provide';

import { configureLtSync, flushLtSyncBeforeSignOut } from './sync-engine';
import { deleteLtSyncDatabase } from './sync-store';
import type { LtSyncOptions } from './sync-types';

const LT_SYNC_INPUT_OPTIONS = new InjectionToken<LtSyncOptions>('LT_SYNC_INPUT_OPTIONS', { factory: () => ({}) });

/** Resolved sync options (defaults ← `provideLtSync(options)` ← runtime `NG_PUBLIC_LT_SYNC_*`). */
export const LT_SYNC_OPTIONS = new InjectionToken<Required<LtSyncOptions>>('LT_SYNC_OPTIONS', {
  factory: () => mergeLtFeatureOptions<Required<LtSyncOptions>>({ basePath: '/sync' }, inject(LT_SYNC_INPUT_OPTIONS), inject(LT_RUNTIME_CONFIG, { optional: true })?.lt.sync),
});

/**
 * Offline sync with the nest-server sync module (≥ 12.2.0), opt-in.
 *
 * Configures the framework-free engine (API URL, base path, the auth-aware `LT_FETCH`) and registers a sign-out hook:
 * before `POST /iam/sign-out` the outbox of the signed-in user is flushed (≤ 5 s), afterwards the IndexedDB is deleted,
 * so no record, cursor or unsent change survives a sign-out. Requires `provideLtAuth()`.
 */
export function provideLtSync(options: LtSyncOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: LT_SYNC_INPUT_OPTIONS, useValue: options },
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }
      const api = inject(LtApiUrlService);
      const fetch = inject(LT_FETCH);
      configureLtSync({ basePath: inject(LT_SYNC_OPTIONS).basePath, buildApiUrl: (path) => api.buildUrl(path), fetch: (input, init) => fetch(input, init) });
    }),
    {
      multi: true,
      provide: LT_AUTH_SIGN_OUT_HOOKS,
      useFactory: (): LtAuthSignOutHook => {
        const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
        return {
          afterSignOut: () => (isBrowser ? deleteLtSyncDatabase() : undefined),
          beforeSignOut: (userId) => (isBrowser ? flushLtSyncBeforeSignOut(userId ?? undefined, 5000) : undefined),
        };
      },
    },
  ]);
}
