import { isPlatformServer } from '@angular/common';
import { inject, makeEnvironmentProviders, PLATFORM_ID, provideAppInitializer, type EnvironmentProviders } from '@angular/core';
import { LT_FETCH, type LtFetch } from '@lenne.tech/ng-base';

import { LT_AUTH_INPUT_OPTIONS, type LtAuthOptions } from './auth-options';
import { LtAuthStore } from './auth-store';

/**
 * Auth providers: options, the auth-aware `LT_FETCH` (Bearer in JWT mode, JWT switch/refresh, session-loss handling)
 * used by error translation, AI, sync and the Better Auth client, session validation and feature flags at startup
 * (features fetched on the server and transferred), and the user restored from the auth-state cookie.
 *
 * Startup: the server fetches the feature flags (bounded, anonymous) before rendering and transfers them; the browser
 * takes them from `TransferState` (fetching only when nothing was transferred) and validates the session in the
 * background, so the first render is never held up by the backend.
 *
 * Add `ltAuthInterceptor` to `provideHttpClient(withInterceptors([...]))` for `HttpClient` calls (generated API client).
 */
export function provideLtAuth(options: LtAuthOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: LT_AUTH_INPUT_OPTIONS, useValue: options },
    {
      provide: LT_FETCH,
      useFactory: (): LtFetch => {
        const auth = inject(LtAuthStore);
        return (input, init) => auth.fetchWithAuth(input, init);
      },
    },
    provideAppInitializer(() => {
      const auth = inject(LtAuthStore);
      if (isPlatformServer(inject(PLATFORM_ID))) {
        return auth.ensureFeatures().then(() => undefined);
      }
      void auth.ensureFeatures();
      void auth.validateSession();
      return undefined;
    }),
  ]);
}
