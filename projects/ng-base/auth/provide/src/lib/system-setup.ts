import { isPlatformServer } from '@angular/common';
import { inject, makeStateKey, PLATFORM_ID, Service, signal, TransferState } from '@angular/core';
import { LT_FETCH, LtApiUrlService, ltSha256 } from '@lenne.tech/ng-base';

import type { LtSystemSetupInput, LtSystemSetupStatus } from './auth-types';

/** TransferState key of the setup status read during SSR. */
export const LT_SYSTEM_SETUP_STATE_KEY = makeStateKey<LtSystemSetupStatus>('lt-system-setup');

/** Header that carries the setup token. Sent unhashed and never in the body (the server compares it as given). */
export const LT_SYSTEM_SETUP_TOKEN_HEADER = 'X-System-Setup-Token';

/**
 * Error thrown by `initSetup()` for a non-2xx answer. `data` is the response body, so
 * `LtErrorTranslationService.translateError(error)` reads its `#LTNS_xxxx` code (`LTNS_0053` HTTP setup disabled,
 * `LTNS_0054` wrong token).
 */
export interface LtSystemSetupError extends Error {
  data: unknown;
  status: number;
  statusCode: number;
}

/**
 * First-admin setup of nest-server (`/system-setup/*`), the counterpart of `useSystemSetup()`.
 * Status is fetched once and transferred SSR → browser.
 */
@Service()
export class LtSystemSetupService {
  private readonly api = inject(LtApiUrlService);
  private readonly fetch = inject(LT_FETCH);
  private readonly transferState = inject(TransferState);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly transferred = this.isServer ? null : this.transferState.get(LT_SYSTEM_SETUP_STATE_KEY, null);
  private readonly needsSetupState = signal<boolean | null>(this.transferred ? this.transferred.needsSetup : null);
  private readonly httpInitEnabledState = signal<boolean | null>(this.transferred ? this.transferred.httpInitEnabled !== false : null);
  private readonly httpInitTokenRequiredState = signal<boolean | null>(this.transferred ? this.transferred.httpInitTokenRequired === true : null);
  private statusRequest: Promise<LtSystemSetupStatus> | null = null;

  /** `true` when no admin exists yet; `null` until checked. */
  readonly needsSetup = this.needsSetupState.asReadonly();
  /** Whether HTTP init is open (nest-server ≥ 12.4; `true` for older APIs); `null` until checked. */
  readonly httpInitEnabled = this.httpInitEnabledState.asReadonly();
  /** Whether HTTP init requires `X-System-Setup-Token`; `null` until checked. */
  readonly httpInitTokenRequired = this.httpInitTokenRequiredState.asReadonly();

  /** `GET /system-setup/status`. Errors/404 → `needsSetup = false`. SSR without API URL → `false` without fetching. */
  checkSetupStatus(): Promise<LtSystemSetupStatus> {
    // Without an API URL the path stays relative; on the server it would never reach the backend. Leave the status
    // undecided, the browser checks once it can resolve the URL.
    if (this.isServer && this.api.resolve().missing) {
      this.api.reportMissing();
      return Promise.resolve({ needsSetup: false });
    }
    if (!this.statusRequest) {
      this.statusRequest = this.loadStatus().finally(() => {
        this.statusRequest = null;
      });
    }
    return this.statusRequest;
  }

  /**
   * `POST /system-setup/init` with `{ email, password: sha256, name }`; the token (trimmed, unhashed) goes into
   * `X-System-Setup-Token`. On 403 the status is re-read and the error rethrown (`LTNS_0053` disabled, `LTNS_0054` wrong token).
   */
  async initSetup(input: LtSystemSetupInput): Promise<void> {
    const url = this.api.buildUrl('/system-setup/init');
    const password = await ltSha256(input.password);
    // A header value carries no surrounding whitespace; a pasted line break would make fetch throw.
    const token = input.token?.trim();
    const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' };
    if (token) {
      headers[LT_SYSTEM_SETUP_TOKEN_HEADER] = token;
    }
    const response = await this.fetch(url, { body: JSON.stringify({ email: input.email, name: input.name, password }), headers, method: 'POST' });
    if (!response.ok) {
      const error = await toSetupError(response);
      if (response.status === 403) {
        // The API may have been restarted with another configuration since the status was read.
        await this.checkSetupStatus();
      }
      throw error;
    }
    this.needsSetupState.set(false);
  }

  private async loadStatus(): Promise<LtSystemSetupStatus> {
    try {
      const response = await this.fetch(this.api.buildUrl('/system-setup/status'), { headers: { accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = ((await response.json()) ?? {}) as Record<string, unknown>;
      const status: LtSystemSetupStatus = {
        // Missing or malformed reads as released: an API before 12.4.0 accepts the HTTP setup, its 403 is the boundary.
        httpInitEnabled: typeof data['httpInitEnabled'] === 'boolean' ? data['httpInitEnabled'] : true,
        httpInitTokenRequired: data['httpInitTokenRequired'] === true,
        needsSetup: data['needsSetup'] === true,
      };
      this.needsSetupState.set(status.needsSetup);
      this.httpInitEnabledState.set(status.httpInitEnabled ?? true);
      this.httpInitTokenRequiredState.set(status.httpInitTokenRequired ?? false);
      if (this.isServer) {
        this.transferState.set(LT_SYSTEM_SETUP_STATE_KEY, status);
      }
      return status;
    } catch {
      // Error or 404: the endpoint does not exist (older API) → no setup flow.
      this.needsSetupState.set(false);
      return { needsSetup: false };
    }
  }
}

async function toSetupError(response: Response): Promise<LtSystemSetupError> {
  const text = await response.text().catch(() => '');
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // keep the text
  }
  const bodyMessage = data && typeof data === 'object' ? (data as { message?: unknown }).message : data;
  const message = typeof bodyMessage === 'string' && bodyMessage ? bodyMessage : `[POST] /system-setup/init: ${response.status} ${response.statusText}`.trim();
  return Object.assign(new Error(message), { data, status: response.status, statusCode: response.status }) as LtSystemSetupError;
}
