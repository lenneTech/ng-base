import { TestBed } from '@angular/core/testing';
import { LT_FETCH, LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';

import { LT_AI_SSE_MAX_LINE, LtAiHttpService, ltAiResponseError, parseLtAiSseStream } from './ai-http';
import { provideLtAi } from './ai-options';
import type { LtAiStreamEvent } from './ai-types';

/** A response streaming the given raw SSE chunks. */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' }, status: 200 });
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
}

async function collect(response: Response, options?: { signal?: AbortSignal }): Promise<LtAiStreamEvent[]> {
  const events: LtAiStreamEvent[] = [];
  await parseLtAiSseStream(response, (event) => events.push(event), options);
  return events;
}

describe('parseLtAiSseStream', () => {
  it('reassembles a JSON payload split across chunks', async () => {
    expect(await collect(sseResponse(['data: {"type":"token","token":"He', 'llo"}\n\n']))).toEqual([{ token: 'Hello', type: 'token' }]);
  });

  it('reassembles a multi-byte character split across chunks', async () => {
    const bytes = new TextEncoder().encode('data: {"type":"token","token":"ä"}\n\n');
    const split = bytes.indexOf(0xc3) + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      },
    });
    expect(await collect(new Response(stream))).toEqual([{ token: 'ä', type: 'token' }]);
  });

  it('delivers several events of one chunk in order and accepts CRLF line ends', async () => {
    const events = await collect(sseResponse(['data: {"type":"token","token":"a"}\r\n\r\ndata: {"type":"action","action":{"name":"x"}}\r\n\r\n']));
    expect(events).toEqual([
      { token: 'a', type: 'token' },
      { action: { name: 'x' }, type: 'action' },
    ]);
  });

  it('skips keep-alive comments and other non-data lines', async () => {
    const events = await collect(sseResponse([': keep-alive\n\n', 'event: message\nid: 1\ndata: {"type":"token","token":"x"}\n\n', ': another comment\n\n']));
    expect(events).toEqual([{ token: 'x', type: 'token' }]);
  });

  it('ignores the [DONE] sentinel and empty data lines', async () => {
    expect(await collect(sseResponse(['data: {"type":"token","token":"x"}\n\n', 'data:\n\n', 'data: [DONE]\n\n']))).toEqual([{ token: 'x', type: 'token' }]);
  });

  it('flushes a trailing line without a newline at the end of the stream', async () => {
    expect(await collect(sseResponse(['data: {"type":"final","response":{"text":"Hello"}}']))).toEqual([{ response: { text: 'Hello' }, type: 'final' }]);
  });

  it('ignores malformed data lines without throwing', async () => {
    expect(await collect(sseResponse(['data: not-json\n\n', 'data: {"type":"token","token":"ok"}\n\n']))).toEqual([{ token: 'ok', type: 'token' }]);
  });

  it('produces no events for a stream of keep-alives only', async () => {
    expect(await collect(sseResponse([': ping\n\n', ': ping\n\n']))).toEqual([]);
  });

  it('throws when the response has no body', async () => {
    await expect(parseLtAiSseStream(new Response(null), () => undefined)).rejects.toThrow(/no body/i);
  });

  it('bails out when a single line exceeds the 1 MiB limit', async () => {
    const huge = `data: ${'x'.repeat(LT_AI_SSE_MAX_LINE + 10)}`;
    await expect(collect(sseResponse([huge]))).rejects.toThrow(/maximum allowed size/i);
  });

  it('bails out on an over-long complete line inside one chunk', async () => {
    await expect(collect(sseResponse([`data: ${'x'.repeat(LT_AI_SSE_MAX_LINE + 10)}\n\n`]))).rejects.toThrow(/maximum allowed size/i);
  });

  it('accepts a chunk over 1 MiB that consists of many short lines', async () => {
    const line = 'data: {"type":"token","token":"x"}\n\n';
    const chunk = line.repeat(Math.ceil((LT_AI_SSE_MAX_LINE + 1) / line.length));
    const events = await collect(sseResponse([chunk]));
    expect(events.length).toBe(Math.ceil((LT_AI_SSE_MAX_LINE + 1) / line.length));
  });

  it('stops before a chunk that arrives after the abort', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(c) {
        c.enqueue(encoder.encode('data: {"type":"token","token":"a"}\n\n'));
        controller.abort();
        await Promise.resolve();
        c.enqueue(encoder.encode('data: {"type":"token","token":"b"}\n\n'));
        c.close();
      },
    });
    const events = await collect(new Response(stream), { signal: controller.signal });
    expect(events.find((event) => event.type === 'token' && event.token === 'b')).toBeUndefined();
  });

  it('cancels the reader of a stalled stream when the signal aborts', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"type":"token","token":"a"}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const events: LtAiStreamEvent[] = [];
    const parsing = parseLtAiSseStream(
      new Response(stream),
      (event) => {
        events.push(event);
        setTimeout(() => controller.abort(), 0);
      },
      { signal: controller.signal },
    );

    await expect(parsing).resolves.toBeUndefined();
    expect(cancelled).toBe(true);
    expect(events).toEqual([{ token: 'a', type: 'token' }]);
  });

  it('returns at once for an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await collect(sseResponse(['data: {"type":"token","token":"a"}\n\n']), { signal: controller.signal })).toEqual([]);
  });

  it('propagates an error thrown by the event handler', async () => {
    await expect(
      parseLtAiSseStream(sseResponse(['data: {"type":"token","token":"a"}\n\n']), () => {
        throw new Error('handler broke');
      }),
    ).rejects.toThrow('handler broke');
  });
});

