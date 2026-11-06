/// <reference types="node" />
import { pipeline, Readable } from 'node:stream';

import { isLtSecureRequest, type LtNodeMiddleware } from './middlewares';
import { readLtRuntimeConfigFromEnv, type LtEnv } from './runtime-env';

/** Options of {@link ltApiProxy}. */
export interface LtApiProxyOptions {
  /**
   * Serve the proxy (default: only when `NG_PUBLIC_API_PROXY=true`). On deployed stages the browser talks to the API
   * directly; the proxy is for same-origin cookies and WebAuthn on `localhost` (SSR dev server, `lt dev`, E2E).
   */
  enabled?: boolean;
  /** Environment (default `process.env`). */
  env?: LtEnv;
  /** Path prefix that is stripped (default `/api`). */
  prefix?: string;
  /** Target API (default `NG_API_URL`, then `NG_PUBLIC_API_URL`). */
  target?: string;
}

const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'cookie',
  'origin',
  'referer',
  'user-agent',
  'x-file-id',
  'x-system-setup-token',
  'x-tenant-id',
  'tus-resumable',
  'upload-length',
  'upload-metadata',
  'upload-offset',
  'upload-concat',
  'upload-defer-length',
];
const HOP_BY_HOP = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/**
 * Rewrite a backend `Set-Cookie` for the app origin: drop `Domain`, drop `Secure` on plain HTTP, force `Path=/`.
 * Without it the session cookie of `localhost:3000` never reaches the app on `localhost:3001`.
 */
export function rewriteLtProxyCookie(cookie: string, secure: boolean): string {
  const [pair = '', ...attributes] = cookie.split(';').map((part) => part.trim());
  const kept = attributes.filter((part) => part && !/^domain=/i.test(part) && !/^path=/i.test(part) && (secure || !/^secure$/i.test(part)));
  // Always `Path=/`: without one the browser scopes the cookie to the directory of the proxied URL (e.g. `/api/iam`).
  return [pair, 'Path=/', ...kept].join('; ');
}

/**
 * Rewrite a backend `Location` / `Content-Location` for the browser: a URL on the proxy target (`http://api:3000/tus/1`)
 * or an API path (`/tus/1`) becomes the proxied path (`/api/tus/1`); other origins (OAuth redirects) stay unchanged.
 * Without it a TUS upload continues against the internal `NG_API_URL`, which the browser can neither reach nor should
 * ever learn.
 */
export function rewriteLtProxyLocation(location: string, target: string, prefix: string): string {
  if (location.startsWith('/') && !location.startsWith('//')) {
    return `${prefix}${location}`;
  }
  try {
    const url = new URL(location);
    const base = new URL(target);
    if (url.origin !== base.origin) {
      return location;
    }
    const basePath = base.pathname.replace(/\/+$/, '');
    const path = basePath && url.pathname.startsWith(`${basePath}/`) ? url.pathname.slice(basePath.length) : url.pathname;
    return `${prefix}${path}${url.search}${url.hash}`;
  } catch {
    return location;
  }
}

/**
 * Same-origin API proxy for the Angular SSR server: `/api/<path>` → `<target>/<path>` (method, body and the auth
 * headers forwarded, streaming both ways, `Set-Cookie` rewritten). The counterpart of nuxt-base-starter's
 * `server/api/iam/[...path].ts`, covering every API path (auth, TUS, AI SSE, sync).
 *
 * `ng serve` uses `proxy.conf.mjs` instead; this is for the built server (`.output/server/index.mjs`).
 */
export function ltApiProxy(options: LtApiProxyOptions = {}): LtNodeMiddleware {
  const prefix = (options.prefix ?? '/api').replace(/\/+$/, '');
  return (req, res, next) => {
    const url = req.url ?? '';
    if (url !== prefix && !url.startsWith(`${prefix}/`) && !url.startsWith(`${prefix}?`)) {
      next();
      return;
    }
    const env = options.env ?? (globalThis as { process?: { env?: LtEnv } }).process?.env ?? {};
    const runtime = readLtRuntimeConfigFromEnv(env);
    const enabled = options.enabled ?? runtime.public.apiProxy === true;
    const target = (options.target ?? (runtime.serverApiUrl || runtime.public.apiUrl || '')).replace(/\/+$/, '');
    if (!enabled || !target) {
      next();
      return;
    }
    const headers = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = req.headers[name];
      if (value !== undefined) {
        headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
    }
    const method = (req.method ?? 'GET').toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    fetch(`${target}${url.slice(prefix.length) || '/'}`, {
      body: hasBody ? (Readable.toWeb(req) as unknown as BodyInit) : undefined,
      headers,
      method,
      redirect: 'manual',
      signal: controller.signal,
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit)
      .then(async (response) => {
        res.statusCode = response.status;
        const secure = isLtSecureRequest(req);
        response.headers.forEach((value, name) => {
          if (name === 'location' || name === 'content-location') {
            res.setHeader(name, rewriteLtProxyLocation(value, target, prefix));
          } else if (!HOP_BY_HOP.has(name) && name !== 'set-cookie') {
            res.setHeader(name, value);
          }
        });
        const cookies = response.headers.getSetCookie?.() ?? [];
        if (cookies.length) {
          res.setHeader(
            'set-cookie',
            cookies.map((cookie) => rewriteLtProxyCookie(cookie, secure)),
          );
        }
        if (!response.body) {
          res.end();
          return;
        }
        // pipeline(), not pipe(): a client that leaves mid-stream (SSE, AI stop, navigation) aborts the upstream body,
        // and that error must end this response instead of crashing the process as an unhandled 'error' event.
        pipeline(Readable.fromWeb(response.body as never), res, () => undefined);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        // The cause may carry the internal NG_API_URL (e.g. "Failed to parse URL from …"): server log only.
        console.error('[@lenne.tech/ng-base/server] API proxy error:', error);
        res.statusCode = 502;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ message: 'API proxy error' }));
      });
  };
}
