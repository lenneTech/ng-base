/*
 * Redaction of secrets in captured data (headers, URLs, bodies, console text).
 *
 * Pure TypeScript without DOM or Angular. `@lenne.tech/ng-base/bug/server` carries an identical copy
 * (`bug/server/src/lib/redact.ts`), so the server applies the same patterns once more before it writes to Linear;
 * `redact-parity.spec.ts` keeps both copies in sync.
 */

/** Replacement of every redacted value. */
export const LT_BUG_REDACTED = '[redacted]';

/** Headers whose values are never recorded (compared case-insensitively). */
export const LT_BUG_SENSITIVE_HEADERS: readonly string[] = Object.freeze([
  'api-key',
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-access-token',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-system-setup-token',
  'x-xsrf-token',
]);

/**
 * Path segments whose request and response bodies are never recorded: nest-server IAM (`/iam/…`: passwords, tokens,
 * 2FA codes, reset and verify tokens), the first-admin setup (`/system-setup/…`) and other auth-like endpoints.
 */
export const LT_BUG_BODY_EXCLUDED_SEGMENTS: readonly string[] = Object.freeze([
  'auth',
  'iam',
  'login',
  'logout',
  'oauth',
  'oauth2',
  'passkey',
  'reset-password',
  'sign-in',
  'sign-up',
  'signin',
  'signup',
  'system-setup',
  'token',
  'two-factor',
  'verify-email',
]);

/** Key fragments that mark a value as secret (key lower-cased, `-`/`_` removed). */
const SENSITIVE_KEY_PARTS = [
  'apikey',
  'authorization',
  'backupcode',
  'cardnumber',
  'cookie',
  'credential',
  'creditcard',
  'passwd',
  'password',
  'privatekey',
  'recoverycode',
  'secret',
  'signature',
  'token',
  'totp',
  'twofactor',
  'verificationcode',
];

/** Keys that are secret as a whole (`code` from OAuth / email links, `otp`, `pin` …). */
const SENSITIVE_KEYS = new Set(['auth', 'code', 'csc', 'cvc', 'cvv', 'iban', 'jwt', 'otp', 'pin', 'pwd', 'sessionid', 'sid', 'ssn']);

const SENSITIVE_HEADER_SET = new Set(LT_BUG_SENSITIVE_HEADERS);
const BODY_EXCLUDED = new RegExp(`/(?:${LT_BUG_BODY_EXCLUDED_SEGMENTS.map((segment) => segment.replace(/[-/]/g, '\\$&')).join('|')})(?:[/?#;]|$)`, 'i');

