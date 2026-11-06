import { inject, Service, signal } from '@angular/core';

import { LtAiCallState } from './ai-call-state';
import { LtAiHttpService } from './ai-http';
import type { LtAiPrompt, LtAiPromptInput, LtAiPromptsState } from './ai-types';

/**
 * Saved prompts ("Vorlagen") of the user and the tenant (`GET/POST /ai/prompts`, `PUT/DELETE /ai/prompts/:id`), the
 * counterpart of `useLtAiPrompts()`. `load()` returns what the user may see (own + tenant), filtered by the server.
 * The list reloads after each mutation; ids are `encodeURIComponent`-ed.
 */
@Service()
export class LtAiPromptsService implements LtAiPromptsState {
  private readonly http = inject(LtAiHttpService);
  private readonly calls = new LtAiCallState();
  private readonly list = signal<LtAiPrompt[]>([]);
  private loadSequence = 0;

  readonly error = this.calls.error;
  readonly loading = this.calls.loading;
  readonly prompts = this.list.asReadonly();

  /** Load the visible prompts; a failure sets `error`, empties the list and does not throw. Only the latest load is applied. */
  async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    try {
      const prompts = await this.calls.run(() => this.http.request<LtAiPrompt[]>('GET', '/prompts'));
      if (sequence === this.loadSequence) {
        this.list.set(prompts ?? []);
      }
    } catch {
      if (sequence === this.loadSequence) {
        this.list.set([]);
      }
    }
  }

  /** Create a prompt and reload the list; throws (and sets `error`) when refused. */
  async create(input: LtAiPromptInput): Promise<LtAiPrompt> {
    return this.mutate(() => this.http.request<LtAiPrompt>('POST', '/prompts', input));
  }

  /** Update a prompt and reload the list; throws (and sets `error`) when refused. */
  async update(id: string, input: LtAiPromptInput): Promise<LtAiPrompt> {
    return this.mutate(() => this.http.request<LtAiPrompt>('PUT', `/prompts/${encodeURIComponent(id)}`, input));
  }

  /** Delete a prompt and reload the list; throws (and sets `error`) when refused. */
  async remove(id: string): Promise<LtAiPrompt> {
    return this.mutate(() => this.http.request<LtAiPrompt>('DELETE', `/prompts/${encodeURIComponent(id)}`));
  }

  private async mutate(call: () => Promise<LtAiPrompt>): Promise<LtAiPrompt> {
    return this.calls.run(async () => {
      const result = await call();
      await this.load();
      return result;
    });
  }
}
