import { isPlatformBrowser } from '@angular/common';
import { computed, inject, InjectionToken, PLATFORM_ID, Service, signal } from '@angular/core';

import { LtApiUrlService } from './api-url';
import { LT_FETCH } from './fetch';
import { LtI18nService } from './i18n';
import { LtToastService } from './toast';

/** Response of nest-server `GET /i18n/errors/:locale`. */
export interface LtErrorTranslationResponse {
  errors: Record<string, string>;
}

/** Result of {@link LtErrorTranslationService.parseError}. */
export interface LtParsedError {
  /** Error code such as `LTNS_0100`, or `null` when the message carries none. */
  code: string | null;
  /** Message as sent by the backend (without the `#CODE:` marker). */
  developerMessage: string;
  /** Translated message for the active locale; falls back to the developer message, never empty for a message-bearing error. */
  translatedMessage: string;
}

/** Options of the error translation (part of `provideLtNgBase({ errorTranslation })`, runtime `NG_PUBLIC_LT_ERROR_TRANSLATION_*`). */
export interface LtErrorTranslationOptions {
  /** Locale used when i18n does not decide (default `de`). */
  defaultLocale?: string;
  /** Load and apply backend translations (default `true`). */
  enabled?: boolean;
  /** Load the translations for the detected locale while the app starts, browser only (default `true`). */
  preload?: boolean;
}

/** Resolved error translation options. */
export const LT_ERROR_TRANSLATION_OPTIONS = new InjectionToken<Required<LtErrorTranslationOptions>>('LT_ERROR_TRANSLATION_OPTIONS', {
  factory: () => ({ defaultLocale: 'de', enabled: true, preload: true }),
});

const ERROR_CODE_REGEX = /^#([A-Z_]+_\d+):\s*(.+)$/s;

/** A translation load that takes longer is aborted (the next call retries). */
export const LT_ERROR_TRANSLATION_TIMEOUT_MS = 10_000;

/**
 * Translates nest-server error messages of the form `#LTNS_0100: Developer message` with the backend's
 * `GET /i18n/errors/:locale` table.
 */
@Service()
export class LtErrorTranslationService {
  private readonly api = inject(LtApiUrlService);
  private readonly fetch = inject(LT_FETCH);
  private readonly i18n = inject(LtI18nService);
  private readonly toast = inject(LtToastService);
  private readonly options = inject(LT_ERROR_TRANSLATION_OPTIONS);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly translations = signal<Record<string, Record<string, string>>>({});
  private readonly inFlight = new Map<string, Promise<void>>();

  /** Locale used for lookups. */
  readonly currentLocale = computed(() => this.i18n.locale() || this.options.defaultLocale || 'de');
  /** Whether translations for the current locale are loaded. */
  readonly isLoaded = computed(() => !!this.translations()[this.currentLocale()]);
  /** Whether a load is running. */
  readonly isLoading = signal(false);

  /** Load the backend translations for `locale` (default: current locale). Cached per locale, one request in flight per locale. */
  async loadTranslations(locale?: string): Promise<void> {
    if (!this.options.enabled) {
      return;
    }
    const target = locale || this.currentLocale();
    if (this.translations()[target]) {
      return;
    }
    const running = this.inFlight.get(target);
    if (running) {
      return running;
    }
    const load = (async () => {
      this.isLoading.set(true);
      try {
        const response = await this.fetch(this.api.buildUrl(`/i18n/errors/${encodeURIComponent(target)}`), {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(LT_ERROR_TRANSLATION_TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as Partial<LtErrorTranslationResponse> | null;
        if (body?.errors && typeof body.errors === 'object') {
          this.translations.update((current) => ({ ...current, [target]: body.errors as Record<string, string> }));
        }
      } catch (error) {
        console.warn(`[@lenne.tech/ng-base] Failed to load error translations for ${target}:`, error);
      } finally {
        this.inFlight.delete(target);
        this.isLoading.set(this.inFlight.size > 0);
      }
    })();
    this.inFlight.set(target, load);
    return load;
  }

  /** Parse any error shape (string, `Error`, `HttpErrorResponse`, response body) into code + messages. */
  parseError(errorOrMessage: unknown): LtParsedError {
    const message = extractLtErrorMessage(errorOrMessage);
    const match = message.match(ERROR_CODE_REGEX);
    if (!match) {
      return { code: null, developerMessage: message, translatedMessage: message };
    }
    const code = match[1] ?? '';
    const developerMessage = (match[2] ?? '').trim();
    const translatedMessage = this.translations()[this.currentLocale()]?.[code] || developerMessage;
    return { code, developerMessage, translatedMessage };
  }

  /** Translated message for an error (never empty for a message-bearing error). */
  translateError(errorOrMessage: unknown): string {
    return this.parseError(errorOrMessage).translatedMessage;
  }

  /** Show the translated error as an error toast (browser only); logs to the console when no toaster is bound. */
  showErrorToast(errorOrMessage: unknown, title?: string): void {
    if (!this.isBrowser) {
      return;
    }
    const parsed = this.parseError(errorOrMessage);
    const shown = this.toast.show({ color: 'error', description: parsed.translatedMessage, title: title || this.i18n.t('lt.error.title') });
    if (!shown) {
      console.error('[@lenne.tech/ng-base]', parsed.translatedMessage);
    }
  }
}

/**
 * Extract the human-relevant message from an error.
 *
 * The response body wins over a transport message: `HttpErrorResponse.message` is
 * `Http failure response for …: 400 Bad Request`, while the backend message (the only one that can carry a
 * `#LTNS_` marker) is in `error.message`. Better Auth errors (`{ code, message }`) and arrays of messages
 * (class-validator) are handled too.
 */
export function extractLtErrorMessage(errorOrMessage: unknown): string {
  if (typeof errorOrMessage === 'string') {
    return errorOrMessage;
  }
  if (errorOrMessage === null || errorOrMessage === undefined) {
    return '';
  }
  if (typeof errorOrMessage !== 'object') {
    return String(errorOrMessage);
  }
  const source = errorOrMessage as Record<string, unknown>;
  for (const candidate of [source['error'], source['data'], source['body']]) {
    const fromBody = messageOf(candidate);
    if (fromBody) {
      return fromBody;
    }
  }
  return messageOf(source) || (typeof source['statusText'] === 'string' && source['statusText']) || String(errorOrMessage);
}

function messageOf(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  const message = (value as Record<string, unknown>)['message'];
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message)) {
    return message.filter((part) => typeof part === 'string').join(', ');
  }
  const nested = (value as Record<string, unknown>)['error'];
  if (nested && typeof nested === 'object') {
    return messageOf(nested);
  }
  return '';
}