describe('ltAiResponseError', () => {
  it('uses the backend message and carries the status', async () => {
    const error = await ltAiResponseError(json(400, { message: 'oops' }));
    expect(error.message).toBe('oops');
    expect(error.status).toBe(400);
  });

  it('joins array messages and falls back to the error field', async () => {
    expect((await ltAiResponseError(json(422, { message: ['a', 'b'] }))).message).toBe('a, b');
    expect((await ltAiResponseError(json(500, { error: 'boom' }))).message).toBe('boom');
  });

  it('falls back to the status line for an unparsable body and caps long messages at 1 KiB', async () => {
    const plain = await ltAiResponseError(new Response('<html>', { status: 503, statusText: 'Service Unavailable' }));
    expect(plain.message).toBe('503 Service Unavailable');
    expect(plain.status).toBe(503);
    expect((await ltAiResponseError(json(400, { message: 'x'.repeat(5000) }))).message.length).toBe(1024);
  });
});

describe('LtAiHttpService', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  function setup(basePath?: string): LtAiHttpService {
    TestBed.configureTestingModule({
      providers: [
        { provide: LT_FETCH, useValue: fetchMock },
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.test/' }) },
        ...(basePath ? [provideLtAi({ basePath })] : []),
      ],
    });
    return TestBed.inject(LtAiHttpService);
  }

  beforeEach(() => fetchMock.mockReset());

  it('builds AI URLs against the API with the default /ai base path', () => {
    expect(setup().buildUrl('/prompt')).toBe('https://api.test/ai/prompt');
    expect(TestBed.inject(LtAiHttpService).buildUrl('stream')).toBe('https://api.test/ai/stream');
  });

  it('honours a configured base path', () => {
    expect(setup('/assistant').buildUrl('/stream')).toBe('https://api.test/assistant/stream');
  });

  it('returns the parsed body on 2xx and undefined on 204', async () => {
    const http = setup();
    fetchMock.mockResolvedValueOnce(json(200, { id: '1' })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await http.request('GET', '/prompts')).toEqual({ id: '1' });
    expect(await http.request('DELETE', '/prompts/abc')).toBeUndefined();
  });

  it('serialises a body with JSON headers and forwards the signal', async () => {
    const http = setup();
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await http.request('POST', '/prompts', { name: 'x' }, { signal: controller.signal });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/ai/prompts');
    expect(init).toMatchObject({ body: '{"name":"x"}', headers: { accept: 'application/json', 'content-type': 'application/json' }, method: 'POST', signal: controller.signal });
  });

  it('sends no body without input', async () => {
    const http = setup();
    fetchMock.mockResolvedValueOnce(json(200, []));
    await http.request('GET', '/prompts');
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ accept: 'application/json' });
  });

  it('throws an error with the backend message and status on non-2xx', async () => {
    const http = setup();
    fetchMock.mockResolvedValueOnce(json(403, { message: 'nope' }));
    await expect(http.request('GET', '/prompts')).rejects.toMatchObject({ message: 'nope', status: 403 });
  });

  it('opens the stream as an SSE POST', async () => {
    const http = setup();
    fetchMock.mockResolvedValueOnce(sseResponse([]));
    await http.stream('/stream', { prompt: 'hi' });
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://api.test/ai/stream',
      expect.objectContaining({ body: '{"prompt":"hi"}', headers: { accept: 'text/event-stream', 'content-type': 'application/json' }, method: 'POST' }),
    ]);
  });
});
