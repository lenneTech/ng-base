/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http';

import { resolveSecurityTxt, SECURITY_TXT_DEFAULT_CONTACT, SECURITY_TXT_DEFAULT_LANGUAGES, SECURITY_TXT_DEFAULT_VALID_DAYS, SECURITY_TXT_PATH } from './security-txt';
import { readLtRuntimeConfigFromEnv, type LtEnv } from './runtime-env';

/** Express-compatible middleware (`(req, res, next)`), also usable with plain `node:http`. */
export type LtNodeMiddleware = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void;

const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Referrer-Policy': 'strict-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
});

/** HSTS header value set on HTTPS requests. */
export const LT_HSTS_VALUE = 'max-age=31536000; includeSubDomains';

/** Whether the request came in over HTTPS (`X-Forwarded-Proto` first, then the socket). */
export function isLtSecureRequest(req: Pick<IncomingMessage, 'headers'> & { socket?: unknown }): boolean {
  const forwarded = headerValue(req.headers['x-forwarded-proto'])?.split(',')[0]?.trim().toLowerCase();
  if (forwarded) {
    return forwarded === 'https';
  }
  return !!(req.socket as { encrypted?: boolean } | undefined)?.encrypted;
}

/** The security headers for a request (same set as nuxt-base-starter; no CSP by design). */
export function buildLtSecurityHeaders(options: { secure: boolean }): Record<string, string> {
  return options.secure ? { ...SECURITY_HEADERS, 'Strict-Transport-Security': LT_HSTS_VALUE } : { ...SECURITY_HEADERS };
}

/**
 * Security headers on every response: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin`,
 * `Permissions-Policy`, `X-DNS-Prefetch-Control: off`, `X-Permitted-Cross-Domain-Policies: none`, HSTS on HTTPS;
 * removes `X-Powered-By`; never overwrites a header a route already set.
 */
export function ltSecurityHeaders(): LtNodeMiddleware {
  return (req, res, next) => {
    res.removeHeader('X-Powered-By');
    for (const [name, value] of Object.entries(buildLtSecurityHeaders({ secure: isLtSecureRequest(req) }))) {
      if (!res.hasHeader(name)) {
        res.setHeader(name, value);
      }
    }
    next();
  };
}

/**
 * Cache headers for SSR HTML: `Cache-Control: private, no-cache` and `Vary: Cookie` (the page depends on the auth
 * cookie), unless the response already has a `Cache-Control`. Apply it to the `Response` of `AngularNodeAppEngine.handle()`
 * before `writeResponseToNodeResponse()`. Returns whether the headers were set.
 */
export function applyLtHtmlCacheHeaders(response: Response): boolean {
  if (!(response.headers.get('content-type') ?? '').includes('text/html') || response.headers.has('cache-control')) {
    return false;
  }
  response.headers.set('cache-control', 'private, no-cache');
  const vary = response.headers.get('vary');
  response.headers.set('vary', vary ? `${vary}, Cookie` : 'Cookie');
  return true;
}

/** Options of {@link ltSecurityTxt}. Values can be overridden per stage via `NG_LT_SECURITY_TXT_*`. */
export interface LtSecurityTxtHandlerOptions {
  /** Contact URI(s) (`mailto:`, `https://`, `tel:`), default `mailto:security@lenne.tech`. Env `NG_LT_SECURITY_TXT_CONTACT` (comma-separated). */
  contact?: string | string[];
  /** Hostnames served without redirect; a request for one adds a second `Canonical` line. Env `NG_LT_SECURITY_TXT_HOSTS`. */
  hosts?: string[];
  /** Policy URI or path (resolved against the site URL). Env `NG_LT_SECURITY_TXT_POLICY`. */
  policy?: string;
  /** Language tags (default `de, en`). Env `NG_LT_SECURITY_TXT_PREFERRED_LANGUAGES`. */
  preferredLanguages?: string[];
  /** Site URL for `Canonical` (default `NG_PUBLIC_SITE_URL`). */
  siteUrl?: string;
  /** Days until `Expires` (default 180, max 365). Env `NG_LT_SECURITY_TXT_VALID_DAYS`. */
  validDays?: number;
  /** Environment to read the overrides from (default `process.env`). */
  env?: LtEnv;
}

