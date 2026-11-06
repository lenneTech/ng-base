import { DOCUMENT, isPlatformServer } from '@angular/common';
import { computed, inject, InjectionToken, Injector, makeStateKey, PLATFORM_ID, Service, signal, TransferState, type Signal } from '@angular/core';
import { Router } from '@angular/router';
import { isLtAbsoluteUrl, LT_RUNTIME_CONFIG, ltCredentialsFetch, LtApiUrlService } from '@lenne.tech/ng-base';

import { LT_AUTH_OPTIONS } from './auth-options';
import { isLtJwtShaped, LtAuthStateService, ltJwtExpiresWithin } from './auth-state';
import type { LtAuthCallOptions, LtAuthFeatures, LtAuthMode, LtUser, LtUserInput } from './auth-types';
import { isLtApiRequest, isLtAuthEndpoint, LT_AUTH_PUBLIC_PATHS, ltRequestUrl, ltUrlRequiresCookies } from './auth-urls';
import { createLtSessionLossDetector } from './session-loss';

/**
 * Hooks around `signOut()`. `provideLtSync()` registers one that flushes the offline outbox before the session ends and
 * deletes the IndexedDB afterwards; projects can add their own (multi provider).
 */
export interface LtAuthSignOutHook {
  /** Runs before `POST /iam/sign-out` with the id of the signed-in user (errors are logged, never block sign-out). */
  beforeSignOut?(userId: string | null): Promise<void> | void;
  /** Runs after the local state was cleared. */
  afterSignOut?(): Promise<void> | void;
}

/** Sign-out hooks (multi). */
export const LT_AUTH_SIGN_OUT_HOOKS = new InjectionToken<LtAuthSignOutHook[]>('LT_AUTH_SIGN_OUT_HOOKS', { factory: () => [] });

/** TransferState key of the feature flags fetched during SSR. */
export const LT_AUTH_FEATURES_STATE_KEY = makeStateKey<LtAuthFeatures>('lt-auth-features');

/** Upper bound for `validateSession()` waiting on `GET /iam/get-session`. */
export const LT_VALIDATE_SESSION_TIMEOUT_MS = 10_000;

/**
 * A JWT that expires within this margin is refreshed before it is sent (nest-server's JWTs live 15 minutes; with
 * `cookies: false` there is no session cookie to mint a new one once it has expired).
 */
export const LT_JWT_REFRESH_MARGIN_MS = 60_000;

/** Upper bound for `GET /iam/features` (keeps a slow API from holding the SSR response). */
const FEATURES_TIMEOUT_MS = 5000;

/**
 * Authorization keys the session owns. A key the session omits is dropped from the merged user (fail-closed), so a
 * backend downgrade (role removed, ban) is never masked by a stale cached value.
 */
const AUTHZ_KEYS = ['banExpires', 'banReason', 'banned', 'emailVerified', 'role', 'roles', 'twoFactorEnabled'] as const satisfies readonly (keyof LtUser)[];

/** What a sign-in / sign-up answer says (nest-server's own shape and Better Auth's native one). */
export interface LtAuthAnswer {
  /** Sign-up with email verification: nest-server revoked the session, nobody is signed in yet. */
  emailVerificationRequired: boolean;
  /** A JWT the server put into the body on purpose (`cookies: false` or `exposeTokenInBody` with the JWT plugin). */
  jwt: string | null;
  /** The answer proves a session (`success: true`, a token or a session object) and reports no failure. */
  session: boolean;
  /** A second factor is required (`requiresTwoFactor` from nest-server, `twoFactorRedirect` from Better Auth). */
  twoFactor: boolean;
  user: LtUserInput | null;
}

/**
 * Read a sign-in / sign-up answer, either the Better Auth client envelope (`{ data, error }`) or a raw body.
 *
 * nest-server answers `{ requiresTwoFactor, success, user }` (the token is removed from the body while cookies are on),
 * `{ requiresTwoFactor: true, success: false }` when 2FA is required and `{ emailVerificationRequired: true, user }`
 * after a sign-up whose session it revoked. Better Auth's native answers carry `twoFactorRedirect` or
 * `{ token: <opaque session token>, user }`. Only a JWT-shaped body token counts as JWT: an opaque session token never
 * becomes a bearer kept in a script-readable cookie.
 */
