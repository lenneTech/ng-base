/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';

import { LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT, type LtRequestContext } from '@lenne.tech/ng-base';

import { ltAngularRequestHandler, withLtRuntimeConfigScript, type LtAngularEngine, type LtAngularRequestHandlerOptions } from './angular-handler';
import { readLtRequestContext } from './runtime-env';

const HTML = '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>App</title></head><body><app-root></app-root></body></html>';
const GUARD = `<script>${LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT}</script>`;
const ENV = {
  NG_API_URL: 'http://api.internal:3000',
  NG_PUBLIC_API_URL: 'https://api.example.com',
  NG_PUBLIC_APP_ENV: 'develop',
  NG_PUBLIC_LT_AUTH_LOGIN_PATH: '/anmelden',
  NG_PUBLIC_SITE_URL: 'https://app.example.com',
};

/** `ServerResponse` double that is a real `Writable`, as `writeResponseToNodeResponse()` streams into it. */
class FakeResponse extends Writable {
  statusCode = 200;
  readonly headers = new Map<string, number | string | string[]>();
  private readonly chunks: Buffer[] = [];

  get text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }

  getHeader(name: string) {
    return this.headers.get(name.toLowerCase());
  }

  hasHeader(name: string) {
    return this.headers.has(name.toLowerCase());
  }

  removeHeader(name: string) {
    this.headers.delete(name.toLowerCase());
  }

  setHeader(name: string, value: number | string | string[]) {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
}

function html(body = HTML, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, ...init, headers: { 'content-type': 'text/html; charset=utf-8', ...(init.headers as Record<string, string> | undefined) } });
}

function fakeEngine(answer: (request: IncomingMessage, context: LtRequestContext) => Promise<Response | null> | Response | null) {
  const handle = vi.fn(async (request: IncomingMessage, context?: unknown) => answer(request, context as LtRequestContext));
  return { engine: { handle } satisfies LtAngularEngine, handle };
}

/** Run the handler until the response is finished or `next()` was called. */
function render(engine: LtAngularEngine, options: LtAngularRequestHandlerOptions = {}, req = { headers: {}, method: 'GET', url: '/' } as unknown as IncomingMessage) {
  const res = new FakeResponse();
  return new Promise<{ error?: unknown; next: boolean; res: FakeResponse }>((resolve) => {
    res.once('finish', () => resolve({ next: false, res }));
    ltAngularRequestHandler(engine, options)(req, res as unknown as ServerResponse, (error?: unknown) => resolve({ error, next: true, res }));
  });
}

