import { DOCUMENT, isPlatformServer } from '@angular/common';
import { inject, PLATFORM_ID, REQUEST, Service } from '@angular/core';

/** Options for {@link LtCookieService.set}. */
export interface LtCookieOptions {
  /** Cookie domain. Omit for a host-only cookie. */
  domain?: string;
  /** Lifetime in seconds. Omit for a session cookie. */
  maxAge?: number;
  /** Cookie path (default `/`). */
  path?: string;
  /** SameSite attribute (default `lax`). */
  sameSite?: 'lax' | 'none' | 'strict';
  /** Secure attribute (default: `true` on `https:`). */
  secure?: boolean;
}

/**
 * SSR-aware cookie access.
 *
 * - Browser: reads and writes `document.cookie`.
 * - Server: reads the `Cookie` header of the incoming request (`REQUEST`); never writes. A server render must not
 *   set auth cookies (it would write `{ user: null }` over a valid browser state), so `set`/`delete` are no-ops there.
 */
@Service()
export class LtCookieService {
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));

  /** Raw cookie string (`a=1; b=2`) of the current request or document. */
  raw(): string {
    if (this.isServer) {
      return this.request?.headers.get('cookie') ?? '';
    }
    try {
      return this.document.cookie ?? '';
    } catch {
      return '';
    }
  }

  /** First decoded value of `name`, or `null`. */
  get(name: string): string | null {
    return this.getAll(name)[0] ?? null;
  }

  /**
   * Every decoded value of `name`, in header order. A host-only cookie and a domain-scoped twin can coexist; callers
   * that must pick the right one (the auth state) look at all of them.
   */
  getAll(name: string): string[] {
    return parseLtCookies(this.raw(), name);
  }

  /** Write a cookie (browser only). The value is URI-encoded. */
  set(name: string, value: string, options: LtCookieOptions = {}): void {
    if (this.isServer) {
      return;
    }
    const secure = options.secure ?? this.document.location?.protocol === 'https:';
    const parts = [`${name}=${encodeURIComponent(value)}`, `path=${options.path ?? '/'}`, `samesite=${options.sameSite ?? 'lax'}`];
    if (options.maxAge !== undefined) {
      parts.push(`max-age=${Math.max(0, Math.floor(options.maxAge))}`);
    }
    if (options.domain) {
      parts.push(`domain=${options.domain}`);
    }
    if (secure) {
      parts.push('secure');
    }
    this.document.cookie = parts.join('; ');
  }

  /** Delete a cookie on the given path/domain slot (browser only). */
  delete(name: string, options: Pick<LtCookieOptions, 'domain' | 'path'> = {}): void {
    if (this.isServer) {
      return;
    }
    const parts = [`${name}=`, `path=${options.path ?? '/'}`, 'expires=Thu, 01 Jan 1970 00:00:00 GMT', 'max-age=0'];
    if (options.domain) {
      parts.push(`domain=${options.domain}`);
    }
    this.document.cookie = parts.join('; ');
  }
}

/** Parse every value of cookie `name` out of a raw cookie string (decoded; malformed encodings are kept raw). */
export function parseLtCookies(cookieString: string, name: string): string[] {
  const prefix = `${name}=`;
  const values: string[] = [];
  for (const entry of (cookieString || '').split(/;\s*/)) {
    if (!entry.startsWith(prefix)) {
      continue;
    }
    const value = entry.slice(prefix.length);
    try {
      values.push(decodeURIComponent(value));
    } catch {
      values.push(value);
    }
  }
  return values;
}
