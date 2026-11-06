/**
 * The hint stream of the offline sync: `GET <basePath>/hints` as server-sent events (protocol §9).
 *
 * Read with `fetch` and a `ReadableStream`, not `EventSource`: an EventSource cannot send an
 * `Authorization` header, so in JWT mode (the fallback the auth-aware fetch switches to when the cookie
 * is refused) it would never be signed in (decision E2 of DEV-3917).
 *
 * The server ends a stream on purpose before its first hint after the re-check interval (30 s by
 * default) and does not replay that hint. So every (re)connect calls `onConnect`, and the caller
 * pulls once — without it a change would wait for the next focus or start whenever hints are
 * further apart than the interval.
 */

import { buildLtSyncUrl, ltSyncFetch } from './sync-engine';

/** Hard cap on one SSE line (1 MiB): bails out on a stream that never sends `\n` */
const LINE_LIMIT = 1024 * 1024;

/** Reconnect delay until the server sends `retry:` (it sends 3000) */
const DEFAULT_RETRY_MS = 3000;

/** Upper bound of the backoff after failed connects */
const MAX_BACKOFF_MS = 60_000;

export interface LtSyncHintsOptions {
  /** `fetch` for the stream (default: the auth-aware `LT_FETCH`) */
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  /** The models to hear about; a model the caller may not pull simply never sends a hint */
  models: string[];
  /** Every (re)connect. Hints sent while disconnected are not replayed: pull once (§9) */
  onConnect: () => void;
  /** A change of `model` was committed: pulling is worthwhile */
  onHint: (model: string) => void;
  /** The stream stopped for good: the server switched SSE off (`404`) or the session ended (`401`) */
  onStop?: (reason: 'disabled' | 'unauthorized') => void;
  /** Restrict to one tenant (`X-Tenant-Id`) */
  tenantId?: string;
}

interface SseEvent {
  data: string;
  event: string;
  retry?: number;
}

/** Read server-sent events off a body until it ends or the signal aborts */
async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (event: SseEvent) => void, signal: AbortSignal): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event: SseEvent = { data: '', event: 'message' };
  const dispatchLine = (line: string) => {
    if (line === '') {
      if (event.data || event.retry !== undefined) onEvent(event);
      event = { data: '', event: 'message' };
      return;
    }
    // A comment line: the keep-alive the server sends every 25 s
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event.event = value;
    else if (field === 'data') event.data = event.data ? `${event.data}\n${value}` : value;
    else if (field === 'retry' && /^\d+$/.test(value)) event.retry = Number(value);
  };
  const onAbort = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener('abort', onAbort);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.search(/\r?\n|\r/);
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        const skip = buffer[newline] === '\r' && buffer[newline + 1] === '\n' ? 2 : 1;
        buffer = buffer.slice(newline + skip);
        dispatchLine(line);
        newline = buffer.search(/\r?\n|\r/);
      }
      if (buffer.length > LINE_LIMIT) throw new Error('sync hint stream: line exceeds 1 MiB');
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

/** One instance listening for the hints of its model */
export interface LtSyncHintSubscriber {
  model: string;
  onConnect: () => void;
  onHint: () => void;
  onStop?: (reason: 'disabled' | 'unauthorized') => void;
  tenantId?: string;
}

interface HintHub {
  close?: () => void;
  models: string;
  subscribers: Set<LtSyncHintSubscriber>;
}

/** The ONE stream this tab keeps per tenant, by tenant ('' without one) */
const hubs = new Map<string, HintHub>();

/**
 * Listen for the hints of a model on the ONE stream this tab keeps per tenant, for every model in
 * use (`?models=` takes a list, §9). A stream per `useLtOfflineSync()` call would hold a connection
 * each; over HTTP/1.1 a browser allows six per host, so six instances on one page would stall every
 * other request to the API, sign-in and sign-out included. Answers the unsubscribe.
 */
