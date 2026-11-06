import { inject, Service, type Signal } from '@angular/core';
import { LtApiUrlService, ltArrayBufferToBase64Url, ltBase64UrlToUint8Array } from '@lenne.tech/ng-base';
import {
  LT_AUTH_OPTIONS,
  LtAuthStore,
  readLtAuthAnswer,
  type LtAuthCallOptions,
  type LtAuthFeatures,
  type LtAuthMode,
  type LtAuthResponse,
  type LtNoStrayCredential,
  type LtPasskey,
  type LtPasskeyAuthResult,
  type LtPasskeyRegisterResult,
  type LtTwoFactorEnableResult,
  type LtUser,
  type LtUserInput,
} from '@lenne.tech/ng-base/auth/provide';

import { createLtAuthClient, resolveLtAuthClientBase, type LtAuthClient } from './auth-client';
import { injectLtAuthI18n } from './i18n';

/** Passkey authentication options as nest-server sends them (base64url strings, plus the `challengeId` extension). */
interface LtPasskeyAuthenticationOptions {
  allowCredentials?: { id: string; transports?: string[]; type: string }[];
  challenge: string;
  challengeId?: string;
  rpId?: string;
  timeout?: number;
  userVerification?: UserVerificationRequirement;
}

/** Passkey registration options as nest-server sends them. */
interface LtPasskeyRegistrationOptions {
  attestation?: AttestationConveyancePreference;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  challenge: string;
  challengeId?: string;
  excludeCredentials?: { id: string; transports?: string[]; type: string }[];
  pubKeyCredParams: PublicKeyCredentialParameters[];
  rp: PublicKeyCredentialRpEntity;
  timeout?: number;
  user: { displayName: string; id: string; name: string };
}

/**
 * Authentication against nest-server's Better Auth integration (`/iam`), the Angular counterpart of `useLtAuth()`.
 *
 * A facade over {@link LtAuthStore} (`@lenne.tech/ng-base/auth/provide`): state, transport, session validation and
 * sign-out are the store's (same signals, same methods), this service adds the flows that need Better Auth or WebAuthn
 * — sign-in/up, 2FA, passkeys, password and email. Guards, the interceptor and `provideLtAuth()` use the store only, so
 * this service (and Better Auth, loaded on first use) stays out of the initial bundle until a page injects it.
 *
 * State is signal-based and backed by the client-readable `lt-auth-state` cookie, so SSR renders the signed-in shell
 * from the request cookie (UI gating only; the session itself is the httpOnly `iam.session_token`).
 *
 * Transport: session cookie first; when cookies do not work (401 while the state says signed in) the service switches
 * to JWT mode (`GET /iam/token`, Bearer header) and refreshes a stale JWT once per burst. All credentials are SHA-256
 * hashed before they leave the browser.
 */
@Service()
export class LtAuthService {
  private readonly store = inject(LtAuthStore);
  private readonly api = inject(LtApiUrlService);
  private readonly options = inject(LT_AUTH_OPTIONS);
  private readonly i18n = injectLtAuthI18n();
  private clientRequest: Promise<LtAuthClient> | null = null;

  // ── state (the store's signals) ────────────────────────────────────────────────────────────────────────────────────
  /** Signed-in user (from the auth-state cookie, refreshed by `validateSession()` and every sign-in). */
  readonly user: Signal<LtUser | null> = this.store.user;
  /** Whether a user is signed in (UI gating; the backend decides). */
  readonly isAuthenticated: Signal<boolean> = this.store.isAuthenticated;
  /** Current transport. */
  readonly authMode: Signal<LtAuthMode> = this.store.authMode;
  /** Whether the JWT fallback is active. */
  readonly isJwtMode: Signal<boolean> = this.store.isJwtMode;
  /** Whether a sign-in/up/out or passkey flow is running. */
  readonly isLoading: Signal<boolean> = this.store.isLoading;
  /** Whether the user has the `admin` role (UX gate only). */
  readonly isAdmin: Signal<boolean> = this.store.isAdmin;
  /** Whether two-factor authentication is enabled for the user. */
  readonly is2FAEnabled: Signal<boolean> = this.store.is2FAEnabled;
  /** nest-server feature flags (`GET /iam/features`); fetched on the server and transferred to the browser. */
  readonly features: Signal<LtAuthFeatures> = this.store.features;
  /** Whether passkeys can be used: enabled in the options, backend feature on and WebAuthn available in this browser. */
  readonly passkeySupported: Signal<boolean> = this.store.passkeySupported;

