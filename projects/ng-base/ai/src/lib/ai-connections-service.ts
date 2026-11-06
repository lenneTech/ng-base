import { computed, inject, Service, signal } from '@angular/core';

import { LtAiCallState } from './ai-call-state';
import { LtAiHttpService } from './ai-http';
import type { LtAiAvailableConnection, LtAiConnectionsState } from './ai-types';

/**
 * Connections the user may pick (`GET /ai/connections/available`, `POST /ai/connections/select`), the counterpart
 * of `useLtAiConnections()`. `selected` is the connection flagged `selected`; `locked` is true when a mandatory layer
 * applies (any connection flagged `locked`), then the picker should be read-only.
 */
@Service()
export class LtAiConnectionsService implements LtAiConnectionsState {
  private readonly http = inject(LtAiHttpService);
  private readonly calls = new LtAiCallState();
  private readonly list = signal<LtAiAvailableConnection[]>([]);

  readonly connections = this.list.asReadonly();
  readonly error = this.calls.error;
  readonly loading = this.calls.loading;
  readonly locked = computed(() => this.list().some((connection) => connection.locked));
  readonly selected = computed(() => this.list().find((connection) => connection.selected));

  /** Load the available connections; a failure sets `error` and does not throw. */
  async load(): Promise<void> {
    await this.calls.runQuietly(async () => {
      this.list.set((await this.http.request<LtAiAvailableConnection[]>('GET', '/connections/available')) ?? []);
    });
  }

  /** Make `connectionId` the user's default; adopts the list the server answers with. Throws (and sets `error`) when refused. */
  async select(connectionId: string): Promise<void> {
    await this.calls.run(async () => {
      this.list.set((await this.http.request<LtAiAvailableConnection[]>('POST', '/connections/select', { connectionId })) ?? []);
    });
  }
}