export function subscribeLtSyncHints(subscriber: LtSyncHintSubscriber): () => void {
  const key = subscriber.tenantId ?? '';
  let hub = hubs.get(key);
  if (!hub) {
    hub = { models: '', subscribers: new Set() };
    hubs.set(key, hub);
  }
  const joined = hub;
  joined.subscribers.add(subscriber);
  connectHub(key, joined);
  return () => {
    if (!joined.subscribers.delete(subscriber)) return;
    if (joined.subscribers.size === 0) {
      joined.close?.();
      if (hubs.get(key) === joined) hubs.delete(key);
      return;
    }
    connectHub(key, joined);
  };
}

/** (Re)open the hub's stream for the models its subscribers use; a no-op while the set is unchanged */
function connectHub(key: string, hub: HintHub): void {
  const models = [...new Set([...hub.subscribers].map((subscriber) => subscriber.model))].sort().join(',');
  if (hub.close && hub.models === models) return;
  hub.close?.();
  hub.models = models;
  // Each callback walks a copy: a subscriber may join or leave inside one, and a Set visits members
  // added during the walk, so one that joins in `onStop` would get the stop of a stream it never had.
  // `Array.from` and not `[...set]`, which unicorn(no-useless-spread) reports in every vendored core.
  hub.close = openLtSyncHints({
    models: models.split(','),
    onConnect: () => {
      for (const subscriber of Array.from(hub.subscribers)) subscriber.onConnect();
    },
    onHint: (model) => {
      for (const subscriber of Array.from(hub.subscribers)) if (subscriber.model === model) subscriber.onHint();
    },
    onStop: (reason) => {
      hub.close = undefined;
      hub.models = '';
      for (const subscriber of Array.from(hub.subscribers)) subscriber.onStop?.(reason);
    },
    tenantId: key || undefined,
  });
}

/**
 * Open the hint stream and keep it open — reconnecting after the server ends it, backing off after
 * failures — until the returned `close()` is called or the stream stops for good (`onStop`).
 */
export function openLtSyncHints(options: LtSyncHintsOptions): () => void {
  const { models, onConnect, onHint, onStop, tenantId } = options;
  const fetchImpl = options.fetch ?? ltSyncFetch;
  let closed = false;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  let retryMs = DEFAULT_RETRY_MS;
  let failures = 0;

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      wake = resolve;
      timer = setTimeout(resolve, ms);
    });

  const loop = async () => {
    while (!closed) {
      controller = new AbortController();
      try {
        const query = new URLSearchParams({ models: models.join(',') });
        const headers: Record<string, string> = { accept: 'text/event-stream' };
        if (tenantId) headers['x-tenant-id'] = tenantId;
        const response = await fetchImpl(buildLtSyncUrl(`/hints?${query}`), { headers, method: 'GET', signal: controller.signal });
        if (response.status === 404 || response.status === 401) {
          await response.body?.cancel().catch(() => undefined);
          if (!closed) onStop?.(response.status === 404 ? 'disabled' : 'unauthorized');
          return;
        }
        if (!response.ok || !response.body) throw new Error(`sync hint stream answered ${response.status}`);
        failures = 0;
        onConnect();
        await readEvents(
          response.body,
          (event) => {
            if (event.retry !== undefined) retryMs = event.retry;
            if (event.event !== 'change') return;
            try {
              const model = (JSON.parse(event.data) as { model?: unknown }).model;
              if (typeof model === 'string') onHint(model);
            } catch {
              // A malformed hint carries nothing to act on; the next pull catches up anyway
            }
          },
          controller.signal,
        );
        // The server ended the stream on purpose: reconnect after its `retry`
        if (!closed) await wait(retryMs);
      } catch {
        if (closed) return;
        failures++;
        await wait(Math.min(retryMs * 2 ** Math.min(failures - 1, 5), MAX_BACKOFF_MS));
      }
    }
  };
  void loop();

  return () => {
    closed = true;
    controller?.abort();
    clearTimeout(timer);
    wake?.();
  };
}