  /**
   * The hashing Better Auth client (see {@link LtAuthClient}), created once per app on first use. Better Auth is loaded
   * lazily (dynamic import), so it is not part of the initial bundle; session state, guards, the interceptor and
   * {@link fetchWithAuth} never need it. The client sends every request through {@link fetchWithAuth} (the same
   * auth-aware fetch as `LT_FETCH`). During SSR it never carries the request's cookies, so do not use it on the
   * server for anything that needs the user's session. A failed load is retried on the next call.
   */
  getClient(): Promise<LtAuthClient> {
    if (!this.clientRequest) {
      this.clientRequest = createLtAuthClient({
        ...resolveLtAuthClientBase(this.api.resolve(), this.options.basePath),
        enableAdmin: this.options.enableAdmin,
        enableTwoFactor: this.options.enableTwoFactor,
        // No onTwoFactorRedirect: nest-server answers `requiresTwoFactor`, Better Auth's plugin only sees
        // `twoFactorRedirect`, so `signIn.email` recognises both itself and navigates once.
        fetch: (input, init) => this.store.fetchWithAuth(input, init),
        plugins: this.options.plugins,
      });
      this.clientRequest.catch(() => {
        this.clientRequest = null;
      });
    }
    return this.clientRequest;
  }

  /** The current JWT (JWT mode only), or `null`. */
  jwtToken(): string | null {
    return this.store.jwtToken();
  }

  // ── roles ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** `user.role === role` or `user.roles` contains it (case-sensitive). */
  hasRole(role: string): boolean {
    return this.store.hasRole(role);
  }

  /** Whether the user has any of the roles. */
  hasAnyRole(...roles: string[]): boolean {
    return this.store.hasAnyRole(...roles);
  }

  // ── features ───────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Fetch the feature flags (`GET /iam/features`, see {@link LtAuthStore.fetchFeatures}). */
  fetchFeatures(): Promise<LtAuthFeatures> {
    return this.store.fetchFeatures();
  }

  /** The feature flags, fetched at most once (transferred from SSR, or fetched on first call). */
  ensureFeatures(): Promise<LtAuthFeatures> {
    return this.store.ensureFeatures();
  }

  // ── sign-in / sign-up / sign-out ───────────────────────────────────────────────────────────────────────────────────
  /**
   * Email sign-in (password hashed). A second factor (`requiresTwoFactor` from nest-server or `twoFactorRedirect` from
   * Better Auth) navigates to `twoFactorRedirectPath` (keeping the current `redirect` query parameter) and sets no user. A JWT-shaped body token (nest-server
   * `cookies: false`) switches to JWT mode; otherwise the session cookie is used and a JWT is fetched in the background.
   */
  readonly signIn = {
    email: async <T extends { callbackURL?: string; email: string; password: string; rememberMe?: boolean }>(
      params: LtNoStrayCredential<T, 'password'>,
      options?: LtAuthCallOptions,
    ): Promise<LtAuthResponse> =>
      this.store.withLoading(async () => {
        const result = await (await this.getClient()).signIn.email(params, options);
        if (readLtAuthAnswer(result).twoFactor) {
          this.store.navigateKeepingRedirect(this.options.twoFactorRedirectPath);
        } else {
          this.store.applyAuthResult(result);
        }
        return result;
      }),
    /** Passkey sign-in (same as {@link authenticateWithPasskey}). */
    passkey: (): Promise<LtPasskeyAuthResult> => this.authenticateWithPasskey(),
  };

  /**
   * Email sign-up (password hashed), same token handling as sign-in. With email verification nest-server answers
   * `emailVerificationRequired: true` and revokes the session: no user is set, the caller leads to the verify page.
   */
  readonly signUp = {
    email: async <T extends { callbackURL?: string; email: string; name: string; password: string }>(
      params: LtNoStrayCredential<T, 'password'>,
      options?: LtAuthCallOptions,
    ): Promise<LtAuthResponse> =>
      this.store.withLoading(async () => {
        const result = await (await this.getClient()).signUp.email(params, options);
        this.store.applyAuthResult(result);
        return result;
      }),
  };

  /**
   * Sign out: sign-out hooks (offline sync flush), `POST /iam/sign-out`, local state cleared, after-hooks (sync wipe).
   * The local state is cleared even when the request fails (offline device). See {@link LtAuthStore.signOut}.
   */
  signOut(options?: LtAuthCallOptions): Promise<void> {
    return this.store.signOut(options);
  }

