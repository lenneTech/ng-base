import { inject, Service, signal } from '@angular/core';

import { LtAiCallState } from './ai-call-state';
import { LtAiHttpService } from './ai-http';
import type { LtAiPlaceholder, LtAiPlaceholdersState } from './ai-types';

/**
 * Runtime placeholder registry for prompts (`GET /ai/placeholders`), the counterpart of `useLtAiPlaceholders()`, so
 * slot/prompt editors can list the supported `{{placeholders}}` without hard-coding them.
 */
@Service()
export class LtAiPlaceholdersService implements LtAiPlaceholdersState {
  private readonly http = inject(LtAiHttpService);
  private readonly calls = new LtAiCallState();
  private readonly list = signal<LtAiPlaceholder[]>([]);

  readonly error = this.calls.error;
  readonly loading = this.calls.loading;
  readonly placeholders = this.list.asReadonly();

  /** Load the registry; a failure sets `error`, empties the list and does not throw. */
  async load(): Promise<void> {
    try {
      await this.calls.run(async () => {
        this.list.set((await this.http.request<LtAiPlaceholder[]>('GET', '/placeholders')) ?? []);
      });
    } catch {
      this.list.set([]);
    }
  }
}
