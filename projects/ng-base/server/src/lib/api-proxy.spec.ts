/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable, Writable } from 'node:stream';

import { ltApiProxy, rewriteLtProxyCookie, rewriteLtProxyLocation, type LtApiProxyOptions } from './api-proxy';

const TARGET = 'http://api.internal:3000';
const ENV = { NG_API_URL: TARGET, NG_PUBLIC_API_PROXY: 'true' };

/** `ServerResponse` double that is a real `Writable`, so the proxy can pipe the upstream body into it. */
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

/** Upstream response as Node's fetch returns it (`getSetCookie()`; happy-dom's `Response` drops `Set-Cookie`). */
function upstream(init: { body?: string | null; headers?: [string, string][]; status?: number } = {}) {
  const entries = init.headers ?? [];
  const text = init.body === undefined ? '' : init.body;
  return {
    body:
      text === null
        ? null
        : new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(text));
              controller.close();
            },
          }),
    headers: {
      forEach: (callback: (value: string, name: string) => void) => entries.forEach(([name, value]) => callback(value, name.toLowerCase())),
      getSetCookie: () => entries.filter(([name]) => name.toLowerCase() === 'set-cookie').map(([, value]) => value),
    },
    status: init.status ?? 200,
  };
}

interface FetchCall {
  init: RequestInit & { duplex?: string };
  url: string;
}

function stubFetch(answer: (call: FetchCall) => unknown = () => upstream()) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { init, url: String(input) };
    calls.push(call);
    return answer(call);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function fakeRequest(request: { body?: string; headers?: Record<string, string | string[]>; method?: string; socket?: object; url?: string }): IncomingMessage {
  const req = Readable.from(request.body ? [Buffer.from(request.body)] : [], { objectMode: false }) as unknown as IncomingMessage;
  Object.assign(req, { headers: request.headers ?? {}, method: request.method ?? 'GET', socket: request.socket ?? {}, url: request.url ?? '/api/iam/get-session' });
  return req;
}

/** Run the proxy until the response is finished or `next()` was called. */
function proxy(options: LtApiProxyOptions, request: Parameters<typeof fakeRequest>[0] = {}) {
  const res = new FakeResponse();
  const req = fakeRequest(request);
  return new Promise<{ next: boolean; res: FakeResponse }>((resolve) => {
    res.once('finish', () => resolve({ next: false, res }));
    ltApiProxy(options)(req, res as unknown as ServerResponse, () => resolve({ next: true, res }));
  });
}

