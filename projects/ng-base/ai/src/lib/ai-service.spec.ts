import { TestBed } from '@angular/core/testing';
import { LT_FETCH, LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';

import { LtAiService } from './ai-service';
import type { LtAiStreamEvent } from './ai-types';

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
}

function sse(events: (LtAiStreamEvent | string)[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(typeof event === 'string' ? event : `data: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' }, status: 200 },
  );
}

describe('LtAiService', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  let ai: LtAiService;

  beforeEach(() => {
    fetchMock.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: LT_FETCH, useValue: fetchMock },
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.test' }) },
      ],
    });
    ai = TestBed.inject(LtAiService);
  });

  it('runs a prompt via POST /ai/prompt and toggles loading', async () => {
    let release!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));

    const running = ai.prompt({ prompt: 'hi' });
    expect(ai.loading()).toBe(true);
    release(json(200, { text: 'Hello' }));

    await expect(running).resolves.toEqual({ text: 'Hello' });
    expect(ai.loading()).toBe(false);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/ai/prompt');
    expect(JSON.parse(String(init?.body))).toEqual({ prompt: 'hi' });
  });

  it('keeps loading on while a second prompt still runs', async () => {
    let releaseSecond!: (response: Response) => void;
    fetchMock.mockResolvedValueOnce(json(200, { text: 'a' })).mockImplementationOnce(() => new Promise((resolve) => (releaseSecond = resolve)));

    const first = ai.prompt({ prompt: 'a' });
    const second = ai.prompt({ prompt: 'b' });
    await first;
    expect(ai.loading()).toBe(true);
    releaseSecond(json(200, { text: 'b' }));
    await second;
    expect(ai.loading()).toBe(false);
  });

  it('sets error and rethrows when a prompt fails', async () => {
    fetchMock.mockResolvedValueOnce(json(429, { message: '#LTNS_0600: Budget exceeded' }));
    await expect(ai.prompt({ prompt: 'hi' })).rejects.toMatchObject({ status: 429 });
    expect(ai.error()).toBe('#LTNS_0600: Budget exceeded');
    expect(ai.loading()).toBe(false);
  });

  it('streams tokens, actions and the final response to the handlers', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        ': keep-alive\n\n',
        { token: 'Hel', type: 'token' },
        { action: { name: 'find' }, type: 'action' },
        { token: 'lo', type: 'token' },
        { response: { text: 'Hello' }, type: 'final' },
      ]),
    );
    const tokens: string[] = [];
    const onAction = vi.fn();
    const onFinal = vi.fn();
    const onEvent = vi.fn();

    const final = await ai.promptStream({ prompt: 'hi' }, { onAction, onEvent, onFinal, onToken: (token) => tokens.push(token) });

    expect(final).toEqual({ text: 'Hello' });
    expect(tokens).toEqual(['Hel', 'lo']);
    expect(onAction).toHaveBeenCalledWith({ name: 'find' });
    expect(onFinal).toHaveBeenCalledWith({ text: 'Hello' });
    expect(onEvent).toHaveBeenCalledTimes(4);
    expect(ai.streaming()).toBe(false);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.test/ai/stream');
  });

  it('resolves undefined when the stream ends without a final event', async () => {
    fetchMock.mockResolvedValueOnce(sse([{ token: 'x', type: 'token' }]));
    await expect(ai.promptStream({ prompt: 'hi' })).resolves.toBeUndefined();
  });

  it('reports a stream error event without rejecting', async () => {
    fetchMock.mockResolvedValueOnce(sse([{ message: 'Provider down', type: 'error' }]));
    const onError = vi.fn();

    await expect(ai.promptStream({ prompt: 'hi' }, { onError })).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledWith('Provider down');
    expect(ai.error()).toBe('Provider down');
  });

  it('rejects with the backend message when the stream request is refused', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { message: 'Unauthorized' }));
    await expect(ai.promptStream({ prompt: 'hi' })).rejects.toMatchObject({ message: 'Unauthorized', status: 401 });
    expect(ai.error()).toBe('Unauthorized');
    expect(ai.streaming()).toBe(false);
  });

  it('treats an abort as no error', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce((_url, init) => {
      controller.abort();
      return Promise.reject(init?.signal?.reason);
    });

    await expect(ai.promptStream({ prompt: 'hi' }, undefined, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(ai.error()).toBeNull();
    expect(ai.streaming()).toBe(false);
  });

  it('is streaming while the stream is open', async () => {
    let release!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const running = ai.promptStream({ prompt: 'hi' });
    expect(ai.streaming()).toBe(true);
    release(sse([{ response: { text: 'ok' }, type: 'final' }]));
    await running;
    expect(ai.streaming()).toBe(false);
  });
});
