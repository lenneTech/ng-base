import { computed, inject, Service, signal } from '@angular/core';

import { isLtAiAbortError, LtAiCallState, ltAiErrorMessage, runLtAiStream } from './ai-call-state';
import { LtAiHttpService } from './ai-http';
import type { LtAiPromptRunInput, LtAiResponse, LtAiState, LtAiStreamHandlers } from './ai-types';

/**
 * Prompt runs (`POST /ai/prompt`) and the SSE stream (`POST /ai/stream`, events token/action/error/final), the
 * counterpart of `useLtAi()`. Headless: pair it with an own UI or use {@link injectLtAiChat}.
 *
 * Root service: `loading` and `streaming` stay `true` while any call of the kind runs, `error` holds the latest
 * failure (an abort is not one).
 */
@Service()
export class LtAiService implements LtAiState {
  private readonly http = inject(LtAiHttpService);
  private readonly calls = new LtAiCallState();
  private readonly streams = signal(0);

  /** Message of the latest failed run or stream `error` event. */
  readonly error = this.calls.error;
  /** `true` while a `prompt()` runs. */
  readonly loading = this.calls.loading;
  /** `true` while a `promptStream()` runs. */
  readonly streaming = computed(() => this.streams() > 0);

  /** Run a prompt and return the full structured response; rejects (and sets `error`) on a non-2xx answer. */
  async prompt(input: LtAiPromptRunInput): Promise<LtAiResponse> {
    return this.calls.run(() => this.http.request<LtAiResponse>('POST', '/prompt', input));
  }

  /**
   * Run a prompt and stream the answer; resolves with the final response, or `undefined` when the backend closes the
   * stream without a `final` event. A stream `error` event sets `error` and calls `handlers.onError` without
   * rejecting. Aborting through `options.signal` rejects with an `AbortError` and leaves `error` untouched.
   *
   * Meant for the browser: during SSR the render waits until the stream ends.
   */
  async promptStream(input: LtAiPromptRunInput, handlers?: LtAiStreamHandlers, options: { signal?: AbortSignal } = {}): Promise<LtAiResponse | undefined> {
    this.streams.update((count) => count + 1);
    this.calls.setError(null);
    try {
      return await runLtAiStream(
        this.http,
        input,
        {
          ...handlers,
          onError: (message) => {
            this.calls.setError(message);
            handlers?.onError?.(message);
          },
        },
        options,
      );
    } catch (error) {
      if (!isLtAiAbortError(error)) {
        this.calls.setError(ltAiErrorMessage(error));
      }
      throw error;
    } finally {
      this.streams.update((count) => Math.max(0, count - 1));
    }
  }
}
