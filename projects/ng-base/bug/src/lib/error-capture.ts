import type { ErrorHandler } from '@angular/core';

import type { LtBugErrorInfo } from './bug-types';
import { redactLtText, redactLtUrl, truncateLt } from './redact';

const DEDUPE_MS = 1000;

/** The window members the error capture listens on. */
export type LtErrorCaptureWindow = Pick<Window, 'addEventListener' | 'location' | 'navigator' | 'removeEventListener'>;

/**
 * Wrap `handler.handleError` so `listener` sees every error first; the app's handler (Angular's default or its own)
 * keeps handling each error exactly as before. Returns a function that restores the original method.
 */
export function ltWrapErrorHandler(handler: ErrorHandler, listener: (error: unknown) => void): () => void {
  const hadOwn = Object.prototype.hasOwnProperty.call(handler, 'handleError');
  const original = handler.handleError;
  const wrapped = function (this: ErrorHandler, error: unknown): void {
    try {
      listener(error);
    } catch {
      // The reporter must never break error handling.
    }
    original.call(this, error);
  };
  handler.handleError = wrapped;
  return () => {
    if (handler.handleError !== wrapped) {
      return;
    }
    if (hadOwn) {
      handler.handleError = original;
    } else {
      delete (handler as Partial<ErrorHandler>).handleError;
    }
  };
}

/** Normalised, redacted error information. */
export function toLtBugErrorInfo(error: unknown, componentName: string | undefined, view?: Pick<Window, 'location' | 'navigator'> | null): LtBugErrorInfo {
  const candidate = error as { message?: unknown; stack?: unknown } | null | undefined;
  const message = typeof error === 'string' ? error : typeof candidate?.message === 'string' && candidate.message ? candidate.message : String(error ?? 'Unknown error');
  const stack = typeof candidate?.stack === 'string' ? candidate.stack : undefined;
  return {
    componentName,
    message: truncateLt(redactLtText(message), 1000),
    stack: stack ? truncateLt(redactLtText(stack), 5000) : undefined,
    timestamp: new Date().toISOString(),
    url: view?.location?.href ? redactLtUrl(view.location.href) : undefined,
    userAgent: view?.navigator?.userAgent,
  };
}

/**
 * Captures errors from the Angular `ErrorHandler` (wrapped, see {@link ltWrapErrorHandler}) and from uncaught errors
 * and unhandled rejections on the window, and hands each one once to `onError` (the same error object, or the same
 * message within a second, is reported once — Angular's global error listeners forward window errors to the handler
 * as well).
 */
export class LtErrorCapture {
  private readonly seen = new WeakSet<object>();
  private lastMessage: { at: number; message: string } | null = null;
  private cleanups: (() => void)[] = [];
  private view: LtErrorCaptureWindow | null = null;

  constructor(private readonly onError: (info: LtBugErrorInfo, error: unknown) => void) {}

  /** Whether the capture is installed. */
  get installed(): boolean {
    return this.cleanups.length > 0;
  }

  /** Wrap `handler` and listen on `view` (idempotent). */
  install(handler: ErrorHandler | null, view: LtErrorCaptureWindow | null): void {
    if (this.installed) {
      return;
    }
    this.view = view;
    if (handler) {
      this.cleanups.push(ltWrapErrorHandler(handler, (error) => this.report(error, 'ErrorHandler')));
    }
    if (view) {
      const onError = (event: ErrorEvent) => this.report(event.error ?? event.message, 'window');
      const onRejection = (event: PromiseRejectionEvent) => this.report(event.reason, 'unhandledrejection');
      view.addEventListener('error', onError as EventListener);
      view.addEventListener('unhandledrejection', onRejection as EventListener);
      this.cleanups.push(() => {
        view.removeEventListener('error', onError as EventListener);
        view.removeEventListener('unhandledrejection', onRejection as EventListener);
      });
    }
    if (!this.cleanups.length) {
      this.cleanups.push(() => undefined);
    }
  }

  /** Restore the handler and remove the listeners. */
  uninstall(): void {
    while (this.cleanups.length) {
      this.cleanups.pop()?.();
    }
    this.view = null;
  }

  /** Report an error (also used for `LtBugReportService.reportError()`); duplicates are dropped. */
  report(error: unknown, componentName?: string): void {
    if (error && typeof error === 'object') {
      if (this.seen.has(error)) {
        return;
      }
      this.seen.add(error);
    }
    const info = toLtBugErrorInfo(error, componentName, this.view);
    const at = Date.now();
    if (this.lastMessage && this.lastMessage.message === info.message && at - this.lastMessage.at < DEDUPE_MS) {
      return;
    }
    this.lastMessage = { at, message: info.message };
    this.onError(info, error);
  }
}