const USERINFO = /\b([a-z][a-z\d+.-]*:\/\/)[^\s/?#@:]+:[^\s/?#@]+@/gi;
const JWT = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g;
const BEARER = /\b(Bearer)\s+(?=[\w\-.~+/]*[\d.\-_~+/])[\w\-.~+/]{8,}=*/g;
const PATH_TOKEN = /(\/(?:activate|confirm-email|email-verification|invitation|invite|magic-link|reset-password|verify-email)\/)[^/?#\s"'<>]+/gi;
const PARAM = /(^|[?&#;\s"'(,{]|%3[fF]|%26|%23)((?:[\w.\-~[\]]|%5[bBdD])+)(=|%3[dD])([^&#;\s"'<>)}]*?)(?=$|[&#;\s"'<>)}]|%26|%23)/g;
const JSON_PAIR = /("((?:[^"\\]|\\.)*)"\s*:\s*)("(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*|true|false|null)/g;
const JSON_PAIR_OPEN = /("((?:[^"\\]|\\.)*)"\s*:\s*)"(?:[^"\\]|\\.)*$/;
const LABELLED = /\b(api[-_]?key|otp|passwd|password|secret|token)(\s*:\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;

/** Whether a header carries credentials (`Authorization`, `Cookie`, `Set-Cookie`, `X-System-Setup-Token` …). */
export function isLtSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADER_SET.has(name.trim().toLowerCase());
}

/**
 * Whether an object key / form field name / query parameter holds a secret (`password`, `newPassword`, `token`,
 * `access_token`, `code`, `otp`, `user[password]` …).
 */
export function isLtSensitiveKey(key: string): boolean {
  const decoded = safeDecode(key);
  const last =
    decoded
      .split(/[[\].]/)
      .filter(Boolean)
      .pop() ?? decoded;
  const normalized = last.toLowerCase().replace(/[-_\s]/g, '');
  return SENSITIVE_KEYS.has(normalized) || SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

/** Whether request and response bodies of `url` must not be recorded (see {@link LT_BUG_BODY_EXCLUDED_SEGMENTS}). */
export function isLtBodyExcludedUrl(url: string): boolean {
  const path = url.replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i, '').split(/[?#]/)[0] ?? '';
  return BODY_EXCLUDED.test(path);
}

/**
 * Redact secrets in free text and URLs: query/hash/form parameters (`token`, `code`, `password`, `secret`, `otp`, …,
 * also inside nested and percent-encoded `callbackURL` values), tokens in reset/verify paths, URL credentials,
 * `Bearer` tokens, JWTs, JSON pairs with secret keys and `password: …` labels.
 */
export function redactLtText(text: string): string {
  if (!text) {
    return text;
  }
  let result = text.replace(USERINFO, `$1${LT_BUG_REDACTED}@`).replace(JWT, LT_BUG_REDACTED).replace(BEARER, `$1 ${LT_BUG_REDACTED}`).replace(PATH_TOKEN, `$1${LT_BUG_REDACTED}`);
  result = redactParams(result, 0);
  result = result.replace(JSON_PAIR, (match, prefix: string, key: string) => (isLtSensitiveKey(key) ? `${prefix}"${LT_BUG_REDACTED}"` : match));
  result = result.replace(JSON_PAIR_OPEN, (match, prefix: string, key: string) => (isLtSensitiveKey(key) ? `${prefix}"${LT_BUG_REDACTED}"` : match));
  return result.replace(LABELLED, `$1$2${LT_BUG_REDACTED}`);
}

/** Redact a URL (alias of {@link redactLtText}, which handles URLs inside text as well). */
export function redactLtUrl(url: string): string {
  return redactLtText(url);
}

/** Deep copy of a parsed JSON value with secret keys replaced and every string redacted. */
export function redactLtValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return redactLtText(value);
  }
  if (depth > 20 || value === null || typeof value !== 'object') {
    return depth > 20 ? LT_BUG_REDACTED : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactLtValue(item, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = isLtSensitiveKey(key) ? LT_BUG_REDACTED : redactLtValue(item, depth + 1);
  }
  return result;
}

/** Redact and truncate a request/response body: JSON deep, everything else (form data, text) as text. */
export function redactLtBody(body: string, maxLength = 1000): string {
  const input = body.length > 20_000 ? body.slice(0, 20_000) : body;
  const trimmed = input.trim();
  let redacted: string;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      redacted = JSON.stringify(redactLtValue(JSON.parse(trimmed)));
    } catch {
      redacted = redactLtText(input);
    }
  } else {
    redacted = redactLtText(input);
  }
  return truncateLt(redacted, maxLength);
}

/** Copy of a header map with credential headers replaced by `[redacted]` and the other values redacted as text. */
export function redactLtHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    result[name] = isLtSensitiveHeader(name) ? LT_BUG_REDACTED : redactLtText(String(value));
  }
  return result;
}

/** Cut `text` to `maxLength` characters with a marker naming the dropped length. */
export function truncateLt(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} characters]`;
}

function redactParams(text: string, depth: number): string {
  return text.replace(PARAM, (match, separator: string, key: string, equals: string, value: string) => {
    if (isLtSensitiveKey(key)) {
      return `${separator}${key}${equals}${value ? LT_BUG_REDACTED : ''}`;
    }
    // Nested URLs (`callbackURL=https://app/verify?token=…`, also percent-encoded) carry their own parameters.
    if (depth < 3 && /=|%3[dD]/.test(value)) {
      return `${separator}${key}${equals}${redactParams(value, depth + 1)}`;
    }
    return match;
  });
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
