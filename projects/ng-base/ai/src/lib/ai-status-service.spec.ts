import { PendingTasks, PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LT_FETCH, LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';

import { LT_AI_STATUS_STATE_KEY, LtAiStatusService } from './ai-status-service';
import type { LtAiStatus } from './ai-types';

function answer(status: number, body: unknown, isJson = true): Response {
  return new Response(isJson ? JSON.stringify(body) : '<!doctype html><html></html>', { status });
}

describe('LtAiStatusService', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  const authFetch = vi.fn();

  function setup(platform: 'browser' | 'server' = 'browser', transferred?: LtAiStatus): LtAiStatusService {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: LT_FETCH, useValue: authFetch },
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.test' }) },
      ],
    });
    if (transferred) {
      TestBed.inject(TransferState).set(LT_AI_STATUS_STATE_KEY, transferred);
    }
    return TestBed.inject(LtAiStatusService);
  }

  beforeEach(() => {
    fetchMock.mockReset();
    authFetch.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('what each answer means', () => {
    it.each([true, false])('reports the module as on with mcp=%s for a 200', async (mcp) => {
      fetchMock.mockResolvedValueOnce(answer(200, { mcp }));
      const status = setup();
      expect(status.loaded()).toBe(false);

      await status.load();

      expect(status.enabled()).toBe(true);
      expect(status.mcp()).toBe(mcp);
      expect(status.error()).toBeNull();
      expect(status.loaded()).toBe(true);
    });

    it('asks the public endpoint with plain fetch and without credentials', async () => {
      fetchMock.mockResolvedValueOnce(answer(200, { mcp: true }));
      await setup().load();

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.test/ai/status');
      expect(init?.credentials).toBe('omit');
      expect(init?.headers).not.toHaveProperty('Authorization');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(authFetch).not.toHaveBeenCalled();
    });

    it('treats a 404 as "AI is off", not as an error', async () => {
      fetchMock.mockResolvedValueOnce(answer(404, { message: 'Not Found', statusCode: 404 }));
      const status = setup();

      await status.load();

      expect(status.enabled()).toBe(false);
      expect(status.mcp()).toBe(false);
      expect(status.error()).toBeNull();
      expect(status.loaded()).toBe(true);
    });

    it.each([
      ['a 5xx', () => fetchMock.mockResolvedValueOnce(answer(503, { message: 'Service Unavailable' })), 'HTTP 503'],
      ['a network error', () => fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')), 'AI status request failed'],
      ['a timeout', () => fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), 'AI status request timed out'],
      ['an HTML page with 200', () => fetchMock.mockResolvedValueOnce(answer(200, undefined, false)), 'Unexpected AI status response'],
      ['a 200 without a boolean mcp', () => fetchMock.mockResolvedValueOnce(answer(200, { mcp: 'yes' })), 'Unexpected AI status response'],
    ])('fails closed on %s and says why', async (_label, arrange, message) => {
      arrange();
      const status = setup();

      await expect(status.load()).resolves.toBeUndefined();

      expect(status.enabled()).toBe(false);
      expect(status.mcp()).toBe(false);
      expect(status.error()).toBe(message);
      expect(status.loaded()).toBe(true);
    });

    it('gives up after 5 s and fails closed', async () => {
      const controller = new AbortController();
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
      fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))));
      const status = setup();
      const loading = status.load();

      controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
      await loading;

      expect(timeout).toHaveBeenCalledWith(5000);
      expect(status.loaded()).toBe(true);
      expect(status.enabled()).toBe(false);
      expect(status.error()).toBe('AI status request timed out');
    });

    it('never puts the raw error (private API URL, credentials) into the state', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to parse URL from 10.12.0.5:3000/ai/status'));
      const status = setup('server');
      await status.load();
      fetchMock.mockRejectedValueOnce(new TypeError('Request cannot be constructed from a URL that includes credentials: http://svc:s3cret@api-internal:3000/ai/status'));
      await status.load({ force: true });

      const serialized = JSON.stringify(TestBed.inject(TransferState).get(LT_AI_STATUS_STATE_KEY, null)) + JSON.stringify(status.error());
      expect(serialized).not.toContain('10.12.0.5');
      expect(serialized).not.toContain('s3cret');
      expect(serialized).not.toContain('api-internal');
    });
  });

  describe('one request per app', () => {
    it('shares one request between callers loading at the same time', async () => {
      fetchMock.mockResolvedValueOnce(answer(200, { mcp: true }));
      const status = setup();

      await Promise.all([status.load(), status.load(), TestBed.inject(LtAiStatusService).load()]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(status.enabled()).toBe(true);
      expect(status.mcp()).toBe(true);
    });

    it('does not ask again once loaded, unless forced', async () => {
      fetchMock.mockResolvedValueOnce(answer(200, { mcp: true }));
      const status = setup();
      await status.load();
      await status.load();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      fetchMock.mockResolvedValueOnce(answer(404, {}));
      await status.load({ force: true });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(status.enabled()).toBe(false);
    });

    it('hands the server answer to the browser via TransferState', async () => {
      fetchMock.mockResolvedValueOnce(answer(200, { mcp: false }));
      const status = setup('server');

      await status.load();

      expect(TestBed.inject(TransferState).get(LT_AI_STATUS_STATE_KEY, null)).toEqual({ enabled: true, error: null, loaded: true, mcp: false });
    });

    it('keeps the server render pending until the status is in', async () => {
      let release!: (response: Response) => void;
      fetchMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
      const status = setup('server');
      const pendingTasks = TestBed.inject(PendingTasks);
      const remove = vi.fn();
      vi.spyOn(pendingTasks, 'add').mockReturnValue(remove);

      const loading = status.load();
      expect(pendingTasks.add).toHaveBeenCalledTimes(1);
      release(answer(200, { mcp: true }));
      await loading;

      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('adopts the state the server rendered without a second request', async () => {
      const status = setup('browser', { enabled: true, error: null, loaded: true, mcp: true });

      await status.load();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(status.enabled()).toBe(true);
      expect(status.mcp()).toBe(true);
      expect(status.loaded()).toBe(true);
    });

    it('ignores a transferred state that was never loaded', async () => {
      fetchMock.mockResolvedValueOnce(answer(404, {}));
      const status = setup('browser', { enabled: true, error: null, loaded: false, mcp: true });
      expect(status.enabled()).toBe(false);

      await status.load();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