async function readBody(body: unknown): Promise<string> {
  if (!body) {
    return '';
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('rewriteLtProxyCookie()', () => {
  it('drops Domain and Secure on plain HTTP and forces Path=/', () => {
    expect(rewriteLtProxyCookie('session=abc; Domain=localhost; Path=/iam; HttpOnly; Secure; SameSite=Lax', false)).toBe('session=abc; Path=/; HttpOnly; SameSite=Lax');
  });

  it('keeps Secure on HTTPS', () => {
    expect(rewriteLtProxyCookie('session=abc; domain=.example.com; path=/iam; secure; HttpOnly', true)).toBe('session=abc; Path=/; secure; HttpOnly');
  });

  it('matches the attributes case-insensitively and keeps the value', () => {
    expect(rewriteLtProxyCookie('token=a=b; DOMAIN=x; PATH=/a; SECURE', false)).toBe('token=a=b; Path=/');
  });

  it('adds Path=/ to a cookie without Path attribute, and never touches the cookie name', () => {
    expect(rewriteLtProxyCookie('session=abc; HttpOnly', false)).toBe('session=abc; Path=/; HttpOnly');
    expect(rewriteLtProxyCookie('path=/x; Path=/iam', false)).toBe('path=/x; Path=/');
  });
});

describe('rewriteLtProxyLocation()', () => {
  it('maps URLs on the proxy target and API paths to the proxied path, and leaves other origins alone', () => {
    expect(rewriteLtProxyLocation(`${TARGET}/tus/abc?x=1`, TARGET, '/api')).toBe('/api/tus/abc?x=1');
    expect(rewriteLtProxyLocation('/tus/abc', TARGET, '/api')).toBe('/api/tus/abc');
    expect(rewriteLtProxyLocation('http://api.internal:3000/base/tus/1', 'http://api.internal:3000/base', '/api')).toBe('/api/tus/1');
    expect(rewriteLtProxyLocation('https://accounts.example.com/oauth', TARGET, '/api')).toBe('https://accounts.example.com/oauth');
    expect(rewriteLtProxyLocation('//evil.example/x', TARGET, '/api')).toBe('//evil.example/x');
  });
});

describe('ltApiProxy()', () => {
  it('forwards /api/<path> with query to <NG_API_URL>/<path> and streams the answer back', async () => {
    const { calls } = stubFetch(() => upstream({ body: '{"ok":true}', headers: [['content-type', 'application/json']], status: 201 }));
    const { next, res } = await proxy({ env: ENV }, { url: '/api/iam/get-session?disableCookieCache=true' });
    expect(next).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${TARGET}/iam/get-session?disableCookieCache=true`);
    expect(calls[0]?.init.redirect).toBe('manual');
    expect(res.statusCode).toBe(201);
    expect(res.getHeader('content-type')).toBe('application/json');
    expect(res.text).toBe('{"ok":true}');
  });

  it('matches the prefix exactly: /api, /api/… and /api?… only', async () => {
    const { calls } = stubFetch();
    expect((await proxy({ env: ENV }, { url: '/api' })).next).toBe(false);
    expect(calls[0]?.url).toBe(`${TARGET}/`);
    expect((await proxy({ env: ENV }, { url: '/api?x=1' })).next).toBe(false);
    expect(calls[1]?.url).toBe(`${TARGET}?x=1`);
    for (const url of ['/', '/apix', '/apis/x', '/app/api/x', '/API/x']) {
      expect((await proxy({ env: ENV }, { url })).next).toBe(true);
    }
    expect(calls).toHaveLength(2);
  });

  it('supports a custom prefix (trailing slash ignored)', async () => {
    const { calls } = stubFetch();
    expect((await proxy({ env: ENV, prefix: '/backend/' }, { url: '/backend/files/1' })).next).toBe(false);
    expect(calls[0]?.url).toBe(`${TARGET}/files/1`);
    expect((await proxy({ env: ENV, prefix: '/backend/' }, { url: '/api/files/1' })).next).toBe(true);
  });

  it('never leaves the target origin', async () => {
    const { calls } = stubFetch();
    await proxy({ env: ENV }, { url: '/api//evil.example/steal' });
    await proxy({ env: ENV }, { url: '/api/../../admin' });
    await proxy({ env: ENV }, { url: '/api?@evil.example' });
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(new URL(call.url).origin).toBe(TARGET);
    }
  });

  describe('enabled', () => {
    it('is off unless NG_PUBLIC_API_PROXY is true', async () => {
      const { fetchMock } = stubFetch();
      expect((await proxy({ env: { NG_API_URL: TARGET } })).next).toBe(true);
      expect((await proxy({ env: { NG_API_URL: TARGET, NG_PUBLIC_API_PROXY: 'false' } })).next).toBe(true);
      expect((await proxy({ env: { NG_API_URL: TARGET, NG_PUBLIC_API_PROXY: 'nonsense' } })).next).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('options.enabled overrides the env both ways', async () => {
      const { fetchMock } = stubFetch();
      expect((await proxy({ enabled: false, env: ENV })).next).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await proxy({ enabled: true, env: { NG_API_URL: TARGET } })).next).toBe(false);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('reads process.env per request by default', async () => {
      const { calls } = stubFetch();
      const middleware = ltApiProxy();
      const run = () =>
        new Promise<boolean>((resolve) => {
          const res = new FakeResponse();
          res.once('finish', () => resolve(false));
          middleware(fakeRequest({}), res as unknown as ServerResponse, () => resolve(true));
        });
      vi.stubEnv('NG_PUBLIC_API_PROXY', 'false');
      vi.stubEnv('NG_API_URL', TARGET);
      expect(await run()).toBe(true);
      vi.stubEnv('NG_PUBLIC_API_PROXY', 'true');
      expect(await run()).toBe(false);
      expect(calls[0]?.url).toBe(`${TARGET}/iam/get-session`);
    });
  });

  describe('target', () => {
    it('uses options.target before NG_API_URL and strips trailing slashes', async () => {
      const { calls } = stubFetch();
      await proxy({ env: ENV, target: 'http://other.internal:4000//' }, { url: '/api/x' });
      expect(calls[0]?.url).toBe('http://other.internal:4000/x');
    });

    it('falls back to NG_PUBLIC_API_URL', async () => {
      const { calls } = stubFetch();
      await proxy({ env: { NG_PUBLIC_API_PROXY: 'true', NG_PUBLIC_API_URL: 'https://api.example.com/' } }, { url: '/api/x' });
      expect(calls[0]?.url).toBe('https://api.example.com/x');
    });

    it('calls next() without any target', async () => {
      const { fetchMock } = stubFetch();
      expect((await proxy({ env: { NG_PUBLIC_API_PROXY: 'true' } })).next).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('request', () => {
    it('forwards only the allowlisted headers (auth, cookies, tenant, TUS), arrays joined', async () => {
      const { calls } = stubFetch();
      await proxy(
        { env: ENV },
        {
          headers: {
            accept: 'application/json',
            authorization: 'Bearer token',
            connection: 'keep-alive',
            cookie: 'session=abc',
            host: 'localhost:3001',
            'proxy-authorization': 'Basic secret',
            'tus-resumable': '1.0.0',
            'upload-offset': '0',
            'x-custom': 'nope',
            'x-forwarded-for': '10.0.0.1',
            'x-system-setup-token': 'setup',
            'x-tenant-id': ['t1', 't2'],
          },
        },
      );
      const headers = calls[0]?.init.headers as Headers;
      expect(Object.fromEntries(headers.entries())).toEqual({
        accept: 'application/json',
        authorization: 'Bearer token',
        cookie: 'session=abc',
        'tus-resumable': '1.0.0',
        'upload-offset': '0',
        'x-system-setup-token': 'setup',
        'x-tenant-id': 't1, t2',
      });
    });

    it('forwards GET/HEAD without a body', async () => {
      const { calls } = stubFetch();
      await proxy({ env: ENV }, { method: 'GET' });
      await proxy({ env: ENV }, { method: 'head' });
      expect(calls.map((call) => call.init.method)).toEqual(['GET', 'HEAD']);
      for (const call of calls) {
        expect(call.init.body).toBeUndefined();
        expect(call.init.duplex).toBeUndefined();
      }
    });

    it('streams the body of other methods (duplex: half), method upper-cased', async () => {
      const bodies: string[] = [];
      const { calls } = stubFetch(async (call) => {
        bodies.push(await readBody(call.init.body));
        return upstream();
      });
      await proxy({ env: ENV }, { body: '{"email":"a@b.c"}', headers: { 'content-type': 'application/json' }, method: 'post', url: '/api/iam/sign-in/email' });
      await proxy({ env: ENV }, { body: 'chunk', headers: { 'content-type': 'application/offset+octet-stream' }, method: 'PATCH', url: '/api/tus/1' });
      expect(calls.map((call) => [call.init.method, call.init.duplex])).toEqual([
        ['POST', 'half'],
        ['PATCH', 'half'],
      ]);
      expect(bodies).toEqual(['{"email":"a@b.c"}', 'chunk']);
    });

    it('passes an abort signal that fires when the client goes away', async () => {
      let signal: AbortSignal | undefined;
      stubFetch(
        (call) =>
          new Promise((_resolve, reject) => {
            signal = call.init.signal ?? undefined;
            signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      const res = new FakeResponse();
      const next = vi.fn();
      ltApiProxy({ env: ENV })(fakeRequest({}), res as unknown as ServerResponse, next);
      await vi.waitFor(() => expect(signal).toBeDefined());
      expect(signal?.aborted).toBe(false);
      res.emit('close');
      expect(signal?.aborted).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      // An aborted request writes nothing (no 502 to a client that is gone).
      expect(res.writableEnded).toBe(false);
      expect(res.statusCode).toBe(200);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('response', () => {
    it('copies status and headers but drops hop-by-hop headers', async () => {
      stubFetch(() =>
        upstream({
          body: 'x',
          headers: [
            ['cache-control', 'no-store'],
            ['connection', 'keep-alive'],
            ['content-encoding', 'gzip'],
            ['content-length', '999'],
            ['content-type', 'text/plain'],
            ['keep-alive', 'timeout=5'],
            ['proxy-authenticate', 'Basic'],
            ['trailer', 'x'],
            ['transfer-encoding', 'chunked'],
            ['upgrade', 'h2c'],
            ['x-request-id', 'r1'],
          ],
          status: 418,
        }),
      );
      const { res } = await proxy({ env: ENV });
      expect(res.statusCode).toBe(418);
      expect(Object.fromEntries(res.headers)).toEqual({ 'cache-control': 'no-store', 'content-type': 'text/plain', 'x-request-id': 'r1' });
      expect(res.text).toBe('x');
    });

    it('never hands the internal NG_API_URL to the browser in a Location header (TUS upload URL)', async () => {
      stubFetch(() => upstream({ body: null, headers: [['location', `${TARGET}/tus/373ec6`]], status: 201 }));
      const { res } = await proxy({ env: ENV }, { method: 'POST', url: '/api/tus' });
      expect(res.statusCode).toBe(201);
      expect(res.getHeader('location')).toBe('/api/tus/373ec6');
    });

    it('passes redirects through instead of following them', async () => {
      stubFetch(() => upstream({ body: null, headers: [['location', 'https://accounts.example.com/oauth']], status: 302 }));
      const { res } = await proxy({ env: ENV }, { url: '/api/iam/sign-in/social' });
      expect(res.statusCode).toBe(302);
      expect(res.getHeader('location')).toBe('https://accounts.example.com/oauth');
      expect(res.text).toBe('');
    });

    it('rewrites every Set-Cookie for the app origin (plain HTTP: no Secure)', async () => {
      stubFetch(() =>
        upstream({
          headers: [
            ['set-cookie', 'session=abc; Domain=localhost; Path=/iam; HttpOnly; Secure; SameSite=Lax'],
            ['set-cookie', 'token=xyz; Path=/; Secure'],
          ],
        }),
      );
      const { res } = await proxy({ env: ENV });
      expect(res.getHeader('set-cookie')).toEqual(['session=abc; Path=/; HttpOnly; SameSite=Lax', 'token=xyz; Path=/']);
    });

    it('keeps Secure when the request came in over HTTPS (X-Forwarded-Proto)', async () => {
      stubFetch(() => upstream({ headers: [['set-cookie', 'session=abc; Domain=localhost; Path=/iam; Secure']] }));
      const { res } = await proxy({ env: ENV }, { headers: { 'x-forwarded-proto': 'https' } });
      expect(res.getHeader('set-cookie')).toEqual(['session=abc; Path=/; Secure']);
    });

    it('keeps Secure when the request came in on a TLS socket without X-Forwarded-Proto', async () => {
      stubFetch(() => upstream({ headers: [['set-cookie', 'session=abc; Path=/iam; Secure']] }));
      const { res } = await proxy({ env: ENV }, { socket: { encrypted: true } });
      expect(res.getHeader('set-cookie')).toEqual(['session=abc; Path=/; Secure']);
    });

    it('sets no Set-Cookie header when the API sends none', async () => {
      stubFetch(() => upstream({ headers: [['content-type', 'application/json']] }));
      const { res } = await proxy({ env: ENV });
      expect(res.hasHeader('set-cookie')).toBe(false);
    });

    it('survives a client that leaves mid-stream: the aborted upstream body ends the response, no unhandled error', async () => {
      const unhandled = vi.fn();
      process.on('uncaughtException', unhandled);
      try {
        stubFetch(() => ({
          ...upstream({ headers: [['content-type', 'text/event-stream']] }),
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: 1\n\n'));
              setTimeout(() => controller.error(new DOMException('This operation was aborted', 'AbortError')), 10);
            },
          }),
        }));
        const res = new FakeResponse();
        const closed = new Promise<void>((resolve) => res.once('close', () => resolve()));
        ltApiProxy({ env: ENV })(fakeRequest({ url: '/api/sync/hints' }), res as unknown as ServerResponse, () => undefined);
        await closed;
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(res.destroyed).toBe(true);
        expect(res.text).toBe('data: 1\n\n');
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('uncaughtException', unhandled);
      }
    });

    it('ends the response when the API answers without a body', async () => {
      stubFetch(() => upstream({ body: null, status: 204 }));
      const { res } = await proxy({ env: ENV });
      expect(res.statusCode).toBe(204);
      expect(res.writableEnded).toBe(true);
      expect(res.text).toBe('');
    });
  });

  describe('errors', () => {
    it('answers 502 JSON when the API is unreachable, without the low-level cause', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      stubFetch(() => Promise.reject(new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 10.0.0.5:3000') })));
      const { next, res } = await proxy({ env: ENV });
      expect(next).toBe(false);
      expect(res.statusCode).toBe(502);
      expect(res.getHeader('content-type')).toBe('application/json');
      const body = JSON.parse(res.text) as { message: string };
      expect(body.message).toMatch(/^API proxy error/);
      expect(res.text).not.toContain('10.0.0.5');
      expect(res.text).not.toContain('api.internal');
    });

    it('never reflects the error message (which may contain the internal NG_API_URL) to the client', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      stubFetch(() => Promise.reject(new TypeError('Failed to parse URL from 10.0.0.5:3000/iam/get-session')));
      const { res } = await proxy({ env: ENV });
      expect(res.statusCode).toBe(502);
      expect(JSON.parse(res.text)).toEqual({ message: 'API proxy error' });
      expect(log).toHaveBeenCalled();
    });
  });
});
