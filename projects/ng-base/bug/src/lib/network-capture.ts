import type { LtNetworkRequestEntry } from './bug-types';
import { isLtBodyExcludedUrl, redactLtBody, redactLtHeaders, redactLtText, redactLtUrl } from './redact';
import { LtRingBuffer } from './ring-buffer';

const STATIC_EXTENSIONS = ['.css', '.eot', '.gif', '.ico', '.jpeg', '.jpg', '.js', '.map', '.mjs', '.png', '.svg', '.ttf', '.webp', '.woff', '.woff2'];
const MAX_RESPONSE_BYTES = 1_000_000;

/** The window members the network capture patches. */
export type LtNetworkCaptureWindow = Pick<Window, 'fetch' | 'location'> & { XMLHttpRequest?: typeof XMLHttpRequest };

interface XhrInfo {
  capture: boolean;
  headers: Record<string, string>;
  method: string;
  url: string;
}

type XhrOpen = (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) => void;
type XhrSend = (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) => void;
type XhrSetRequestHeader = (this: XMLHttpRequest, name: string, value: string) => void;

/**
 * Wraps `fetch` and `XMLHttpRequest` and records method, redacted URL, status, duration and redacted headers in a ring
 * buffer. Never recorded: values of `Authorization`, `Cookie`, `Set-Cookie`, `X-System-Setup-Token` and similar headers
 * (`[redacted]`), bodies of auth endpoints (`/iam/`, `/system-setup/`, … see `isLtBodyExcludedUrl`), streams
 * (`text/event-stream`), binary bodies and responses above 1 MB. Other bodies are redacted and cut to 1000 characters.
 * Static assets and the paths in `ignorePaths` (the report endpoint) are skipped. The response is handed to the caller
 * unchanged and without waiting for the body.
 */
export class LtNetworkCapture {
  /** While `true` (screenshot capture), requests are not recorded. */
  paused = false;

  private readonly buffer: LtRingBuffer<LtNetworkRequestEntry>;
  private restore: (() => void) | null = null;

  constructor(
    capacity: number,
    private readonly ignorePaths: readonly string[] = [],
  ) {
    this.buffer = new LtRingBuffer(capacity);
  }

  /** Whether `fetch` / `XMLHttpRequest` are currently wrapped. */
  get installed(): boolean {
    return this.restore !== null;
  }

  /** Wrap `view.fetch` and `view.XMLHttpRequest.prototype` (idempotent). */
  install(view: LtNetworkCaptureWindow): void {
    if (this.restore) {
      return;
    }
    const restorers: (() => void)[] = [];
    if (typeof view.fetch === 'function') {
      restorers.push(this.wrapFetch(view));
    }
    const proto = view.XMLHttpRequest?.prototype;
    if (proto && typeof proto.open === 'function' && typeof proto.send === 'function') {
      restorers.push(this.wrapXhr(view, proto));
    }
    this.restore = () => restorers.forEach((restore) => restore());
  }

  /** Restore the original `fetch` / `XMLHttpRequest` methods (only those still wrapped by this instance). */
  uninstall(): void {
    this.restore?.();
    this.restore = null;
  }

  /** The newest `limit` entries, oldest first. */
  entries(limit?: number): LtNetworkRequestEntry[] {
    return this.buffer.toArray(limit);
  }

  /** Number of stored entries. */
  get size(): number {
    return this.buffer.size;
  }

  /** Remove every entry. */
  clear(): void {
    this.buffer.clear();
  }

  /** Whether a request to `url` is recorded (no static asset, no data/blob URL, not an ignored path). */
  shouldCapture(url: string, view: Pick<Window, 'location'>): boolean {
    if (this.paused || /^(data|blob):/i.test(url)) {
      return false;
    }
    let pathname: string;
    try {
      pathname = new URL(url, view.location?.href || 'http://localhost/').pathname;
    } catch {
      return true;
    }
    const lower = pathname.toLowerCase();
    if (STATIC_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
      return false;
    }
    return !this.ignorePaths.some((path) => pathname === path || pathname.endsWith(path));
  }

