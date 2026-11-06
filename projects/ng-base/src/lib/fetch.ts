import { InjectionToken } from '@angular/core';

/** A `fetch`-compatible function. */
export type LtFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * The fetch used by every library call that does not go through `HttpClient`: error translation, system setup,
 * AI (incl. the SSE stream), offline sync and its hint stream, the Better Auth client.
 *
 * The default sends cookies (`credentials: 'include'`). `provideLtAuth()` replaces it with the auth-aware fetch
 * (Bearer token in JWT mode, cookie → JWT switch on 401, stale-JWT refresh, session-loss handling), so SSE and sync
 * get the same auth behaviour as `HttpClient` calls behind `ltAuthInterceptor`.
 */
export const LT_FETCH = new InjectionToken<LtFetch>('LT_FETCH', {
  factory: () => ltCredentialsFetch,
});

/** `fetch` with `credentials: 'include'` unless the caller decided otherwise. */
export const ltCredentialsFetch: LtFetch = (input, init) => fetch(input, { credentials: 'include', ...init });