  // ── session ────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Store the user in state and cookie (browser always; SSR never writes). `image: null` becomes `undefined`. */
  setUser(user: LtUserInput | null, mode: LtAuthMode = 'cookie'): void {
    this.store.setUser(user, mode);
  }

  /** Clear local auth state and cookies (browser). Does not delete offline data (use `signOut()` for that). */
  clearUser(): void {
    this.store.clearUser();
  }

  /**
   * Validate the session (app start / hard reload). Server: answers from the cookie, no backend call. Browser:
   * `GET /iam/get-session` (≤ 10 s); a user is merged with the cached one (nest-server-only fields kept, authz keys
   * fail-closed); no user but a cached one → `true` (e.g. right after 2FA); else `false`.
   */
  validateSession(): Promise<boolean> {
    return this.store.validateSession();
  }

  /** The auth-aware fetch, also provided as `LT_FETCH` (see {@link LtAuthStore.fetchWithAuth}). */
  fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    return this.store.fetchWithAuth(input, init);
  }

  /** Token to retry a request with after a 401 (see {@link LtAuthStore.recoverFrom401}). */
  recoverFrom401(url: string, sentToken: string | null): Promise<string | null> {
    return this.store.recoverFrom401(url, sentToken);
  }

  /** Session-loss handling for a 401 from `url` (see `LtUnauthorizedHandler`). */
  handleUnauthorized(url?: string): Promise<boolean> {
    return this.store.handleUnauthorized(url);
  }

  /** `GET /iam/token` → store the JWT and switch to JWT mode. One request per burst. Browser only. */
  switchToJwtMode(): Promise<boolean> {
    return this.store.switchToJwtMode();
  }

  /** Re-mint the JWT (JWT mode only). */
  refreshJwtToken(): Promise<boolean> {
    return this.store.refreshJwtToken();
  }

  // ── passkeys (WebAuthn, nest-server challengeId) ───────────────────────────────────────────────────────────────────
  /** Passkey sign-in: options → `navigator.credentials.get` → `verify-authentication` (`challengeId`) → user set. */
  async authenticateWithPasskey(): Promise<LtPasskeyAuthResult> {
    if (!hasWebAuthn()) {
      return { error: this.i18n.t('lt.auth.passkeyUnsupported'), success: false };
    }
    return this.store.withLoading(async () => {
      try {
        const optionsResponse = await this.store.fetchWithAuth(this.store.authUrl('/passkey/generate-authenticate-options'), { method: 'GET' });
        if (!optionsResponse.ok) {
          return { error: this.i18n.t('lt.auth.passkeyError'), success: false };
        }
        const options = (await optionsResponse.json()) as LtPasskeyAuthenticationOptions;
        const credential = (await navigator.credentials.get({
          publicKey: {
            allowCredentials: (options.allowCredentials ?? []).map((descriptor) => ({
              ...descriptor,
              id: typeof descriptor.id === 'string' ? ltBase64UrlToUint8Array(descriptor.id).buffer : descriptor.id,
            })) as PublicKeyCredentialDescriptor[],
            challenge: ltBase64UrlToUint8Array(options.challenge).buffer,
            rpId: options.rpId,
            timeout: options.timeout,
            userVerification: options.userVerification,
          },
        })) as PublicKeyCredential | null;
        if (!credential) {
          return { error: this.i18n.t('lt.auth.noPasskeySelected'), success: false };
        }
        const assertion = credential.response as AuthenticatorAssertionResponse;
        const authResponse = await this.store.fetchWithAuth(this.store.authUrl('/passkey/verify-authentication'), {
          body: JSON.stringify({
            challengeId: options.challengeId,
            response: {
              clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
              id: credential.id,
              rawId: ltArrayBufferToBase64Url(credential.rawId),
              response: {
                authenticatorData: ltArrayBufferToBase64Url(assertion.authenticatorData),
                clientDataJSON: ltArrayBufferToBase64Url(assertion.clientDataJSON),
                signature: ltArrayBufferToBase64Url(assertion.signature),
                userHandle: assertion.userHandle ? ltArrayBufferToBase64Url(assertion.userHandle) : null,
              },
              type: credential.type,
            },
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        const result = ((await authResponse.json().catch(() => ({}))) ?? {}) as { message?: string; session?: { token: string }; user?: LtUserInput };
        if (!authResponse.ok) {
          return { error: result.message || this.i18n.t('lt.auth.passkeyFailed'), success: false };
        }
        // A JWT in the answer (nest-server with `cookies: false`) → JWT mode; otherwise the verification set the session
        // cookie. The opaque session token (`session.token`, or `token` from older servers) is never stored as JWT (it
        // would land in a script-readable cookie). Without user in the answer it is loaded from the session.
        const user = await this.store.adoptVerifiedSession(result);
        if (!user) {
          return { error: this.i18n.t('lt.auth.passkeyFailed'), success: false };
        }
        return { session: result.session, success: true, user };
      } catch (error) {
        if (error instanceof Error && error.name === 'NotAllowedError') {
          return { error: this.i18n.t('lt.auth.passkeyAborted'), success: false };
        }
        return { error: error instanceof Error && error.message ? error.message : this.i18n.t('lt.auth.passkeyFailed'), success: false };
      }
    });
  }

  /** Register a passkey for the signed-in user (`challengeId` body as nest-server expects). */
  async registerPasskey(name?: string): Promise<LtPasskeyRegisterResult> {
    if (!hasWebAuthn()) {
      return { error: this.i18n.t('lt.auth.passkeyUnsupported'), success: false };
    }
    return this.store.withLoading(async () => {
      try {
        const optionsResponse = await this.store.fetchWithAuth(this.store.authUrl('/passkey/generate-register-options'), { method: 'GET' });
        if (!optionsResponse.ok) {
          const body = (await optionsResponse.json().catch(() => ({}))) as { message?: string } | null;
          return { error: body?.message || this.i18n.t('lt.auth.registerOptionsError'), success: false };
        }
        const options = (await optionsResponse.json()) as LtPasskeyRegistrationOptions;
        const credential = (await navigator.credentials.create({
          publicKey: {
            attestation: options.attestation,
            authenticatorSelection: options.authenticatorSelection,
            challenge: ltBase64UrlToUint8Array(options.challenge).buffer,
            excludeCredentials: (options.excludeCredentials ?? []).map((descriptor) => ({
              ...descriptor,
              id: ltBase64UrlToUint8Array(descriptor.id).buffer,
            })) as PublicKeyCredentialDescriptor[],
            pubKeyCredParams: options.pubKeyCredParams,
            rp: options.rp,
            timeout: options.timeout,
            user: { ...options.user, id: ltBase64UrlToUint8Array(options.user.id).buffer },
          },
        })) as PublicKeyCredential | null;
        if (!credential) {
          return { error: this.i18n.t('lt.auth.passkeyCreationAborted'), success: false };
        }
        const attestation = credential.response as AuthenticatorAttestationResponse;
        const registerResponse = await this.store.fetchWithAuth(this.store.authUrl('/passkey/verify-registration'), {
          body: JSON.stringify({
            challengeId: options.challengeId,
            name,
            response: {
              clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
              id: credential.id,
              rawId: ltArrayBufferToBase64Url(credential.rawId),
              response: {
                attestationObject: ltArrayBufferToBase64Url(attestation.attestationObject),
                clientDataJSON: ltArrayBufferToBase64Url(attestation.clientDataJSON),
                transports: attestation.getTransports?.() ?? [],
              },
              type: credential.type,
            },
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        const result = (await registerResponse.json().catch(() => ({}))) as { message?: string } | null;
        if (!registerResponse.ok) {
          return { error: result?.message || this.i18n.t('lt.auth.passkeyRegisterFailed'), success: false };
        }
        return { passkey: result, success: true };
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'NotAllowedError') {
            return { error: this.i18n.t('lt.auth.passkeyCreationAborted'), success: false };
          }
          // The authenticator already holds a credential of this account (it was in excludeCredentials).
          if (error.name === 'InvalidStateError' || error.message.includes('already registered')) {
            return { error: this.i18n.t('lt.auth.passkeyAlreadyRegistered'), success: false };
          }
          return { error: error.message || this.i18n.t('lt.auth.passkeyRegisterFailed'), success: false };
        }
        return { error: this.i18n.t('lt.auth.passkeyRegisterFailed'), success: false };
      }
    });
  }

  /** Passkey management of the signed-in user. */
  readonly passkey = {
    delete: async (id: string): Promise<LtAuthResponse> => (await this.getClient()).passkey.deletePasskey({ id }),
    list: async (): Promise<LtAuthResponse<LtPasskey[]>> => (await this.getClient()).passkey.listUserPasskeys(),
    update: async (id: string, name: string): Promise<LtAuthResponse> => (await this.getClient()).passkey.updatePasskey({ id, name }),
  };

  // ── two-factor (TOTP + backup codes) ───────────────────────────────────────────────────────────────────────────────
  /** Two-factor methods (passwords hashed). `verifyTotp` / `verifyBackupCode` set the user on success (fix vs. Nuxt). */
  readonly twoFactor = {
    disable: async <T extends { password: string }>(params: LtNoStrayCredential<T, 'password'>): Promise<LtAuthResponse> => (await this.getClient()).twoFactor.disable(params),
    enable: async <T extends { issuer?: string; password: string }>(params: LtNoStrayCredential<T, 'password'>): Promise<LtAuthResponse<LtTwoFactorEnableResult>> =>
      (await this.getClient()).twoFactor.enable(params),
    generateBackupCodes: async <T extends { password: string }>(params: LtNoStrayCredential<T, 'password'>): Promise<LtAuthResponse<{ backupCodes: string[] }>> =>
      (await this.getClient()).twoFactor.generateBackupCodes(params),
    verifyBackupCode: async (params: { code: string; trustDevice?: boolean }): Promise<LtAuthResponse> =>
      this.adoptVerifiedSession(await (await this.getClient()).twoFactor.verifyBackupCode(params)),
    verifyTotp: async (params: { code: string; trustDevice?: boolean }): Promise<LtAuthResponse> =>
      this.adoptVerifiedSession(await (await this.getClient()).twoFactor.verifyTotp(params)),
  };

  // ── password & email ───────────────────────────────────────────────────────────────────────────────────────────────
  /** `POST /iam/change-password` (both passwords hashed; `revokeOtherSessions` forwarded). */
  async changePassword<T extends { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean }>(
    params: LtNoStrayCredential<T, 'currentPassword' | 'newPassword'>,
  ): Promise<LtAuthResponse> {
    return (await this.getClient()).changePassword(params);
  }

  /** `POST /iam/request-password-reset`; `redirectTo` defaults to `<siteUrl>/auth/reset-password` (absolute, never user-derived). */
  async requestPasswordReset<T extends { email: string; redirectTo?: string }>(params: LtNoStrayCredential<T, never>): Promise<LtAuthResponse> {
    const redirectTo = params.redirectTo || this.absoluteAppUrl('/auth/reset-password');
    return (await this.getClient()).requestPasswordReset({ ...params, redirectTo });
  }

  /** `POST /iam/reset-password` with `{ newPassword (hashed), token }`. */
  async resetPassword<T extends { newPassword: string; token: string }>(params: LtNoStrayCredential<T, 'newPassword'>): Promise<LtAuthResponse> {
    return (await this.getClient()).resetPassword(params);
  }

  /** `POST /iam/send-verification-email`; `callbackURL` defaults to `<siteUrl>/auth/login` (absolute). */
  async sendVerificationEmail<T extends { callbackURL?: string; email: string }>(params: LtNoStrayCredential<T, never>): Promise<LtAuthResponse> {
    const callbackURL = params.callbackURL || this.absoluteAppUrl('/auth/login');
    return (await this.getClient()).sendVerificationEmail({ ...params, callbackURL });
  }

  /** `GET /iam/verify-email?token=` (JSON answer without `callbackURL`). */
  async verifyEmail(params: { callbackURL?: string; token: string }): Promise<LtAuthResponse> {
    return (await this.getClient()).verifyEmail(params);
  }

  /**
   * Build an absolute app URL from `NG_PUBLIC_SITE_URL` (or the browser origin), for `redirectTo` / `callbackURL`.
   * Never derived from the request: on the server without a site URL it throws. Absolute input is returned unchanged.
   */
  absoluteAppUrl(path: string): string {
    return this.store.absoluteAppUrl(path);
  }

  /**
   * After a successful 2FA verification: see {@link LtAuthStore.adoptVerifiedSession} (a JWT in the answer → JWT mode,
   * else cookie mode; Better Auth's opaque session token is never stored as JWT, that would put the session into a
   * script-readable cookie).
   */
  private async adoptVerifiedSession(result: LtAuthResponse): Promise<LtAuthResponse> {
    if (!result || result.error || !result.data) {
      return result;
    }
    await this.store.adoptVerifiedSession(result);
    return result;
  }
}

function hasWebAuthn(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.credentials;
}