  private wrapFetch(view: LtNetworkCaptureWindow): () => void {
    const originalFetch = view.fetch;
    const wrapped = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const [input, init] = args;
      const url = fetchUrl(input);
      if (!this.shouldCapture(url, view)) {
        return originalFetch.apply(view, args);
      }
      const request = isRequestLike(input) ? input : undefined;
      const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase();
      const excludeBody = isLtBodyExcludedUrl(url);
      const requestHeaders = redactLtHeaders(headersToRecord(request?.headers, init?.headers));
      const requestBody = excludeBody ? undefined : bodyText(init?.body);
      const startTime = Date.now();
      try {
        const response = await originalFetch.apply(view, args);
        const entry: LtNetworkRequestEntry = {
          duration: Date.now() - startTime,
          method,
          requestBody,
          requestHeaders,
          responseHeaders: redactLtHeaders(headersToRecord(response.headers)),
          status: response.status,
          statusText: response.statusText,
          timestamp: new Date().toISOString(),
          type: 'fetch',
          url: redactLtUrl(url),
        };
        this.buffer.push(entry);
        if (!excludeBody) {
          readResponseBody(response, entry);
        }
        return response;
      } catch (error) {
        this.buffer.push({
          duration: Date.now() - startTime,
          error: redactLtText(error instanceof Error ? error.message : String(error)),
          method,
          requestBody,
          requestHeaders,
          status: 0,
          statusText: 'Network Error',
          timestamp: new Date().toISOString(),
          type: 'fetch',
          url: redactLtUrl(url),
        });
        throw error;
      }
    };
    view.fetch = wrapped as typeof fetch;
    return () => {
      if (view.fetch === (wrapped as typeof fetch)) {
        view.fetch = originalFetch;
      }
    };
  }

  private wrapXhr(view: LtNetworkCaptureWindow, proto: XMLHttpRequest): () => void {
    // Arrow functions keep the capture as `this`; the patched methods below get the XMLHttpRequest as `this`.
    const shouldCapture = (url: string) => this.shouldCapture(url, view);
    const isPaused = () => this.paused;
    const record = (entry: LtNetworkRequestEntry) => this.buffer.push(entry);
    const infos = new WeakMap<XMLHttpRequest, XhrInfo>();
    const originalOpen = proto.open as XhrOpen;
    const originalSend = proto.send as XhrSend;
    const originalSetRequestHeader = proto.setRequestHeader as XhrSetRequestHeader;

    const open: XhrOpen = function (method, url, ...rest) {
      const urlString = String(url);
      infos.set(this, { capture: shouldCapture(urlString), headers: {}, method: String(method).toUpperCase(), url: urlString });
      return originalOpen.call(this, method, url, ...rest);
    };
    const setRequestHeader: XhrSetRequestHeader = function (name, value) {
      const info = infos.get(this);
      if (info) {
        info.headers[name] = value;
      }
      return originalSetRequestHeader.call(this, name, value);
    };
    const send: XhrSend = function (body) {
      const info = infos.get(this);
      if (!info?.capture || isPaused()) {
        return originalSend.call(this, body);
      }
      const excludeBody = isLtBodyExcludedUrl(info.url);
      const requestBody = excludeBody ? undefined : bodyText(body);
      const startTime = Date.now();
      this.addEventListener(
        'loadend',
        () => {
          const readable = this.responseType === '' || this.responseType === 'text';
          record({
            duration: Date.now() - startTime,
            ...(this.status === 0 ? { error: 'Network Error' } : {}),
            method: info.method,
            requestBody,
            requestHeaders: redactLtHeaders(info.headers),
            responseBody: !excludeBody && readable && this.responseText ? redactLtBody(this.responseText) : undefined,
            responseHeaders: redactLtHeaders(parseHeaderBlock(this.getAllResponseHeaders())),
            status: this.status,
            statusText: this.statusText,
            timestamp: new Date().toISOString(),
            type: 'xhr',
            url: redactLtUrl(info.url),
          });
        },
        { once: true },
      );
      return originalSend.call(this, body);
    };

    proto.open = open as XMLHttpRequest['open'];
    proto.send = send;
    proto.setRequestHeader = setRequestHeader;
    return () => {
      if (proto.open === (open as XMLHttpRequest['open'])) {
        proto.open = originalOpen as XMLHttpRequest['open'];
      }
      if (proto.send === send) {
        proto.send = originalSend;
      }
      if (proto.setRequestHeader === setRequestHeader) {
        proto.setRequestHeader = originalSetRequestHeader;
      }
    };
  }
}

function isRequestLike(input: unknown): input is Request {
  return typeof input === 'object' && input !== null && !(input instanceof URL) && typeof (input as Request).url === 'string';
}

/** URL of a `fetch()` call: string, `URL` (its `href`) or `Request` (its `url`). */
function fetchUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return isRequestLike(input) ? input.url : String(input ?? '');
}

/** Header map of a `Headers` object / init, later sources win. */
function headersToRecord(...sources: (HeadersInit | Headers | null | undefined)[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const source of sources) {
    if (!source) {
      continue;
    }
    try {
      new Headers(source).forEach((value, name) => (result[name.toLowerCase()] = value));
    } catch {
      // Invalid header init: nothing to record.
    }
  }
  return result;
}

/** Recordable text of a request body (binary bodies, form data and streams only as a marker). */
function bodyText(body: unknown): string | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body === 'string') {
    return redactLtBody(body);
  }
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return redactLtBody(body.toString());
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return '[FormData]';
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return `[Blob ${body.size} bytes]`;
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return `[binary ${(body as ArrayBuffer).byteLength} bytes]`;
  }
  return '[body not recorded]';
}

/** Read a textual response body in the background (the caller gets the response right away). */
function readResponseBody(response: Response, entry: LtNetworkRequestEntry): void {
  const type = (response.headers.get('content-type') ?? '').toLowerCase();
  const length = Number(response.headers.get('content-length') ?? 0);
  const textual = !type || /json|text\/|xml|javascript|x-www-form-urlencoded|graphql/.test(type);
  if (!textual || type.includes('event-stream') || length > MAX_RESPONSE_BYTES || response.bodyUsed) {
    return;
  }
  let clone: Response;
  try {
    clone = response.clone();
  } catch {
    return;
  }
  void clone.text().then(
    (text) => {
      if (text) {
        entry.responseBody = redactLtBody(text);
      }
    },
    () => undefined,
  );
}

function parseHeaderBlock(block: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of (block ?? '').split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index > 0) {
      result[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    }
  }
  return result;
}