export function readLtAuthAnswer(result: unknown): LtAuthAnswer {
  const outer = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
  const data = (outer['data'] && typeof outer['data'] === 'object' ? outer['data'] : {}) as Record<string, unknown>;
  const pick = (key: string): unknown => data[key] ?? outer[key];
  const token = pick('token');
  const user = pick('user');
  const sessionObject = pick('session');
  const failed = !!outer['error'] || pick('success') === false;
  const proven = pick('success') === true || (typeof token === 'string' && !!token) || (!!sessionObject && typeof sessionObject === 'object');
  return {
    emailVerificationRequired: pick('emailVerificationRequired') === true,
    jwt: isLtJwtShaped(token) ? token : null,
    session: proven && !failed,
    twoFactor: pick('requiresTwoFactor') === true || pick('twoFactorRedirect') === true,
    user: user && typeof user === 'object' ? (user as LtUserInput) : null,
  };
}

/**
 * The light half of authentication: session state, transport and session validation, without Better Auth.
 *
 * Guards, `ltAuthInterceptor`, `provideLtAuth()` (and through it `LT_FETCH`) and offline sync use this store, so an
 * app's initial bundle carries no passkey, 2FA or Better Auth code. `LtAuthService` (`@lenne.tech/ng-base/auth`)
 * exposes the same state and methods and adds the Better Auth flows; both read and write the same signals.
 *
 * State is signal-based and backed by the client-readable `lt-auth-state` cookie, so SSR renders the signed-in shell
 * from the request cookie (UI gating only; the session itself is the httpOnly `iam.session_token`). Transport: session
 * cookie first; when cookies do not work (401 while the state says signed in) the store switches to JWT mode
 * (`GET /iam/token`, Bearer header) and refreshes a stale JWT once per burst. nest-server with `cookies: false` answers
 * every sign-in with a JWT, which puts the store into JWT mode directly; session checks never change the mode, and a
 * JWT close to its expiry is refreshed with itself as bearer before it is sent.
 */
