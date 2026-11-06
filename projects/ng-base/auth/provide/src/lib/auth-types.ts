/** User as delivered by nest-server's Better Auth integration (`/iam`). Additional fields are kept. */
export interface LtUser {
  banExpires?: Date | string;
  banned?: boolean;
  banReason?: string;
  email: string;
  emailVerified?: boolean;
  id: string;
  image?: string;
  name?: string;
  role?: string;
  roles?: string[];
  twoFactorEnabled?: boolean;
  [key: string]: unknown;
}

/** User input of `setUser()`; `image: null` (Better Auth) is normalised to `undefined`. */
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
  session?: { token: string };
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
 * Blocks stray plaintext credential keys at compile time: a param object may only carry the credential fields its
 * method hashes. `{ ...form }` with an extra `password` on `requestPasswordReset` is a type error instead of a leak.
 */
export type LtNoStrayCredential<T, Own extends string> = Omit<{ currentPassword?: never; newPassword?: never; password?: never }, Own> & T;

/** Per-call fetch options forwarded to Better Auth (`fetchOptions`). */
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
