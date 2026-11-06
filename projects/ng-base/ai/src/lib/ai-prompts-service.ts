import { computed, inject, Service, signal } from '@angular/core';

import { LtAiCallState } from './ai-call-state';
import { LtAiHttpService } from './ai-http';
import type { LtAiPrompt, LtAiPromptInput, LtAiPromptsLoadOptions, LtAiPromptsState } from './ai-types';

/**
 * Saved prompts ("Vorlagen") of the user and the tenant (`GET/POST /ai/prompts`, `PUT/DELETE /ai/prompts/:id`), the
 * counterpart of `useLtAiPrompts()`. `load()` returns what the user may see (own + tenant), filtered by the server;
 * `load({ includeDisabled: true })` adds the disabled ones for the management page (`GET /ai/prompts?includeDisabled=true`,
 * nest-server 12.7.0; older servers ignore the parameter). The list reloads after each mutation in the mode of the last
 * load; ids are `encodeURIComponent`-ed. The service is a root singleton, so a chat picker should read
 * {@link enabledPrompts}, which stays correct while a management page holds the list with disabled prompts.
 */
@Service()
export class LtAiPromptsService implements LtAiPromptsState {
  private readonly http = inject(LtAiHttpService);
  private readonly calls = new LtAiCallState();
  private readonly list = signal<LtAiPrompt[]>([]);
  private loadSequence = 0;
  private includeDisabled = false;

  readonly error = this.calls.error;
  readonly loading = this.calls.loading;
  readonly prompts = this.list.asReadonly();
  /** The prompts a chat may offer: `prompts` without the disabled ones (`enabled: false`). */
  readonly enabledPrompts = computed(() => this.list().filter((prompt) => prompt.enabled !== false));

  /**
   * Load the visible prompts (with `includeDisabled` also the disabled ones); a failure sets `error`, empties the list
   * and does not throw. Only the latest load is applied.
   */
  async load(options: LtAiPromptsLoadOptions = {}): Promise<void> {
    const sequence = ++this.loadSequence;
    this.includeDisabled = options.includeDisabled === true;
    const path = this.includeDisabled ? '/prompts?includeDisabled=true' : '/prompts';
    try {
      const prompts = await this.calls.run(() => this.http.request<LtAiPrompt[]>('GET', path));
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
      await this.load({ includeDisabled: this.includeDisabled });
      return result;
    });
  }
}