/**
 * Serve `/.well-known/security.txt` (RFC 9116), built per request: GET/HEAD, `text/plain`, `no-store`; 404 when no
 * valid contact is configured. Register it only where somebody reads the contact address.
 *
 * @example server.ts: app.use(ltSecurityTxt({ contact: 'mailto:security@customer.example' }))
 */
export function ltSecurityTxt(options: LtSecurityTxtHandlerOptions = {}): LtNodeMiddleware {
  return (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== SECURITY_TXT_PATH || (req.method !== 'GET' && req.method !== 'HEAD')) {
      next();
      return;
    }
    const env = options.env ?? processEnv();
    const fromEnv = (name: string) => (env[name] === undefined || env[name] === '' ? undefined : env[name]);
    const body = resolveSecurityTxt({
      config: {
        contact: fromEnv('NG_LT_SECURITY_TXT_CONTACT')?.split(',') ?? options.contact ?? SECURITY_TXT_DEFAULT_CONTACT,
        hosts: fromEnv('NG_LT_SECURITY_TXT_HOSTS') ?? options.hosts ?? [],
        policy: fromEnv('NG_LT_SECURITY_TXT_POLICY') ?? options.policy,
        preferredLanguages: fromEnv('NG_LT_SECURITY_TXT_PREFERRED_LANGUAGES') ?? options.preferredLanguages ?? SECURITY_TXT_DEFAULT_LANGUAGES,
        validDays: fromEnv('NG_LT_SECURITY_TXT_VALID_DAYS') ?? options.validDays ?? SECURITY_TXT_DEFAULT_VALID_DAYS,
      },
      now: new Date(),
      requestHost: headerValue(req.headers['x-forwarded-host'])?.split(',')[0]?.trim() || headerValue(req.headers.host),
      siteUrl: options.siteUrl ?? readLtRuntimeConfigFromEnv(env).public.siteUrl,
    });
    if (!body) {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Not Found');
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}

/** Options of {@link ltBuildIdentity}. */
export interface LtBuildIdentityOptions {
  /** Route (default `/api/build-identity`). */
  path?: string;
  /** App version (default `NG_PUBLIC_APP_VERSION`, else `0.0.0`). */
  version?: string;
  /** Environment (default `process.env`). */
  env?: LtEnv;
}

/** Commit of the running build: `NG_PUBLIC_APP_COMMIT`, else `APP_VERSION_COMMIT` (TurboOps), else `unknown`. */
export function resolveLtBuildCommit(env: LtEnv = processEnv()): string {
  for (const candidate of [env['NG_PUBLIC_APP_COMMIT'], env['APP_VERSION_COMMIT']]) {
    if (typeof candidate === 'string' && candidate.trim() && candidate !== 'unknown') {
      return candidate;
    }
  }
  return 'unknown';
}

/** `GET /api/build-identity` → `{ commit, version }` (no-store), used by the admin system page to detect drift. */
export function ltBuildIdentity(options: LtBuildIdentityOptions = {}): LtNodeMiddleware {
  const path = options.path ?? '/api/build-identity';
  return (req, res, next) => {
    if ((req.url ?? '').split('?')[0] !== path || req.method !== 'GET') {
      next();
      return;
    }
    const env = options.env ?? processEnv();
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ commit: resolveLtBuildCommit(env), version: options.version ?? env['NG_PUBLIC_APP_VERSION'] ?? '0.0.0' }));
  };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function processEnv(): LtEnv {
  return (globalThis as { process?: { env?: LtEnv } }).process?.env ?? {};
}
