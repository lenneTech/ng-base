import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LT_FETCH, LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';

import { injectLtAiChat } from './ai-chat';
import type { LtAiChatOptions, LtAiStreamEvent } from './ai-types';

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
}

function sse(events: LtAiStreamEvent[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );
}

/** A stream the test feeds event by event; it errors with the abort reason like a real fetch body. */
function liveStream(signal?: AbortSignal | null): { push: (event: LtAiStreamEvent) => void; close: () => void; response: Response } {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  signal?.addEventListener('abort', () => controller.error(signal.reason));
  return {
    close: () => controller.close(),
    push: (event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)),
    response: new Response(stream, { status: 200 }),
  };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('injectLtAiChat', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: LT_FETCH, useValue: fetchMock },
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.test' }) },
      ],
    });
  });

  const create = (options?: LtAiChatOptions) => TestBed.runInInjectionContext(() => injectLtAiChat(options));
  const body = (call: number) => JSON.parse(String(fetchMock.mock.calls[call]![1]?.body)) as Record<string, unknown>;

  it('throws outside an injection context', () => {
    expect(() => injectLtAiChat()).toThrow();
  });

  it('streams the assistant answer token by token into a new message', async () => {
    const chat = create();
    let live!: ReturnType<typeof liveStream>;
    fetchMock.mockImplementationOnce(async (_url, init) => (live = liveStream(init?.signal)).response);

    const sending = chat.send('  hi  ');
    await flush();
    expect(chat.streaming()).toBe(true);
    live.push({ token: 'Hel', type: 'token' });
    await flush();
    expect(chat.messages()[1]).toMatchObject({ content: 'Hel', pending: true, role: 'assistant' });
    live.push({ token: 'lo', type: 'token' });
    live.push({ response: { conversationId: 'c1', text: 'Hello' }, type: 'final' });
    live.close();
    await sending;

    expect(chat.messages()).toHaveLength(2);
    expect(chat.messages()[0]).toMatchObject({ content: 'hi', role: 'user' });
    expect(chat.messages()[1]).toMatchObject({ content: 'Hello', pending: false, role: 'assistant' });
    expect(chat.conversationId()).toBe('c1');
    expect(chat.streaming()).toBe(false);
  });

  it('applies the final response once: content, budget, context window, actions', async () => {
    const chat = create();
    fetchMock.mockResolvedValueOnce(
      sse([
        { token: 'partial', type: 'token' },
        {
          response: { actions: [{ name: 'find' }], budget: { promptTokens: 10, usedTokens: 10 }, contextWindow: { total: 100, used: 20 }, denied: false, text: 'done' },
          type: 'final',
        },
      ]),
    );
    await chat.send('go');

    expect(chat.messages()).toHaveLength(2);
    expect(chat.messages()[1]).toMatchObject({ actions: [{ name: 'find' }], budget: { usedTokens: 10 }, content: 'done', pending: false });
    expect(chat.budget()?.usedTokens).toBe(10);
    expect(chat.contextWindow()).toEqual({ total: 100, used: 20 });
  });

  it('keeps the streamed text when the final response has none', async () => {
    const chat = create();
    fetchMock.mockResolvedValueOnce(
      sse([
        { token: 'streamed', type: 'token' },
        { response: { text: '' }, type: 'final' },
      ]),
    );
    await chat.send('go');
    expect(chat.messages()[1]?.content).toBe('streamed');
  });

  it('ends the turn when the stream closes without a final event', async () => {
    const chat = create();
    fetchMock.mockResolvedValueOnce(sse([{ token: 'x', type: 'token' }]));
    await chat.send('go');
    expect(chat.messages()[1]).toMatchObject({ content: 'x', pending: false });
    expect(chat.messages()[1]?.error).toBeUndefined();
  });

  it('sends connection, conversation, metadata and mode; a signal connection id is read per turn', async () => {
    const connectionId = signal<string | undefined>('conn-1');
    const chat = create({ connectionId, conversationId: 'conv-0', metadata: () => ({ url: '/page' }), mode: 'plan' });
    fetchMock.mockResolvedValueOnce(sse([{ response: { conversationId: 'conv-1', text: 'a' }, type: 'final' }]));
    await chat.send('one');
    connectionId.set('conn-2');
    fetchMock.mockResolvedValueOnce(sse([{ response: { text: 'b' }, type: 'final' }]));
    await chat.send('two');

    expect(body(0)).toEqual({ connectionId: 'conn-1', conversationId: 'conv-0', metadata: { url: '/page' }, mode: 'plan', prompt: 'one' });
    expect(body(1)).toMatchObject({ connectionId: 'conn-2', conversationId: 'conv-1', prompt: 'two' });
  });

  it('reads a signal mode per turn and follows a conversationId signal', async () => {
    const mode = signal<'auto' | 'plan' | undefined>('plan');
    const conversationId = signal<string | undefined>('c1');
    const chat = create({ conversationId, mode });
    fetchMock.mockResolvedValueOnce(sse([{ response: { conversationId: 'server-id', text: 'a' }, type: 'final' }]));
    await chat.send('one');
    expect(body(0)).toMatchObject({ conversationId: 'c1', mode: 'plan' });
    expect(chat.conversationId()).toBe('server-id');

    mode.set('auto');
    conversationId.set('c2');
    expect(chat.conversationId()).toBe('c2');
    fetchMock.mockResolvedValueOnce(sse([{ response: { text: 'b' }, type: 'final' }]));
    await chat.send('two');
    expect(body(1)).toMatchObject({ conversationId: 'c2', mode: 'auto' });
  });

  it('accepts a plain string connection id', async () => {
    const chat = create({ connectionId: 'fixed' });
    fetchMock.mockResolvedValueOnce(sse([{ response: { text: 'a' }, type: 'final' }]));
    await chat.send('x');
    expect(body(0)['connectionId']).toBe('fixed');
  });

  it('ignores blank input and a send while a turn runs', async () => {
    const chat = create();
    await chat.send('   ');
    expect(fetchMock).not.toHaveBeenCalled();

    let live!: ReturnType<typeof liveStream>;
    fetchMock.mockImplementationOnce(async (_url, init) => (live = liveStream(init?.signal)).response);
    const first = chat.send('one');
    await chat.send('two');
    live.close();
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chat.messages().filter((message) => message.role === 'user')).toHaveLength(1);
  });

  it('treats stop() as a clean end: no error flag, streamed content stays', async () => {
    const chat = create();
    let live!: ReturnType<typeof liveStream>;
    fetchMock.mockImplementationOnce(async (_url, init) => (live = liveStream(init?.signal)).response);
    const sending = chat.send('hi');
    await flush();
    live.push({ token: 'partial', type: 'token' });
    await flush();

    chat.stop();
    await sending;

    expect(chat.messages()[1]).toMatchObject({ content: 'partial', pending: false });
    expect(chat.messages()[1]?.error).toBeUndefined();
    expect(chat.error()).toBeNull();
    expect(chat.streaming()).toBe(false);
  });

  it('allows a new send right after stop()', async () => {
    const chat = create();
    fetchMock.mockImplementationOnce(async (_url, init) => liveStream(init?.signal).response);
    const first = chat.send('one');
    await flush();
    chat.stop();
    fetchMock.mockResolvedValueOnce(sse([{ response: { text: 'second' }, type: 'final' }]));
    await chat.send('two');
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(chat.messages().at(-1)).toMatchObject({ content: 'second', pending: false });
  });

  it('surfaces a failed request on the assistant turn', async () => {
    const chat = create();
    fetchMock.mockRejectedValueOnce(new TypeError('Network down'));
    await chat.send('hi');
    expect(chat.messages()[1]).toMatchObject({ content: 'Network down', error: true, pending: false });
    expect(chat.error()).toBe('Network down');
  });

  it('surfaces a refused stream with the backend message', async () => {
    const chat = create();
    fetchMock.mockResolvedValueOnce(json(429, { message: '#LTNS_0600: Budget exceeded' }));
    await chat.send('hi');
    expect(chat.messages()[1]).toMatchObject({ content: '#LTNS_0600: Budget exceeded', error: true });
    expect(chat.error()).toBe('#LTNS_0600: Budget exceeded');
  });

  it('marks the turn as failed on a stream error event and keeps streamed text', async () => {
    const chat = create();
    fetchMock.mockResolvedValueOnce(
      sse([
        { token: 'half', type: 'token' },
        { message: 'Provider down', type: 'error' },
      ]),
    );
    await chat.send('hi');
    expect(chat.messages()[1]).toMatchObject({ content: 'half', error: true, pending: false });
    expect(chat.error()).toBe('Provider down');
  });

  it('clears the error of the previous turn when a new one starts', async () => {
    const chat = create();
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    await chat.send('one');
    fetchMock.mockResolvedValueOnce(sse([{ response: { text: 'ok' }, type: 'final' }]));
    await chat.send('two');
    expect(chat.error()).toBeNull();
  });

  it('trims the history to maxMessages', async () => {
    const chat = create({ maxMessages: 3 });
    fetchMock.mockImplementation(async () => sse([{ response: { text: 'ok' }, type: 'final' }]));
    await chat.send('one');
    await chat.send('two');
    await chat.send('three');

    expect(chat.messages()).toHaveLength(3);
    expect(chat.messages()[0]).toMatchObject({ content: 'ok', role: 'assistant' });
    expect(chat.messages().at(-1)).toMatchObject({ content: 'ok', pending: false });
  });

  it('uses POST /ai/prompt without streaming', async () => {
    const chat = create({ stream: false });
    fetchMock.mockResolvedValueOnce(json(200, { budget: { usedTokens: 5 }, conversationId: 'c9', text: 'answer' }));
    await chat.send('hi');

    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.test/ai/prompt');
    expect(chat.messages()[1]).toMatchObject({ content: 'answer', pending: false });
    expect(chat.conversationId()).toBe('c9');
    expect(chat.budget()).toEqual({ usedTokens: 5 });
  });

  it('confirms a turn that requires confirmation by re-sending the prompt with confirm: true', async () => {
    const chat = create();
    fetchMock.mockResolvedValueOnce(sse([{ response: { conversationId: 'c1', pendingActions: [{ name: 'delete' }], requiresConfirmation: true, text: 'Sure?' }, type: 'final' }]));
    await chat.send('delete it');
    expect(chat.requiresConfirmation()).toBe(true);

    fetchMock.mockResolvedValueOnce(sse([{ response: { text: 'Deleted' }, type: 'final' }]));
    await chat.confirm();

    expect(body(1)).toMatchObject({ confirm: true, conversationId: 'c1', prompt: 'delete it' });
    expect(chat.requiresConfirmation()).toBe(false);
    expect(chat.messages().at(-1)).toMatchObject({ content: 'Deleted' });
  });

  it('ignores confirm() when nothing awaits confirmation', async () => {
    const chat = create();
    await chat.confirm();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clear() aborts a running stream and resets the local state', async () => {
    const chat = create();
    let aborted = false;
    fetchMock.mockImplementationOnce(async (_url, init) => {
      init?.signal?.addEventListener('abort', () => (aborted = true));
      return liveStream(init?.signal).response;
    });
    const sending = chat.send('hi');
    await flush();
    chat.clear();
    await sending;

    expect(aborted).toBe(true);
    expect(chat.messages()).toHaveLength(0);
    expect(chat.budget()).toBeNull();
    expect(chat.contextWindow()).toBeNull();
    expect(chat.error()).toBeNull();
  });

  it('stops a running stream when its injection context is destroyed', async () => {
    const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    const chat = runInInjectionContext(injector, () => injectLtAiChat());
    let signalSeen: AbortSignal | null | undefined;
    fetchMock.mockImplementationOnce(async (_url, init) => {
      signalSeen = init?.signal;
      return liveStream(init?.signal).response;
    });
    const sending = chat.send('hi');
    await flush();

    injector.destroy();
    await sending;

    expect(signalSeen?.aborted).toBe(true);
    expect(chat.messages()[1]).toMatchObject({ pending: false });
    expect(chat.error()).toBeNull();
  });

  it('keeps separate state per chat', async () => {
    const first = create();
    const second = create();
    fetchMock.mockResolvedValueOnce(sse([{ response: { text: 'a' }, type: 'final' }]));
    await first.send('x');
    expect(first.messages()).toHaveLength(2);
    expect(second.messages()).toHaveLength(0);
  });
});
