import { inject, Service } from '@angular/core';
import { LT_FETCH, LtApiUrlService } from '@lenne.tech/ng-base';

import { LT_AI_OPTIONS } from './ai-options';
import type { LtAiStreamEvent } from './ai-types';

/** Maximum length of one SSE line (1 MiB); longer lines abort the stream. */
export const LT_AI_SSE_MAX_LINE = 1024 * 1024;

/** HTTP helpers of the AI services (counterpart of `buildLtAiUrl` / `ltAiRequest`). All calls use the auth-aware `LT_FETCH`. */
@Service()
export class LtAiHttpService {
  private readonly api = inject(LtApiUrlService);
  private readonly fetch = inject(LT_FETCH);
  private readonly options = inject(LT_AI_OPTIONS);

  /** AI base path (`/ai`). */
  basePath(): string {
    return this.options.basePath;
  }

  /** `<api><basePath><path>`. */
  buildUrl(path: string): string {
    return this.api.buildUrl(`${this.options.basePath}${path.startsWith('/') ? path : `/${path}`}`);
  }

  /** JSON request (`Accept: application/json`); throws {@link ltAiResponseError} on non-2xx; 204 → `undefined`. */
  async request<T>(method: 'DELETE' | 'GET' | 'POST' | 'PUT', path: string, body?: unknown, options: { signal?: AbortSignal } = {}): Promise<T> {
    const init: RequestInit = { headers: { accept: 'application/json' }, method, signal: options.signal };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { ...(init.headers as Record<string, string>), 'content-type': 'application/json' };
    }
    const response = await this.fetch(this.buildUrl(path), init);
    if (!response.ok) {
      throw await ltAiResponseError(response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Raw request for streaming (`POST /ai/stream`). */
  stream(path: string, body: unknown, options: { signal?: AbortSignal } = {}): Promise<Response> {
    return this.fetch(this.buildUrl(path), {
      body: JSON.stringify(body),
      headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
      method: 'POST',
      signal: options.signal,
    });
  }
}

/** Build an `Error & { status }` from an error response (`message`/`error`, arrays joined, capped at 1 KiB). */
export async function ltAiResponseError(response: Response): Promise<Error & { status: number }> {
  let message = `${response.status} ${response.statusText}`.trim();
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown } | null;
    const raw = body?.message ?? body?.error;
    if (Array.isArray(raw)) {
      message = raw.map(String).join(', ');
    } else if (typeof raw === 'string' && raw) {
      message = raw;
    }
  } catch {
    // keep the status line
  }
  const error = new Error(message.slice(0, 1024)) as Error & { status: number };
  error.status = response.status;
  return error;
}

/**
 * Parse an SSE response body (`data: {json}` lines) and call `onEvent` per event. Handles chunks split mid-line,
 * ignores non-`data:` lines, `[DONE]` and malformed JSON, throws on lines over 1 MiB; aborting cancels the reader.
 *
 * `options.signal` stops parsing without cancelling the underlying fetch (component-destroy races): the reader is
 * cancelled, also while it waits for the next chunk, and the function resolves without delivering further events.
 * An error thrown by `onEvent` propagates (and cancels the reader); only unparsable payloads are skipped.
 */
export async function parseLtAiSseStream(response: Response, onEvent: (event: LtAiStreamEvent) => void, options: { signal?: AbortSignal } = {}): Promise<void> {
  const body = response.body;
  if (!body) {
    throw new Error('AI stream response has no body');
  }
  const signal = options.signal;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  const cancel = (): void => {
    reader.cancel().catch(() => undefined);
  };
  const tooLong = (): Error => new Error('AI stream line exceeds maximum allowed size');
  const handleLine = (line: string): void => {
    if (line.length > LT_AI_SSE_MAX_LINE) {
      throw tooLong();
    }
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) {
      return;
    }
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') {
      return;
    }
    let event: LtAiStreamEvent;
    try {
      event = JSON.parse(payload) as LtAiStreamEvent;
    } catch {
      return; // a malformed event line is skipped
    }
    onEvent(event);
  };

  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) {
      return;
    }
    for (;;) {
      const { done, value } = await reader.read();
      if (signal?.aborted) {
        return;
      }
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        handleLine(line);
        if (signal?.aborted) {
          return;
        }
      }
      if (buffer.length > LT_AI_SSE_MAX_LINE) {
        throw tooLong();
      }
    }
    buffer += decoder.decode();
    finished = true;
    if (buffer) {
      handleLine(buffer);
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    if (!finished) {
      cancel();
    }
    reader.releaseLock();
  }
}
