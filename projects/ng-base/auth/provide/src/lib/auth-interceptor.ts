import { DOCUMENT, isPlatformServer } from '@angular/common';
import { HttpErrorResponse, type HttpEvent, type HttpHandlerFn, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import { LtApiUrlService } from '@lenne.tech/ng-base';
import { catchError, from, type Observable, switchMap, throwError } from 'rxjs';

import { LtAuthStore } from './auth-store';
import { isLtApiRequest } from './auth-urls';

/**
 * Session-loss detection shared by `ltAuthInterceptor` (HttpClient) and the auth-aware `LT_FETCH` (fetch, SSE, sync).
 *
 * On a 401 outside the auth endpoints and public pages while the state says signed in, it probes
 * `GET /iam/get-session` (positive verdict cached 1 s): dead → `clearUser()` and a redirect to
 * `loginPath?redirect=<current url>` (guard held 1 s), alive → nothing (in JWT mode the JWT is re-minted).
 * A probe without verdict (network error, 429, 5xx) never logs out. Server: no-op.
 */
@Service()
export class LtUnauthorizedHandler {
  private readonly auth = inject(LtAuthStore);

  /** Handle a 401 for `url`. Resolves to `true` when the session was found dead and the user was redirected. */
  handle(url?: string): Promise<boolean> {
    return this.auth.handleUnauthorized(url);
  }
}

/**
 * `HttpClient` interceptor for API requests (URLs under the configured API base):
 * sends credentials, adds `Authorization: Bearer` in JWT mode (refreshed first when it is about to expire), retries once after a cookie → JWT switch or a JWT
 * refresh, and hands an unrecoverable 401 to {@link LtUnauthorizedHandler}. A request that brings its own
 * `Authorization` header keeps it and is not retried. Other URLs and server-side requests pass through unchanged.
 *
 * @example provideHttpClient(withInterceptors([ltAuthInterceptor]))
 */
export const ltAuthInterceptor: HttpInterceptorFn = (request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  if (isPlatformServer(inject(PLATFORM_ID))) {
    return next(request);
  }
  const api = inject(LtApiUrlService);
  if (!isLtApiRequest(request.url, api.resolve().baseUrl, inject(DOCUMENT).location?.origin)) {
    return next(request);
  }
  const auth = inject(LtAuthStore);
  const handler = inject(LtUnauthorizedHandler);
  const url = request.urlWithParams;
  const ownAuthorization = request.headers.has('Authorization');
  const authorize = (token: string | null): HttpRequest<unknown> =>
    request.clone(token && !ownAuthorization ? { setHeaders: { Authorization: `Bearer ${token}` }, withCredentials: true } : { withCredentials: true });
  const reportAndRethrow = (error: unknown): Observable<never> => {
    if (isUnauthorized(error)) {
      void handler.handle(url);
    }
    return throwError(() => error);
  };
  const send = (sentToken: string | null): Observable<HttpEvent<unknown>> =>
    next(authorize(sentToken)).pipe(
      catchError((error: unknown) => {
        if (!isUnauthorized(error) || ownAuthorization) {
          return reportAndRethrow(error);
        }
        return from(auth.recoverFrom401(url, sentToken)).pipe(switchMap((token) => (token ? next(authorize(token)).pipe(catchError(reportAndRethrow)) : reportAndRethrow(error))));
      }),
    );
  // In JWT mode a token close to its expiry is refreshed before the request goes out; otherwise it goes out at once.
  return !ownAuthorization && auth.jwtNeedsRefresh() ? from(auth.currentJwt()).pipe(switchMap(send)) : send(ownAuthorization ? null : auth.jwtToken());
};

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}
