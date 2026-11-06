import { isPlatformServer } from '@angular/common';
import { computed, inject, makeStateKey, PendingTasks, PLATFORM_ID, Service, signal, TransferState } from '@angular/core';

import { LtAiHttpService } from './ai-http';
import type { LtAiStatus, LtAiStatusState } from './ai-types';

/** `TransferState` key under which the server hands the AI status to the browser. */
export const LT_AI_STATUS_STATE_KEY = makeStateKey<LtAiStatus>('lt-ai-status');

/** Upper bound of the status request, so a hanging API cannot stall every server render. */
export const LT_AI_STATUS_TIMEOUT_MS = 5000;

const INITIAL_STATUS: LtAiStatus = { enabled: false, error: null, loaded: false, mcp: false };

/**
 * Whether the API's AI module is on (`GET /ai/status`, no credentials, 5 s timeout), the counterpart of
 * `useLtAiStatus()`. nest-server answers 200 `{ mcp }` while the module is on and 404 while it is off.
 *
 * One request per app: concurrent `load()` calls share it, a loaded status is not asked again unless `force` is set.
 * On the server the render waits for the answer and the status travels to the browser via `TransferState`, so the
 * browser adopts it without a second request. Sent without credentials: the endpoint is public and the auth-aware
 * fetch would start its 401 handling for nothing.
 *
 * Fails closed: anything but a well-formed 200 leaves `enabled` false. A 404 is an answer ("AI is off") and sets no
 * `error`; a network error, a timeout, any other status or a malformed body sets a fixed `error` text, never the raw
 * error message (on the server that may carry the private API URL incl. credentials and ends up in the HTML).
 */
@Service()
export class LtAiStatusService implements LtAiStatusState {
  private readonly http = inject(LtAiHttpService);
  private readonly transferState = inject(TransferState);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly state = signal<LtAiStatus>(this.readTransferred());
  private inflight: Promise<void> | null = null;

  readonly enabled = computed(() => this.state().enabled);
  readonly error = computed(() => this.state().error);
  readonly loaded = computed(() => this.state().loaded);
  readonly mcp = computed(() => this.state().mcp);

  /** Read the status once per app start; `force` asks again. Never throws. */
  load(options: { force?: boolean } = {}): Promise<void> {
    if (this.state().loaded && !options.force) {
      return Promise.resolve();
    }
    if (this.inflight) {
      return this.inflight;
    }
    const done = this.isServer ? this.pendingTasks.add() : undefined;
    const request = this.fetchStatus()
      .then((status) => {
        this.state.set(status);
        if (this.isServer) {
          this.transferState.set(LT_AI_STATUS_STATE_KEY, status);
        }
      })
      .finally(() => {
        this.inflight = null;
        done?.();
      });
    this.inflight = request;
    return request;
  }

  private async fetchStatus(): Promise<LtAiStatus> {
    const failed = (error: string): LtAiStatus => ({ enabled: false, error, loaded: true, mcp: false });
    let response: Response;
    try {
      response = await fetch(this.http.buildUrl('/status'), {
        credentials: 'omit',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(LT_AI_STATUS_TIMEOUT_MS),
      });
    } catch (error) {
      return failed((error as { name?: unknown } | null)?.name === 'TimeoutError' ? 'AI status request timed out' : 'AI status request failed');
    }
    if (response.status === 404) {
      return { enabled: false, error: null, loaded: true, mcp: false };
    }
    if (!response.ok) {
      return failed(`HTTP ${response.status}`);
    }
    try {
      const body = (await response.json()) as { mcp?: unknown } | null;
      if (typeof body?.mcp === 'boolean') {
        return { enabled: true, error: null, loaded: true, mcp: body.mcp };
      }
    } catch {
      // not JSON, e.g. an HTML page from a misrouted proxy
    }
    return failed('Unexpected AI status response');
  }

  private readTransferred(): LtAiStatus {
    const transferred = this.transferState.get<LtAiStatus | null>(LT_AI_STATUS_STATE_KEY, null);
    if (!transferred || transferred.loaded !== true) {
      return INITIAL_STATUS;
    }
    return {
      enabled: transferred.enabled === true,
      error: typeof transferred.error === 'string' ? transferred.error : null,
      loaded: true,
      mcp: transferred.enabled === true && transferred.mcp === true,
    };
  }
}
