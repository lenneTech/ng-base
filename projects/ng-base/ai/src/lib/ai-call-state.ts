import { computed, signal } from '@angular/core';

import { ltAiResponseError, parseLtAiSseStream, type LtAiHttpService } from './ai-http';
import type { LtAiPromptRunInput, LtAiResponse, LtAiStreamHandlers } from './ai-types';

/**
 * Loading/error state shared by the AI services (internal, not part of the public API).
 *
 * `loading` counts the calls in flight, so two overlapping calls of a root service do not switch the flag off while
 * one of them still runs. `error` holds the message of the latest failed call and is cleared when a call starts.
 */
export class LtAiCallState {
  private readonly pending = signal(0);
  private readonly lastError = signal<null | string>(null);

  /** `true` while at least one call runs. */
  readonly loading = computed(() => this.pending() > 0);
  /** Message of the latest failed call. */
  readonly error = this.lastError.asReadonly();

  /** Run `call`; on failure store the message and rethrow. */
  async run<T>(call: () => Promise<T>): Promise<T> {
    this.pending.update((count) => count + 1);
    this.lastError.set(null);
    try {
      return await call();
    } catch (error) {
      this.lastError.set(ltAiErrorMessage(error));
      throw error;
    } finally {
      this.pending.update((count) => Math.max(0, count - 1));
    }
  }

  /** Run `call`; on failure store the message and resolve with `undefined` instead of throwing. */
  async runQuietly<T>(call: () => Promise<T>): Promise<T | undefined> {
    try {
      return await this.run(call);
    } catch {
      return undefined;
    }
  }

  /** Set the error message directly (stream `error` events). */
  setError(message: null | string): void {
    this.lastError.set(message);
  }
}

/** Message of a thrown value. */
export function ltAiErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether `error` is the result of an abort (`AbortController.abort()` without a custom reason). */
export function isLtAiAbortError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError';
}

/**
 * `POST /ai/stream` and dispatch the SSE events to `handlers` (internal; used by `LtAiService` and `injectLtAiChat`).
 *
 * Resolves with the `final` response, or `undefined` when the backend closes the stream without one. A non-2xx answer
 * rejects with {@link ltAiResponseError}; an abort through `options.signal` rejects with the abort reason
 * (an `AbortError` for a plain `abort()`), also when the parser stopped cleanly.
 */
export async function runLtAiStream(
  http: LtAiHttpService,
  input: LtAiPromptRunInput,
  handlers: LtAiStreamHandlers | undefined,
  options: { signal?: AbortSignal } = {},
): Promise<LtAiResponse | undefined> {
  const response = await http.stream('/stream', input, options);
  if (!response.ok) {
    throw await ltAiResponseError(response);
  }
  let final: LtAiResponse | undefined;
  await parseLtAiSseStream(
    response,
    (event) => {
      handlers?.onEvent?.(event);
      switch (event.type) {
        case 'action':
          handlers?.onAction?.(event.action);
          break;
        case 'error':
          handlers?.onError?.(event.message);
          break;
        case 'final':
          final = event.response;
          handlers?.onFinal?.(event.response);
          break;
        case 'token':
          handlers?.onToken?.(event.token);
          break;
      }
    },
    options,
  );
  if (options.signal?.aborted) {
    throw abortReason(options.signal);
  }
  return final;
}

function abortReason(signal: AbortSignal): unknown {
  const reason: unknown = signal.reason;
  if (reason instanceof Error || (typeof DOMException !== 'undefined' && reason instanceof DOMException)) {
    return reason;
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}
