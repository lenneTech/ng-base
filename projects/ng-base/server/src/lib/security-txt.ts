/**
 * security.txt according to RFC 9116, built per request.
 *
 * Ported from the lenne.Tech website (DEV-3602), where it has been live since 2026-10-13.
 * Pure functions only, so the route stays a thin adapter and everything that decides the
 * file's content is unit-testable without a Nitro context.
 */

export const SECURITY_TXT_PATH = '/.well-known/security.txt';
export const SECURITY_TXT_DEFAULT_CONTACT = 'mailto:security@lenne.tech';
export const SECURITY_TXT_DEFAULT_LANGUAGES = ['de', 'en'];
export const SECURITY_TXT_DEFAULT_VALID_DAYS = 180;
/** RFC 9116 recommends an `Expires` less than a year away. */
const SECURITY_TXT_MAX_VALID_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/** RFC 9116 §2.5.3: a contact is a URI, and a web URI must be https. */
const CONTACT_URI = /^(?:mailto:|tel:|https:\/\/)\S/i;

export interface SecurityTxtOptions {
  /** Contact URIs (`mailto:`, `https:` or `tel:`), in order of preference. */
  contacts: string[];
  /** Point in time the file is built for; `Expires` is derived from it. */
  now: Date;
  /** Origins the file is served from; each becomes one `Canonical` line. */
  origins: string[];
  /** URI of the vulnerability disclosure policy, or a path resolved against the first origin. */
  policy?: string;
  /** Language tags in order of preference. */
  preferredLanguages?: string[];
  /** Days between `now` and `Expires`. */
  validDays?: number;
}

/**
 * Keeps a configured value only if it is a single token. Every value ends up on a line of its
 * own, so a line break or blank inside one would forge an additional field.
 */
function isSingleToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/\s/.test(value);
}

/**
 * Normalises the configured contact(s). Accepts a string or an array (`ltSecurityTxt()` splits the comma-separated
 * runtime override `NG_LT_SECURITY_TXT_CONTACT`).
 *
 * Whatever is not a usable URI is dropped. `security@example.com` is the obvious typo, and scanners
 * treat the file it would produce as invalid; with no contact left, the route answers 404 instead.
 */
export function normalizeSecurityTxtContacts(contact: unknown): string[] {
  const values = Array.isArray(contact) ? contact : [contact];
  return values
    .map((value) => (typeof value === 'string' ? value.trim() : value))
    .filter(isSingleToken)
    .filter((value) => CONTACT_URI.test(value));
}

/**
 * Normalises a list option (languages, hosts). A runtime override via an environment variable
 * arrives as a string, so `"de, en"` is accepted as well as `['de', 'en']`.
 */
export function normalizeSecurityTxtList(value: unknown): string[] {
  const values = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [];
  return values.map((entry) => (typeof entry === 'string' ? entry.trim() : entry)).filter(isSingleToken);
}

/**
 * Clamps `validDays` into the window RFC 9116 recommends. A non-finite or non-positive value
 * falls back to the default instead of producing an `Expires` in the past.
 */
export function normalizeSecurityTxtValidDays(validDays: unknown): number {
  const days = Number(validDays);
  if (!Number.isFinite(days) || days < 1) {
    return SECURITY_TXT_DEFAULT_VALID_DAYS;
  }
  return Math.min(Math.floor(days), SECURITY_TXT_MAX_VALID_DAYS);
}

/**
 * Turns a configured site URL into an origin (`https://example.com`), dropping path, query and
 * trailing slash. Anything that is not an absolute http(s) URL yields `undefined`.
 */
export function toSecurityTxtOrigin(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Turns the requested host into an origin, but only if it is one the site is known to be served
 * from. The host comes from a request header, so anything else must not end up in the file.
 */
export function allowedRequestOrigin(host: string | undefined, allowedHosts: string[]): string | undefined {
  const name = host?.trim().toLowerCase();
  const allowed = allowedHosts.map((entry) => entry.trim().toLowerCase());
  return name && allowed.includes(name) ? `https://${name}` : undefined;
}

/** Resolves a path against the first origin; absolute URIs pass through unchanged. */
function resolveAgainstOrigin(value: string | undefined, origin: string | undefined): string | undefined {
  if (!isSingleToken(value)) {
    return undefined;
  }
  if (!value.startsWith('/')) {
    return value;
  }
  return origin ? `${origin}${value}` : undefined;
}

/**
 * Builds a security.txt according to RFC 9116.
 *
 * `Expires` is relative to `now`, so a file built per request never goes stale, no matter how
 * long ago the last deployment was. It is cut to midnight UTC, which makes the file valid for up
 * to a day less than `validDays` and keeps it byte-identical for a whole day.
 */
export function buildSecurityTxt(options: SecurityTxtOptions): string {
  const { contacts, now, origins, policy, preferredLanguages = [] } = options;
  const validDays = normalizeSecurityTxtValidDays(options.validDays ?? SECURITY_TXT_DEFAULT_VALID_DAYS);
  const expires = new Date(Math.floor((now.getTime() + validDays * DAY_MS) / DAY_MS) * DAY_MS);
  const canonicals = [...new Set(origins.map((origin) => origin.replace(/\/+$/, '')).filter(Boolean))];
  const languages = preferredLanguages.map((language) => language.trim()).filter(isSingleToken);

  const lines = [...contacts.filter(isSingleToken).map((contact) => `Contact: ${contact}`), `Expires: ${expires.toISOString()}`];
  const policyUri = resolveAgainstOrigin(policy, canonicals[0]);
  if (policyUri) {
    lines.push(`Policy: ${policyUri}`);
  }
  if (languages.length) {
    lines.push(`Preferred-Languages: ${languages.join(', ')}`);
  }
  for (const origin of canonicals) {
    lines.push(`Canonical: ${origin}${SECURITY_TXT_PATH}`);
  }

  return `${lines.join('\n')}\n`;
}

/** The server-only runtime config the module writes to `runtimeConfig.ltExtensions.securityTxt`. */
export interface SecurityTxtRuntimeConfig {
  contact?: string | string[];
  hosts?: string | string[];
  policy?: string;
  preferredLanguages?: string | string[];
  validDays?: number | string;
}

/**
 * Turns the runtime config and the request into the file's content, or `undefined` when no
 * usable contact is left (the route then answers 404).
 *
 * `Canonical` names the configured site URL and, in addition, the requested host if it is one of
 * the configured `hosts`. A site served under several hostnames without a redirect needs the
 * second line: RFC 9116 expects the URI a file was fetched from among its Canonical lines.
 */
export function resolveSecurityTxt(input: {
  config: SecurityTxtRuntimeConfig | undefined;
  now: Date;
  requestHost: string | undefined;
  siteUrl: string | undefined;
}): string | undefined {
  const config = input.config ?? {};
  const contacts = normalizeSecurityTxtContacts(config.contact);
  if (!contacts.length) {
    return undefined;
  }

  const siteOrigin = toSecurityTxtOrigin(input.siteUrl);
  const requestOrigin = allowedRequestOrigin(input.requestHost, normalizeSecurityTxtList(config.hosts));

  return buildSecurityTxt({
    contacts,
    now: input.now,
    origins: [siteOrigin, requestOrigin].filter((origin): origin is string => !!origin),
    policy: config.policy,
    preferredLanguages: normalizeSecurityTxtList(config.preferredLanguages),
    validDays: normalizeSecurityTxtValidDays(config.validDays),
  });
}
