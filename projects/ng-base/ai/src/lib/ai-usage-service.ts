import { inject, Service, signal } from '@angular/core';

import { LtAiCallState } from './ai-call-state';
import { LtAiHttpService } from './ai-http';
import type { LtAiUsageInfo, LtAiUsageState } from './ai-types';

/**
 * Token/prompt usage and budget of user and tenant (`GET /ai/usage`), the counterpart of `useLtAiUsage()`. The compact
 * per-response budget is on every prompt response (see `injectLtAiChat().budget`); this loads the full breakdown.
 */
@Service()
export class LtAiUsageService implements LtAiUsageState {
  private readonly http = inject(LtAiHttpService);
  private readonly calls = new LtAiCallState();
  private readonly current = signal<LtAiUsageInfo | null>(null);

  readonly error = this.calls.error;
  readonly loading = this.calls.loading;
  readonly usage = this.current.asReadonly();

  /** Load the usage; a failure sets `error` and does not throw. */
  async load(): Promise<void> {
    await this.calls.runQuietly(async () => {
      this.current.set((await this.http.request<LtAiUsageInfo>('GET', '/usage')) ?? null);
    });
  }
}
