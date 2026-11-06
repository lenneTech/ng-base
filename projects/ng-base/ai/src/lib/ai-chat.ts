import { assertInInjectionContext, computed, DestroyRef, inject, isSignal, linkedSignal, signal } from '@angular/core';

import { isLtAiAbortError, ltAiErrorMessage, runLtAiStream } from './ai-call-state';
import { LtAiHttpService } from './ai-http';
import type { LtAiBudgetSummary, LtAiChatOptions, LtAiChatState, LtAiMessage, LtAiPromptRunInput, LtAiResponse } from './ai-types';

/** A chat session created by {@link injectLtAiChat}. */
export type LtAiChat = LtAiChatState;

/**
 * Create a chat session (counterpart of `useLtAiChat()`), bound to the current injection context: a running stream is
 * stopped on destroy. Streams by default; `send` is ignored while a turn runs; `confirm()` re-sends the last prompt with
 * `confirm: true`; abort is not an error; `maxMessages` trims the oldest messages.
 *
 * Every chat has its own state (messages, conversation, budget, streaming); it does not share `LtAiService`'s signals.
 * A stream `error` event marks the assistant turn as failed and sets `error`, like a failed request.
 *
 * @example
 * protected readonly chat = injectLtAiChat({ connectionId: this.connectionId, metadata: () => ({ url: location.href }) });
 */
export function injectLtAiChat(options: LtAiChatOptions = {}): LtAiChat {
  assertInInjectionContext(injectLtAiChat);
  const http = inject(LtAiHttpService);

  const messages = signal<LtAiMessage[]>([]);
  // Follows a signal option (a new conversation selected outside) and keeps the id the server assigns.
  const conversationId = linkedSignal<string | undefined>(() => (isSignal(options.conversationId) ? options.conversationId() : options.conversationId));
  const budget = signal<LtAiBudgetSummary | null>(null);
  const contextWindow = signal<{ total: number; used: number } | null>(null);
  const error = signal<null | string>(null);
  const streaming = signal(false);
  let busy = false;
  let turnSequence = 0;
  let controller: AbortController | undefined;
  let lastPrompt = '';

  const requiresConfirmation = computed(() => {
    const list = messages();
    const last = list[list.length - 1];
    return !!last && last.role === 'assistant' && !!last.requiresConfirmation;
  });

  function resolveConnectionId(): string | undefined {
    const value = options.connectionId;
    return (isSignal(value) ? value() : value) || undefined;
  }

  function push(message: LtAiMessage): void {
    messages.update((list) => {
      const next = [...list, message];
      return options.maxMessages && options.maxMessages > 0 && next.length > options.maxMessages ? next.slice(next.length - options.maxMessages) : next;
    });
  }

  function buildInput(prompt: string, confirm: boolean): LtAiPromptRunInput {
    const input: LtAiPromptRunInput = {
      connectionId: resolveConnectionId(),
      conversationId: conversationId(),
      metadata: options.metadata?.(),
      mode: isSignal(options.mode) ? options.mode() : options.mode,
      prompt,
    };
    if (confirm) {
      input.confirm = true;
    }
    return input;
  }

  /** Run one assistant turn, streaming into a new message. */
  async function runTurn(input: LtAiPromptRunInput): Promise<void> {
    const turn = ++turnSequence;
    const isCurrent = (): boolean => turn === turnSequence;
    error.set(null);
    let assistant: LtAiMessage = { content: '', createdAt: new Date().toISOString(), pending: true, role: 'assistant' };
    push(assistant);
    // Messages are immutable: every change replaces the element, a cleared or trimmed turn is no longer found.
    const patch = (changes: Partial<LtAiMessage>): void => {
      const previous = assistant;
      assistant = { ...previous, ...changes };
      const next = assistant;
      messages.update((list) => (list.includes(previous) ? list.map((message) => (message === previous ? next : message)) : list));
    };
    const applyFinal = (response: LtAiResponse): void => {
      patch({
        actions: response.actions,
        budget: response.budget,
        content: response.text || assistant.content,
        denied: response.denied,
        pending: false,
        pendingActions: response.pendingActions,
        requiresConfirmation: response.requiresConfirmation,
      });
      if (!isCurrent()) {
        return;
      }
      if (response.budget) {
        budget.set(response.budget);
      }
      if (response.contextWindow) {
        contextWindow.set(response.contextWindow);
      }
      if (response.conversationId) {
        conversationId.set(response.conversationId);
      }
    };
    const fail = (message: string): void => {
      patch({ content: assistant.content || message, error: true, pending: false });
      if (isCurrent()) {
        error.set(message);
      }
    };

    const abort = new AbortController();
    controller = abort;
    busy = true;
    const stream = options.stream !== false;
    streaming.set(stream);
    try {
      if (stream) {
        let streamError: string | undefined;
        // applyFinal runs from onFinal, so budget/contextWindow/conversationId update the moment the event arrives.
        await runLtAiStream(
          http,
          input,
          {
            onError: (message) => (streamError = message),
            onFinal: applyFinal,
            onToken: (token) => patch({ content: assistant.content + token }),
          },
          { signal: abort.signal },
        );
        if (streamError !== undefined) {
          fail(streamError);
        } else if (assistant.pending) {
          patch({ pending: false });
        }
      } else {
        applyFinal(await http.request<LtAiResponse>('POST', '/prompt', input, { signal: abort.signal }));
      }
    } catch (caught) {
      // A user-initiated stop() is no error: keep the streamed content and show no message.
      if (isLtAiAbortError(caught)) {
        patch({ pending: false });
      } else {
        fail(ltAiErrorMessage(caught));
      }
    } finally {
      if (isCurrent()) {
        controller = undefined;
        busy = false;
        streaming.set(false);
      }
    }
  }

  /** Send a new user message and stream the assistant's answer; ignored while a turn runs or for blank input. */
  async function send(content: string): Promise<void> {
    const text = content.trim();
    if (!text || busy) {
      return;
    }
    lastPrompt = text;
    push({ content: text, createdAt: new Date().toISOString(), role: 'user' });
    await runTurn(buildInput(text, false));
  }

  /** Confirm the last turn that requires confirmation (re-runs its prompt with `confirm: true`). */
  async function confirm(): Promise<void> {
    if (!requiresConfirmation() || !lastPrompt || busy) {
      return;
    }
    await runTurn(buildInput(lastPrompt, true));
  }

  /** Abort the running turn; its streamed content stays. */
  function stop(): void {
    controller?.abort();
    controller = undefined;
    if (busy) {
      // Detach the aborted turn, so a new send() is possible right away and the old turn cannot reset the state.
      turnSequence++;
      busy = false;
      streaming.set(false);
    }
  }

  /** Clear the local history and abort a running turn (the server-side conversation stays). */
  function clear(): void {
    stop();
    messages.set([]);
    budget.set(null);
    contextWindow.set(null);
    error.set(null);
    lastPrompt = '';
  }

  inject(DestroyRef).onDestroy(() => stop());

  return {
    budget: budget.asReadonly(),
    clear,
    confirm,
    contextWindow: contextWindow.asReadonly(),
    conversationId: conversationId.asReadonly(),
    error: error.asReadonly(),
    messages: messages.asReadonly(),
    requiresConfirmation,
    send,
    stop,
    streaming: streaming.asReadonly(),
  };
}