@Service()
export class LtAuthStore {
  private readonly api = inject(LtApiUrlService);
  private readonly authState = inject(LtAuthStateService);
  private readonly options = inject(LT_AUTH_OPTIONS);
  private readonly runtimeConfig = inject(LT_RUNTIME_CONFIG, { optional: true });
  private readonly transferState = inject(TransferState);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly signOutHooks = inject(LT_AUTH_SIGN_OUT_HOOKS);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));

  // ── state ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** A non-JWT value in the JWT cookie (opaque session token from an older version) is deleted before anything reads it. */
  private readonly purgedInvalidJwt = this.authState.purgeInvalidJwt();
  private readonly initialState = this.authState.readState();
  private readonly transferredFeatures = this.isServer ? null : this.transferState.get(LT_AUTH_FEATURES_STATE_KEY, null);
  private readonly userState = signal<LtUser | null>(this.initialState?.user ?? null);
  private readonly modeState = signal<LtAuthMode>(this.initialState?.authMode === 'jwt' ? 'jwt' : 'cookie');
  private readonly loadingState = signal(false);
  private readonly featuresState = signal<LtAuthFeatures>(this.transferredFeatures ?? {});
  private featuresLoaded = this.transferredFeatures !== null;
  private featuresRequest: Promise<LtAuthFeatures> | null = null;
  /** In-flight `GET /token` shared by every 401 of a burst (cookie → JWT switch and stale-JWT refresh alike). */
  private jwtMint: Promise<string | null> | null = null;
  private readonly sessionLoss = createLtSessionLossDetector(
    {
      clearUser: () => this.clearUser(),
      currentUrl: () => this.currentUrl(),
      isAuthenticated: () => this.isAuthenticated(),
      isJwtMode: () => this.isJwtMode(),
      navigate: (url) => this.navigate(url),
      probeSession: () => this.fetchWithAuth(this.authUrl('/get-session'), { method: 'GET' }),
      switchToJwtMode: () => this.switchToJwtMode(),
    },
    {
      enabled: this.options.interceptor.enabled,
      loginPath: this.options.loginPath,
      publicPaths: [
        ...new Set([
          ...LT_AUTH_PUBLIC_PATHS,
          ...this.options.interceptor.publicPaths,
          this.options.loginPath,
          this.options.twoFactorRedirectPath,
          this.options.systemSetup.setupPath,
        ]),
      ],
    },
  );

  /** Signed-in user (from the auth-state cookie, refreshed by `validateSession()` and every sign-in). */
  readonly user: Signal<LtUser | null> = this.userState.asReadonly();
  /** Whether a user is signed in (UI gating; the backend decides). */
  readonly isAuthenticated = computed(() => !!this.userState());
  /** Current transport. */
  readonly authMode: Signal<LtAuthMode> = this.modeState.asReadonly();
  /** Whether the JWT fallback is active. */
  readonly isJwtMode = computed(() => this.modeState() === 'jwt');
  /** Whether a sign-in/up/out or passkey flow is running. */
  readonly isLoading: Signal<boolean> = this.loadingState.asReadonly();
  /** Whether the user has the `admin` role (UX gate only). */
  readonly isAdmin = computed(() => hasLtRole(this.userState(), 'admin'));
  /** Whether two-factor authentication is enabled for the user. */
  readonly is2FAEnabled = computed(() => !!this.userState()?.twoFactorEnabled);
  /** nest-server feature flags (`GET /iam/features`); fetched on the server and transferred to the browser. */
  readonly features: Signal<LtAuthFeatures> = this.featuresState.asReadonly();
  /** Whether passkeys can be used: enabled in the options, backend feature on and WebAuthn available in this browser. */
  readonly passkeySupported = computed(() => this.options.enablePasskey && !!this.featuresState()['passkey'] && typeof globalThis.PublicKeyCredential !== 'undefined');

  /** The current JWT (JWT mode only), or `null`. */
  jwtToken(): string | null {
    return this.isJwtMode() ? this.authState.getJwtToken() : null;
  }

  // ── roles ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** `user.role === role` or `user.roles` contains it (case-sensitive). */
  hasRole(role: string): boolean {
    return hasLtRole(this.userState(), role);
  }

  /** Whether the user has any of the roles. */
  hasAnyRole(...roles: string[]): boolean {
    return roles.some((role) => hasLtRole(this.userState(), role));
  }

  // ── features ───────────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Fetch the feature flags (`GET /iam/features`, anonymous). One request in flight at a time; errors keep the last
   * known flags. On the server the result is put into `TransferState` for the browser. SSR without API URL: no fetch.
   */
  fetchFeatures(): Promise<LtAuthFeatures> {
    if (this.isServer && this.api.resolve().missing) {
      return Promise.resolve(this.featuresState());
    }
    if (!this.featuresRequest) {
      this.featuresRequest = this.loadFeatures().finally(() => {
        this.featuresRequest = null;
      });
    }
    return this.featuresRequest;
  }

  /** The feature flags, fetched at most once (transferred from SSR, or fetched on first call). */
  ensureFeatures(): Promise<LtAuthFeatures> {
    return this.featuresLoaded ? Promise.resolve(this.featuresState()) : this.fetchFeatures();
  }

  // ── session ────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Store the user in state and cookie (browser always; SSR never writes). `image: null` becomes `undefined`. */
  setUser(user: LtUserInput | null, mode: LtAuthMode = 'cookie'): void {
    const normalised: LtUser | null = user ? ({ ...user, image: user.image ?? undefined } as LtUser) : null;
    this.userState.set(normalised);
    this.modeState.set(mode);
    this.authState.writeState({ authMode: mode, user: normalised });
  }

  /** Clear local auth state and cookies (browser). Does not delete offline data (use `signOut()` for that). */
  clearUser(): void {
    this.userState.set(null);
    this.modeState.set('cookie');
    this.authState.clearAuthCookies();
  }

  /**
   * Sign out: sign-out hooks (offline sync flush), `POST /iam/sign-out`, local state cleared, after-hooks (sync wipe).
   * The request is a plain {@link fetchWithAuth} call, so signing out never loads Better Auth. The local state is
   * cleared even when the request fails (offline device): the failure is logged, not thrown.
   */
  async signOut(options?: LtAuthCallOptions): Promise<void> {
    this.loadingState.set(true);
    try {
      const userId = this.userState()?.id;
      for (const hook of this.signOutHooks) {
        await runHook(() => hook.beforeSignOut?.(userId ? String(userId) : null), 'beforeSignOut');
      }
      try {
        await this.fetchWithAuth(this.authUrl('/sign-out'), {
          body: '{}',
          credentials: 'include',
          headers: { ...options?.headers, 'content-type': 'application/json' },
          method: 'POST',
          signal: options?.signal,
        });
      } catch (error) {
        console.error('[@lenne.tech/ng-base] The sign-out request failed; the local session is cleared anyway:', error);
      }
      this.clearUser();
      for (const hook of this.signOutHooks) {
        await runHook(() => hook.afterSignOut?.(), 'afterSignOut');
      }
    } finally {
      this.loadingState.set(false);
    }
  }

  /**
   * Validate the session (app start / hard reload). Server: answers from the cookie, no backend call. Browser:
   * `GET /iam/get-session` (≤ 10 s, plain {@link fetchWithAuth}); a user is merged with the cached one
   * (nest-server-only fields kept, authz keys fail-closed); no user but a cached one → `true` (e.g. right after 2FA);
   * else `false`.
   */
  async validateSession(): Promise<boolean> {
    if (this.isServer) {
      return !!this.cachedUser();
    }
    try {
      const session = await withTimeout(this.fetchSession(), LT_VALIDATE_SESSION_TIMEOUT_MS);
      const sessionUser = session?.user;
      if (sessionUser) {
        // The answer proves the session, not the transport: keep the mode (a bearer-proven session stays in JWT mode).
        this.setUser(this.mergeSessionUser(sessionUser), this.modeState());
        if (!this.isJwtMode()) {
          this.prefetchJwt();
        }
        return true;
      }
      const cached = this.cachedUser();
      if (cached) {
        if (!this.userState()) {
          this.userState.set(cached);
        }
        this.prefetchJwt();
        return true;
      }
      return false;
    } catch {
      return !!this.cachedUser();
    }
  }

  /**
   * The auth-aware fetch (also provided as `LT_FETCH` by `provideLtAuth()` and used by the Better Auth client).
   *
   * For API URLs (see {@link isLtApiRequest}): cookie mode sends `credentials: 'include'`; JWT mode adds
   * `Authorization: Bearer` and omits cookies except for passkey/2FA/`get-session` (an explicit `init.credentials`
   * wins). On a 401 while signed in: cookie mode → switch to JWT and retry once; JWT mode → one shared refresh per
   * burst and retry once. A 401 that survives is handed to the session-loss detection. Auth-flow endpoints
   * (sign-in, 2FA, …) are never retried: their 401 is the flow's verdict. Other URLs are fetched unchanged (no token).
   */
  async fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const url = ltRequestUrl(input);
    if (!isLtApiRequest(url, this.api.resolve().baseUrl, this.document.location?.origin)) {
      return ltCredentialsFetch(input, init);
    }
    const ownAuthorization = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined)).has('Authorization');
    const sentToken = !ownAuthorization && this.isJwtMode() ? await this.currentJwt() : null;
    const retryInput = input instanceof Request ? input.clone() : input;
    const response = await this.send(input, init, url, sentToken, this.isJwtMode());
    if (response.status !== 401) {
      return response;
    }
    const freshToken = ownAuthorization ? null : await this.recoverFrom401(url, sentToken);
    const final = freshToken ? await this.send(retryInput, init, url, freshToken, true) : response;
    if (final.status === 401) {
      void this.handleUnauthorized(url);
    }
    return final;
  }

  /**
   * Token to retry a request with after a 401, or `null` when no retry makes sense (server, auth-flow endpoint, not
   * signed in, cookie-bound path in JWT mode, no token obtainable). `sentToken` is the bearer the request carried
   * (`null` in cookie mode). Used by {@link fetchWithAuth} and `ltAuthInterceptor`.
   */
  async recoverFrom401(url: string, sentToken: string | null): Promise<string | null> {
    if (this.isServer || isLtAuthEndpoint(url) || !this.isAuthenticated()) {
      return null;
    }
    if (sentToken && ltUrlRequiresCookies(url)) {
      return null;
    }
    const current = this.jwtToken();
    if (current && current !== sentToken) {
      // A parallel request already switched or refreshed.
      return current;
    }
    return this.mintJwt();
  }

  /** Session-loss handling for a 401 from `url` (see `LtUnauthorizedHandler`). */
  handleUnauthorized(url?: string): Promise<boolean> {
    if (this.isServer) {
      return Promise.resolve(false);
    }
    return this.sessionLoss.handle(url);
  }

  /** `GET /iam/token` → store the JWT and switch to JWT mode. One request per burst. Browser only. */
  async switchToJwtMode(): Promise<boolean> {
    return !!(await this.mintJwt());
  }

  /** Re-mint the JWT (JWT mode only). */
  async refreshJwtToken(): Promise<boolean> {
    if (!this.isJwtMode() || !this.authState.getJwtToken()) {
      return false;
    }
    return !!(await this.mintJwt());
  }

  /**
   * Build an absolute app URL from `NG_PUBLIC_SITE_URL` (or the browser origin), for `redirectTo` / `callbackURL`.
   * Never derived from the request: on the server without a site URL it throws. Absolute input is returned unchanged.
   */
  absoluteAppUrl(path: string): string {
    if (isLtAbsoluteUrl(path)) {
      return path;
    }
    const origin = this.isServer ? '' : this.document.location?.origin;
    const base = (this.runtimeConfig?.siteUrl || (origin && origin !== 'null' ? origin : '')).replace(/\/+$/, '');
    if (!base) {
      throw new Error('[@lenne.tech/ng-base] absoluteAppUrl: no site URL known. Set NG_PUBLIC_SITE_URL.');
    }
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  // ── plumbing for LtAuthService (@lenne.tech/ng-base/auth) ──────────────────────────────────────────────────────────
  /** Full URL of a Better Auth route (`/get-session` → `<api>/iam/get-session`). */
  authUrl(path: string): string {
    const basePath = (this.options.basePath || '/iam').replace(/\/+$/, '');
    return this.api.buildUrl(`${basePath.startsWith('/') ? basePath : `/${basePath}`}${path}`);
  }

  /** Run `task` with `isLoading()` set. */
  async withLoading<T>(task: () => Promise<T>): Promise<T> {
    this.loadingState.set(true);
    try {
      return await task();
    } finally {
      this.loadingState.set(false);
    }
  }

  /**
   * Apply a sign-in / sign-up answer (see {@link readLtAuthAnswer}). No user is set when a second factor or an email
   * verification is pending, or when the answer proves no session. A JWT-shaped body token → JWT mode; otherwise
   * cookie mode plus a background JWT from `GET /iam/token` (cookie stays primary). `true` when a user was set.
   */
  applyAuthResult(result: unknown): boolean {
    const answer = readLtAuthAnswer(result);
    if (answer.twoFactor || answer.emailVerificationRequired || !answer.session || !answer.user) {
      return false;
    }
    if (answer.jwt) {
      this.authState.setJwtToken(answer.jwt);
      this.setUser(answer.user, 'jwt');
      return true;
    }
    this.setUser(answer.user, 'cookie');
    this.prefetchJwt();
    return true;
  }

  /**
   * Take a session another flow already proved (2FA verification, passkey sign-in), as after a password sign-in:
   * a JWT-shaped `token` in the answer (nest-server with `cookies: false` or `exposeTokenInBody`) → JWT mode; otherwise
   * cookie mode plus a background JWT. Any other token is Better Auth's opaque session token and is never kept. An
   * answer without user loads it from `GET /iam/get-session` (with the bearer in JWT mode). Resolves to the user, or
   * `undefined` when no session could be loaded (local state then stays signed out).
   */
  async adoptVerifiedSession(result: unknown): Promise<LtUser | undefined> {
    const { jwt, user } = readLtAuthAnswer(result);
    const mode: LtAuthMode = jwt && this.authState.setJwtToken(jwt) ? 'jwt' : 'cookie';
    if (user) {
      this.setUser(user, mode);
      if (mode === 'cookie') {
        this.prefetchJwt();
      }
      return this.userState() ?? undefined;
    }
    this.modeState.set(mode);
    const loaded = await this.loadSessionUser(mode);
    if (!loaded) {
      this.clearUser();
    }
    return loaded;
  }

  /**
   * Load the user via `GET /iam/get-session`, merge it with the cached one and store it, in `mode` (default: the
   * current mode; the session answer proves the session, not the transport).
   */
  async loadSessionUser(mode: LtAuthMode = this.modeState()): Promise<LtUser | undefined> {
    try {
      const data = await this.fetchSession();
      if (!data?.user) {
        return undefined;
      }
      this.setUser(this.mergeSessionUser(data.user), mode);
      if (mode === 'cookie') {
        this.prefetchJwt();
      }
      return this.userState() ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * The JWT to send (JWT mode only, else `null`), refreshed first when it expires within
   * {@link LT_JWT_REFRESH_MARGIN_MS} (one refresh per burst; the old token is kept when the refresh fails).
   */
  async currentJwt(): Promise<string | null> {
    const token = this.jwtToken();
    return this.jwtNeedsRefresh() ? ((await this.mintJwt()) ?? token) : token;
  }

  /** Whether the JWT of JWT mode expires within {@link LT_JWT_REFRESH_MARGIN_MS} (browser only). */
  jwtNeedsRefresh(): boolean {
    const token = this.jwtToken();
    return !!token && !this.isServer && ltJwtExpiresWithin(token, LT_JWT_REFRESH_MARGIN_MS);
  }

  /**
   * Navigate to `path` and keep the `redirect` query parameter of the current URL (login → 2FA must not lose where the
   * user wanted to go). A `redirect` already in `path` wins; only app-relative targets (`/…`, not `//…`) are kept.
   */
  navigateKeepingRedirect(path: string): void {
    const router = this.injector.get(Router, null);
    const current = router ? router.parseUrl(router.url).queryParams['redirect'] : new URLSearchParams(this.document.location?.search ?? '').get('redirect');
    const redirect = typeof current === 'string' && current.startsWith('/') && !current.startsWith('//') ? current : null;
    if (!redirect || /[?&]redirect=/.test(path)) {
      this.navigate(path);
      return;
    }
    this.navigate(`${path}${path.includes('?') ? '&' : '?'}redirect=${encodeURIComponent(redirect)}`);
  }

  /** Navigate within the app (Router when available, else a full page load in the browser). */
  navigate(url: string): void {
    const router = this.injector.get(Router, null);
    if (router) {
      void router.navigateByUrl(url).catch((error: unknown) => console.error('[@lenne.tech/ng-base] Navigation failed:', error));
      return;
    }
    if (!this.isServer) {
      this.document.location.assign(url);
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Merge a session user onto the cached user of the SAME identity: nest-server-only fields survive, authorization
   * keys always reflect the session. A different / absent / id-less identity yields the session user verbatim.
   */
  private mergeSessionUser(sessionUser: LtUser): LtUser {
    const cached = this.cachedUser();
    if (!cached?.id || !sessionUser?.id || cached.id !== sessionUser.id) {
      return sessionUser;
    }
    const merged: Record<string, unknown> = { ...cached, ...sessionUser };
    for (const key of AUTHZ_KEYS) {
      if (!(key in sessionUser)) {
        delete merged[key];
      }
    }
    return merged as LtUser;
  }

  /** Cached user: the duplicate-tolerant cookie view, else the in-memory state. */
  private cachedUser(): LtUser | null {
    return this.authState.readUser() ?? this.userState();
  }

  /** `GET /iam/get-session` with the session cookie (bearer too in JWT mode); `null` without a session. */
  private async fetchSession(): Promise<{ session?: unknown; user?: LtUser } | null> {
    const response = await this.fetchWithAuth(this.authUrl('/get-session'), { method: 'GET' });
    if (!response.ok) {
      return null;
    }
    return ((await response.json().catch(() => null)) as { session?: unknown; user?: LtUser } | null) ?? null;
  }

  /** Mint a JWT and switch to JWT mode; one `GET /token` per burst. */
  private mintJwt(): Promise<string | null> {
    if (this.isServer) {
      return Promise.resolve(null);
    }
    if (!this.jwtMint) {
      this.jwtMint = this.requestJwt()
        .then((token) => {
          if (token && this.authState.setJwtToken(token)) {
            this.modeState.set('jwt');
            this.persistState();
            return token;
          }
          return null;
        })
        .finally(() => {
          this.jwtMint = null;
        });
    }
    return this.jwtMint;
  }

  /** Fetch a JWT in the background so it is ready as fallback; keeps the current mode (cookie stays primary). */
  private prefetchJwt(): void {
    if (this.isServer) {
      return;
    }
    void this.requestJwt().then((token) => {
      if (token && this.userState()) {
        this.authState.setJwtToken(token);
      }
    });
  }

  /**
   * `GET <auth>/token` with the session cookie and, in JWT mode, the current JWT as bearer while it is still valid
   * (with `cookies: false` the bearer is the only proof of the session); the token or `null`.
   */
  private async requestJwt(): Promise<string | null> {
    const current = this.jwtToken();
    const bearer = current && !ltJwtExpiresWithin(current, 0) ? current : null;
    try {
      const response = await fetch(this.authUrl('/token'), {
        credentials: 'include',
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
        method: 'GET',
      });
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as { token?: unknown } | null;
      return stringOrNull(data?.token);
    } catch {
      return null;
    }
  }

  private async loadFeatures(): Promise<LtAuthFeatures> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEATURES_TIMEOUT_MS);
    try {
      const response = await fetch(this.authUrl('/features'), { headers: { accept: 'application/json' }, signal: controller.signal });
      if (response.ok) {
        const body: unknown = await response.json();
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          this.featuresState.set(body as LtAuthFeatures);
          this.featuresLoaded = true;
          if (this.isServer) {
            this.transferState.set(LT_AUTH_FEATURES_STATE_KEY, body as LtAuthFeatures);
          }
        }
      }
    } catch {
      // keep the last known flags
    } finally {
      clearTimeout(timer);
    }
    return this.featuresState();
  }

  private send(input: RequestInfo | URL, init: RequestInit, url: string, token: string | null, jwtMode: boolean): Promise<Response> {
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const credentials: RequestCredentials = init.credentials ?? (jwtMode && !ltUrlRequiresCookies(url) ? 'omit' : 'include');
    return fetch(input, { ...init, credentials, headers });
  }

  private persistState(): void {
    this.authState.writeState({ authMode: this.modeState(), user: this.userState() });
  }

  private currentUrl(): string | null {
    const router = this.injector.get(Router, null);
    if (router) {
      return router.url;
    }
    const location = this.document.location;
    return location ? `${location.pathname}${location.search}${location.hash}` : null;
  }
}

/** `user.role === role` or `user.roles` (array) contains it; malformed shapes → `false`. */
export function hasLtRole(user: LtUser | null | undefined, role: string): boolean {
  if (!user || !role) {
    return false;
  }
  return user.role === role || (Array.isArray(user.roles) && user.roles.includes(role));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

async function runHook(hook: () => Promise<void> | void, name: string): Promise<void> {
  try {
    await hook();
  } catch (error) {
    console.error(`[@lenne.tech/ng-base] A sign-out hook (${name}) failed:`, error);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