/** The JSON of `<script id="ng-runtime-config">`. */
function runtimeConfigOf(text: string): Record<string, unknown> {
  const match = /<script id="ng-runtime-config" type="application\/json">(.*?)<\/script>/s.exec(text);
  if (!match?.[1]) {
    throw new Error('no runtime config script');
  }
  return JSON.parse(match[1]) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('withLtRuntimeConfigScript()', () => {
  it('returns a non-HTML response unchanged', async () => {
    const response = new Response('{"a":1}', { headers: { 'content-type': 'application/json' } });
    expect(await withLtRuntimeConfigScript(response, { apiUrl: 'x' })).toBe(response);
  });

  it('writes guard and runtime config as first children of <head>, keeps status, statusText and headers, drops Content-Length', async () => {
    const response = html(HTML, { headers: { 'content-length': String(HTML.length), 'x-custom': 'kept' }, status: 404, statusText: 'Not Found' });
    const result = await withLtRuntimeConfigScript(response, { apiUrl: 'https://api.example.com' });
    expect(result.status).toBe(404);
    expect(result.statusText).toBe('Not Found');
    expect(result.headers.get('x-custom')).toBe('kept');
    expect(result.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(result.headers.get('content-length')).toBeNull();
    const text = await result.text();
    expect(text).toBe(HTML.replace('<head>', `<head>${GUARD}<script id="ng-runtime-config" type="application/json">{"apiUrl":"https://api.example.com"}</script>`));
  });

  it('leaves the guard out with submitGuard: false', async () => {
    const text = await (await withLtRuntimeConfigScript(html(), { apiUrl: '' }, { submitGuard: false })).text();
    expect(text).not.toContain(LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT);
    expect(text).toContain('<head><script id="ng-runtime-config" type="application/json">');
  });
});

describe('ltAngularRequestHandler()', () => {
  it('renders with the request context read from the env and passes the request through', async () => {
    const { engine, handle } = fakeEngine(() => html());
    const req = { headers: { host: 'localhost' }, method: 'GET', url: '/start' } as unknown as IncomingMessage;
    await render(engine, { appVersion: '1.2.3', env: ENV }, req);
    expect(handle).toHaveBeenCalledOnce();
    expect(handle.mock.calls[0]?.[0]).toBe(req);
    expect(handle.mock.calls[0]?.[1]).toEqual(readLtRequestContext(ENV, { appVersion: '1.2.3' }));
    expect((handle.mock.calls[0]?.[1] as LtRequestContext | undefined)?.serverApiUrl).toBe('http://api.internal:3000');
  });

  it('writes the public runtime config and the submit guard into the HTML', async () => {
    const { engine } = fakeEngine(() => html());
    const { next, res } = await render(engine, { appVersion: '1.2.3', env: ENV });
    expect(next).toBe(false);
    expect(res.statusCode).toBe(200);
    expect(res.text.startsWith(`<!doctype html><html lang="de"><head>${GUARD}<script id="ng-runtime-config" type="application/json">`)).toBe(true);
    expect(res.text).toContain('<title>App</title></head><body><app-root></app-root></body></html>');
    expect(runtimeConfigOf(res.text)).toEqual({
      apiUrl: 'https://api.example.com',
      appCommit: 'unknown',
      appEnv: 'develop',
      appVersion: '1.2.3',
      lt: { auth: { loginPath: '/anmelden' } },
      siteUrl: 'https://app.example.com',
    });
  });

  it('never writes NG_API_URL into the HTML', async () => {
    const { engine } = fakeEngine(() => html());
    const { res } = await render(engine, { env: ENV });
    expect(res.text).not.toContain('api.internal');
    expect(res.text).not.toContain('serverApiUrl');
  });

  it('leaves the submit guard out with submitGuard: false', async () => {
    const { engine } = fakeEngine(() => html());
    const { res } = await render(engine, { env: ENV, submitGuard: false });
    expect(res.text).not.toContain(LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT);
    expect(runtimeConfigOf(res.text)['siteUrl']).toBe('https://app.example.com');
  });

  it('escapes env values so they cannot break out of the script element', async () => {
    const { engine } = fakeEngine(() => html());
    const evil = 'https://app.example.com/</script><script>alert(1)</script><!--';
    const { res } = await render(engine, { env: { NG_PUBLIC_SITE_URL: evil } });
    expect(res.text).not.toContain('<script>alert(1)');
    expect(res.text).not.toContain('<!--');
    expect(res.text.match(/<\/script>/g)).toHaveLength(2);
    expect(runtimeConfigOf(res.text)['siteUrl']).toBe(evil);
  });

  it('sets the HTML cache headers by default and drops Content-Length of the changed body', async () => {
    const { engine } = fakeEngine(() => html(HTML, { headers: { 'content-length': String(HTML.length), 'x-render': 'ssr' } }));
    const { res } = await render(engine, { env: ENV });
    expect(res.getHeader('cache-control')).toBe('private, no-cache');
    expect(res.getHeader('vary')).toBe('Cookie');
    expect(res.getHeader('x-render')).toBe('ssr');
    expect(res.getHeader('content-type')).toBe('text/html; charset=utf-8');
    expect(res.hasHeader('content-length')).toBe(false);
  });

  it('keeps an own Cache-Control and skips the cache headers with htmlNoCache: false', async () => {
    const own = await render(fakeEngine(() => html(HTML, { headers: { 'cache-control': 'public, max-age=60' } })).engine, { env: ENV });
    expect(own.res.getHeader('cache-control')).toBe('public, max-age=60');
    expect(own.res.hasHeader('vary')).toBe(false);
    const off = await render(fakeEngine(() => html()).engine, { env: ENV, htmlNoCache: false });
    expect(off.res.hasHeader('cache-control')).toBe(false);
    expect(off.res.hasHeader('vary')).toBe(false);
    expect(runtimeConfigOf(off.res.text)['apiUrl']).toBe('https://api.example.com');
  });

  it('keeps the status of the rendered page (e.g. 404)', async () => {
    const { res } = await render(fakeEngine(() => html(HTML, { status: 404 })).engine, { env: ENV });
    expect(res.statusCode).toBe(404);
    expect(runtimeConfigOf(res.text)['apiUrl']).toBe('https://api.example.com');
  });

  it('leaves non-HTML responses untouched', async () => {
    const body = '{"ok":true,"head":"<head>"}';
    const { engine } = fakeEngine(() => new Response(body, { headers: { 'content-type': 'application/json' }, status: 201 }));
    const { res } = await render(engine, { env: ENV });
    expect(res.statusCode).toBe(201);
    expect(res.text).toBe(body);
    expect(res.getHeader('content-type')).toBe('application/json');
    expect(res.hasHeader('cache-control')).toBe(false);
    expect(res.hasHeader('vary')).toBe(false);
  });

  it('calls next() when the engine does not handle the request', async () => {
    const { engine } = fakeEngine(() => null);
    const { error, next, res } = await render(engine, { env: ENV });
    expect(next).toBe(true);
    expect(error).toBeUndefined();
    expect(res.writableEnded).toBe(false);
    expect(res.headers.size).toBe(0);
  });

  it('passes a render error to next(error)', async () => {
    const failure = new Error('render failed');
    const { engine } = fakeEngine(() => Promise.reject(failure));
    const { error, next, res } = await render(engine, { env: ENV });
    expect(next).toBe(true);
    expect(error).toBe(failure);
    expect(res.writableEnded).toBe(false);
  });

  it('reads the env per request (no rebuild or restart for a changed env)', async () => {
    const env: Record<string, string | undefined> = { NG_PUBLIC_API_URL: 'https://first.example.com' };
    const { engine } = fakeEngine(() => html());
    const handler = { env };
    expect(runtimeConfigOf((await render(engine, handler)).res.text)['apiUrl']).toBe('https://first.example.com');
    env['NG_PUBLIC_API_URL'] = 'https://second.example.com';
    expect(runtimeConfigOf((await render(engine, handler)).res.text)['apiUrl']).toBe('https://second.example.com');
  });

  it('reads process.env by default', async () => {
    vi.stubEnv('NG_PUBLIC_SITE_URL', 'https://process.example.com');
    vi.stubEnv('NG_API_URL', 'http://process-api.internal:3000');
    const { engine, handle } = fakeEngine(() => html());
    const { res } = await render(engine);
    expect(runtimeConfigOf(res.text)['siteUrl']).toBe('https://process.example.com');
    expect((handle.mock.calls[0]?.[1] as LtRequestContext | undefined)?.serverApiUrl).toBe('http://process-api.internal:3000');
    expect(res.text).not.toContain('process-api.internal');
  });
});
