import { LtNetworkCapture, type LtNetworkCaptureWindow } from './network-capture';

/** Minimal XMLHttpRequest double: `send()` completes synchronously with the configured response. */
class FakeXhr extends EventTarget {
  static next = { body: '{"ok":true}', headers: 'content-type: application/json\r\nset-cookie: s=1', status: 200 };
  responseType: XMLHttpRequestResponseType = '';
  responseText = '';
  status = 0;
  statusText = '';
  private headers = '';

  open(_method: string, _url: string): void {}
  setRequestHeader(_name: string, _value: string): void {}
  send(_body?: unknown): void {
    this.status = FakeXhr.next.status;
    this.statusText = FakeXhr.next.status === 200 ? 'OK' : 'Error';
    this.responseText = this.responseType === '' ? FakeXhr.next.body : '';
    this.headers = FakeXhr.next.headers;
    this.dispatchEvent(new Event('loadend'));
  }
  getAllResponseHeaders(): string {
    return this.headers;
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('LtNetworkCapture', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let view: LtNetworkCaptureWindow;
  let capture: LtNetworkCapture;
  const originalOpen = FakeXhr.prototype.open;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response('{"id":1,"password":"secret1"}', { headers: { 'content-type': 'application/json', 'x-auth-token': 'tok-1' }, status: 200, statusText: 'OK' })),
      );
    view = { fetch: fetchMock as unknown as typeof fetch, location: { href: 'https://app.test/page' } as Location, XMLHttpRequest: FakeXhr as unknown as typeof XMLHttpRequest };
    capture = new LtNetworkCapture(50, ['/_bug-lt/report']);
    capture.install(view);
  });

  afterEach(() => capture.uninstall());

  it('records the href when fetch is called with a URL object (bug.lt #3)', async () => {
    await view.fetch(new URL('https://example.com/api/health'));
    expect(capture.entries().map((entry) => entry.url)).toEqual(['https://example.com/api/health']);
  });

  it('records a plain string URL and the url and method of a Request', async () => {
    await view.fetch('https://example.com/api/data');
    await view.fetch(new Request('https://example.com/api/post', { method: 'POST' }));
    expect(capture.entries().map((entry) => [entry.method, entry.url])).toEqual([
      ['GET', 'https://example.com/api/data'],
      ['POST', 'https://example.com/api/post'],
    ]);
  });

  it('never records credential headers and redacts body secrets of normal endpoints', async () => {
    await view.fetch('/api/users', {
      body: JSON.stringify({ name: 'Max', password: 'hunter2' }),
      headers: { Authorization: 'Bearer abc', Cookie: 's=1', 'X-System-Setup-Token': 'x' },
      method: 'POST',
    });
    await flush();
    const [entry] = capture.entries();
    expect(entry?.requestHeaders).toMatchObject({ authorization: '[redacted]', cookie: '[redacted]', 'x-system-setup-token': '[redacted]' });
    expect(entry?.responseHeaders?.['x-auth-token']).toBe('[redacted]');
    expect(entry?.requestBody).toBe('{"name":"Max","password":"[redacted]"}');
    expect(entry?.responseBody).toBe('{"id":1,"password":"[redacted]"}');
    expect(JSON.stringify(entry)).not.toMatch(/hunter2|secret1|Bearer abc|tok-1/);
  });

  it('never records request or response bodies of /iam/ and /system-setup/ endpoints', async () => {
    await view.fetch('https://api.test/iam/sign-in/email', { body: '{"email":"a@b.de","password":"x"}', method: 'POST' });
    await view.fetch('/api/system-setup/init', { body: '{"password":"y"}', method: 'POST' });
    await flush();
    for (const entry of capture.entries()) {
      expect(entry.requestBody).toBeUndefined();
      expect(entry.responseBody).toBeUndefined();
    }
    expect(capture.entries()).toHaveLength(2);
  });

  it('redacts token and code parameters in recorded URLs', async () => {
    await view.fetch('https://api.test/iam/verify-email?token=abc&callbackURL=https://app.test/?code=42');
    expect(capture.entries()[0]?.url).toBe('https://api.test/iam/verify-email?token=[redacted]&callbackURL=https://app.test/?code=[redacted]');
  });

  it('skips static assets, data URLs and the report endpoint', async () => {
    await view.fetch('/assets/logo.png');
    await view.fetch('data:text/plain,hi');
    await view.fetch('/_bug-lt/report', { body: '{}', method: 'POST' });
    expect(capture.entries()).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps the newest maxNetworkRequests entries', async () => {
    capture.uninstall();
    capture = new LtNetworkCapture(2);
    capture.install(view);
    for (const id of [1, 2, 3]) {
      await view.fetch(`/api/items/${id}`);
    }
    expect(capture.entries().map((entry) => entry.url)).toEqual(['/api/items/2', '/api/items/3']);
  });

  it('records failed requests with status 0 and rethrows the error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(view.fetch('/api/down')).rejects.toThrow('Failed to fetch');
    expect(capture.entries()[0]).toMatchObject({ error: 'Failed to fetch', status: 0, statusText: 'Network Error', url: '/api/down' });
  });

  it('hands out the response at once and never reads streams', async () => {
    const stream = new Response(new ReadableStream({ start: () => undefined }), { headers: { 'content-type': 'text/event-stream' } });
    fetchMock.mockResolvedValueOnce(stream);
    const response = await view.fetch('/api/ai/stream');
    expect(response).toBe(stream);
    expect(response.bodyUsed).toBe(false);
    expect(capture.entries()[0]?.responseBody).toBeUndefined();
  });

  it('records XMLHttpRequest calls with redacted headers and body', () => {
    const xhr = new (view.XMLHttpRequest as unknown as typeof FakeXhr)();
    xhr.open('post', '/api/orders?token=t');
    xhr.setRequestHeader('Authorization', 'Bearer t');
    xhr.send('{"password":"p","qty":1}');
    expect(capture.entries()[0]).toMatchObject({
      method: 'POST',
      requestBody: '{"password":"[redacted]","qty":1}',
      requestHeaders: { Authorization: '[redacted]' },
      responseBody: '{"ok":true}',
      responseHeaders: { 'content-type': 'application/json', 'set-cookie': '[redacted]' },
      status: 200,
      type: 'xhr',
      url: '/api/orders?token=[redacted]',
    });
  });

  it('does not read responseText of non-text XMLHttpRequest responses and skips /iam/ bodies', () => {
    const json = new (view.XMLHttpRequest as unknown as typeof FakeXhr)();
    json.responseType = 'json';
    json.open('GET', '/api/data');
    json.send();
    const iam = new (view.XMLHttpRequest as unknown as typeof FakeXhr)();
    iam.open('POST', '/iam/sign-in/email');
    iam.send('{"password":"x"}');
    const [first, second] = capture.entries();
    expect(first?.responseBody).toBeUndefined();
    expect(second?.requestBody).toBeUndefined();
    expect(second?.responseBody).toBeUndefined();
  });

  it('pauses recording and restores fetch and XMLHttpRequest on uninstall', async () => {
    capture.paused = true;
    await view.fetch('/api/paused');
    capture.paused = false;
    expect(capture.entries()).toHaveLength(0);
    capture.uninstall();
    expect(view.fetch).toBe(fetchMock);
    expect(FakeXhr.prototype.open).toBe(originalOpen);
  });
});
