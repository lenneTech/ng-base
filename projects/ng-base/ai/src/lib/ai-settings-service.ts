import { computed, inject, Service, signal } from '@angular/core';

import { LtAiCallState } from './ai-call-state';
import { LtAiHttpService } from './ai-http';
import type { LtAiSettings, LtAiSettingsInput, LtAiSettingsState } from './ai-types';

/**
 * The user's own AI settings (`GET/PUT /ai/settings`, nest-server >= 12.3.0), the counterpart of `useLtAiSettings()`.
 *
 * The answer is always the setting as it takes effect and is adopted as is. When the server fixes it
 * (`ai.mcp.confirmation.enforced`), `enforced` is true, the switch should be shown disabled, and `update()` is refused
 * with 403 `#LTNS_0609` (the previous value stays).
 */
@Service()
export class LtAiSettingsService implements LtAiSettingsState {
  private readonly http = inject(LtAiHttpService);
  private readonly calls = new LtAiCallState();
  private readonly current = signal<LtAiSettings | null>(null);

  readonly enforced = computed(() => this.current()?.mcpConfirmationEnforced === true);
  readonly error = this.calls.error;
  readonly loading = this.calls.loading;
  readonly settings = this.current.asReadonly();

  /** Load the settings; a failure sets `error` and does not throw. */
  async load(): Promise<void> {
    await this.calls.runQuietly(async () => {
      this.current.set((await this.http.request<LtAiSettings>('GET', '/settings')) ?? null);
    });
  }

  /** Store the user's choice and adopt the server's answer; throws (and sets `error`) when refused. */
  async update(input: LtAiSettingsInput): Promise<void> {
    await this.calls.run(async () => {
      this.current.set((await this.http.request<LtAiSettings>('PUT', '/settings', input)) ?? null);
    });
  }
}
