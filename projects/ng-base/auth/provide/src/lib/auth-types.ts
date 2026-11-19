/** User as delivered by nest-server's Better Auth integration (`/iam`). Additional fields are kept. */
export interface LtUser {
  banExpires?: Date | string;
  banned?: boolean;
  banReason?: string;
  email: string;
  emailVerified?: boolean;
  id: string;
  /**
   * An `http(s)` URL or a path. An inline image (a `data:` URL, as Better Auth's Microsoft provider stores the profile
   * photo) is never kept: it would push the `lt-auth-state` cookie past the browser's 4096 bytes, so it reads as
   * `undefined` here. Read the photo from the session answer (`GET <basePath>/get-session`) where an avatar needs it.
   */
  image?: string;
  name?: string;
  role?: string;
  roles?: string[];
  twoFactorEnabled?: boolean;
  [key: string]: unknown;
}

/**
 * User input of `setUser()`; `image: null` (Better Auth) is normalised to `undefined`, and so is a `data:` image (see
 * {@link LtUser.image}).
 */
export type LtUserInput = Omit<LtUser, 'image'> & { image?: null | string };

/** Auth transport: session cookie (default) or JWT Bearer token (fallback when cookies do not work). */
export type LtAuthMode = 'cookie' | 'jwt';

/** Content of the client-readable auth-state cookie (`lt-auth-state`). A UI cache, never a security boundary. */
export interface LtAuthState {
  authMode: LtAuthMode;
  user: LtUser | null;
}

/** Feature flags of nest-server (`GET /iam/features`), e.g. `emailVerification`, `passkey`, `signUpChecks`. */
export type LtAuthFeatures = Record<string, boolean | number | string | string[]>;

/** Result envelope of the Better Auth client (`{ data, error }`). */
export interface LtAuthResponse<T = LtAuthResponseData> {
  data?: T | null;
  error?: LtAuthError | null;
}

/** Data of a sign-in/sign-up response (Better Auth's native fields plus nest-server's own). */
export interface LtAuthResponseData {
  /** nest-server, sign-up: the email must be verified first; the session was revoked, nobody is signed in. */
  emailVerificationRequired?: boolean;
  redirect?: boolean;
  /** nest-server, sign-in: a second factor is required (navigate to the 2FA page; no user is set). */
  requiresTwoFactor?: boolean;
  /** nest-server: whether the call succeeded (`false` together with `requiresTwoFactor`). */
  success?: boolean;
  /**
   * nest-server with `cookies: false` (or `exposeTokenInBody`): the JWT for the Bearer header. Better Auth's native
   * answers carry the opaque session token here, which is never used as JWT.
   */
  token?: string | null;
  /** Set together with `twoFactorRedirect` when the account needs a second factor. */
  twoFactorRedirect?: boolean;
  url?: string;
  user?: LtUser;
  [key: string]: unknown;
}

/** Better Auth error (`{ code, message, status }`); nest-server messages may carry a `#LTNS_xxxx:` marker. */
export interface LtAuthError {
  code?: string;
  message?: string;
  status?: number;
  statusText?: string;
}

/** Result of `LtAuthService.authenticateWithPasskey()`. */
export interface LtPasskeyAuthResult {
  error?: string;
  success: boolean;
  user?: LtUser;
}

/** Result of `LtAuthService.registerPasskey()`. */
export interface LtPasskeyRegisterResult {
  error?: string;
  passkey?: unknown;
  success: boolean;
}

/** A registered passkey (`passkey.listUserPasskeys()`). */
export interface LtPasskey {
  backedUp?: boolean;
  createdAt?: Date | string;
  deviceType?: string;
  id: string;
  name?: string | null;
  [key: string]: unknown;
}

/** Result of `twoFactor.enable()`: TOTP URI for the QR code plus the backup codes. */
export interface LtTwoFactorEnableResult {
  backupCodes: string[];
  totpURI: string;
}

/**
 * Parameters of a sign-in through a social provider (`POST <basePath>/sign-in/social`), as Better Auth takes them.
 * `provider` is the key the API configured under `betterAuth.socialProviders` (`'google'`, `'github'`, `'microsoft'`,
 * …); `GET /iam/features` lists the enabled ones as `socialProviders`.
 *
 * Without `idToken` the answer is the provider's authorization URL and the browser goes there. It comes back to
 * `callbackURL` signed in, or to `errorCallbackURL` with `?error=`. Both must be app URLs of an origin the API trusts
 * (`trustedOrigins`): `LtAuthService.signIn.social()` turns a relative value into an absolute app URL
 * (`NG_PUBLIC_SITE_URL`), Better Auth itself would resolve it against the API.
 */
export interface LtSocialSignInParams {
  /** Data Better Auth carries through the OAuth flow and hands to its hooks. */
  additionalData?: Record<string, unknown>;
  /**
   * Extra query parameters for the provider's authorization URL, for this request only. `{ prompt: 'none' }` asks for a
   * silent sign-in: the provider answers without showing anything, with the session if the user has one there and with
   * an error otherwise (`errorCallbackURL`). `{ prompt: 'select_account' }` lets the user pick another account.
   */
  additionalParams?: Record<string, string>;
  /** Where the browser lands after a successful sign-in. */
  callbackURL?: string;
  /** Answer with the authorization URL without navigating to it. */
  disableRedirect?: boolean;
  /** Where the browser lands when the provider or Better Auth refuses; the reason is a code in `?error=`. */
  errorCallbackURL?: string;
  /**
   * Sign in with an ID token the provider already issued for this application, without a redirect: an app inside a
   * host that knows the user (Microsoft Teams, a native shell).
   */
  idToken?: { accessToken?: string; nonce?: string; refreshToken?: string; token: string };
  /** The account to suggest to the provider (an email address), which skips its account picker. */
  loginHint?: string;
  /** Where the browser lands after a sign-in that created the account. */
  newUserCallbackURL?: string;
  /** The provider's key on the API. */
  provider: string;
  /** Ask for a new account where the provider is configured with `disableImplicitSignUp`. */
  requestSignUp?: boolean;
  /** Scopes to request on top of the ones the API configured. */
  scopes?: string[];
}

/**
 * Blocks stray plaintext credential keys at compile time: a param object may only carry the credential fields its
 * method hashes. `{ ...form }` with an extra `password` on `requestPasswordReset` is a type error instead of a leak.
 */
export type LtNoStrayCredential<T, Own extends string> = Omit<{ currentPassword?: never; newPassword?: never; password?: never }, Own> & T;

/**
 * Per-call fetch options forwarded to Better Auth (its `fetchOptions`). The session token ng-base removes from 2FA and
 * social sign-in answers is removed from the returned value only: a caller's `onSuccess` hook sees the answer before.
 */
export interface LtAuthCallOptions {
  /** Abort the request. */
  signal?: AbortSignal;
  /** Extra headers. */
  headers?: Record<string, string>;
  [key: string]: unknown;
}

/** Response of `GET /system-setup/status`. */
export interface LtSystemSetupStatus {
  httpInitEnabled?: boolean;
  httpInitTokenRequired?: boolean;
  needsSetup: boolean;
}

/** Body of `initSetup()`; the password is hashed, the token is sent as `X-System-Setup-Token`. */
export interface LtSystemSetupInput {
  email: string;
  name: string;
  password: string;
  token?: string;
}
