import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, ErrorHandler, inject, Injector, PLATFORM_ID, Service, signal } from '@angular/core';
import { Router, ROUTES } from '@angular/router';
import { LT_I18N_OPTIONS, LT_RUNTIME_CONFIG, LtI18nService, LtToastService } from '@lenne.tech/ng-base';

import { isLtBugActive, LT_BUG_DEV_MODE, LT_BUG_INPUT_OPTIONS, LT_BUG_OPTIONS } from './bug-options';
import type {
  LtBrowserInfo,
  LtBugAttachment,
  LtBugErrorInfo,
  LtBugReportData,
  LtBugReportResponse,
  LtConsoleLogEntry,
  LtNetworkRequestEntry,
  LtUserInteractionEvent,
  LtUserInteractionMetadata,
  LtUserInteractionType,
} from './bug-types';
import type { LtBugCaptureEngine } from './capture-engine';
import { loadLtBugMessages } from './i18n/load';
import type { LtBugReportFormValue, LtBugReportIncludes } from './report';
import { captureLtBugScreenshot, LT_BUG_SCREENSHOT_LOADER } from './screenshot';

/** Error of {@link LtBugReportService.submit}; `message` is the translated text shown to the user. */
export class LtBugSubmitError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'LtBugSubmitError';
  }
}

/**
 * State and actions of the bug reporter, the counterpart of `useBugReport()` of `@lenne.tech/bug.lt`.
 *
 * `<lt-bug-report>` calls {@link start} when it is created: when the reporter is {@link active} it loads the capture engine
 * (a chunk of its own) and installs the hooks (console, `fetch`/`XMLHttpRequest`, user journey, `ErrorHandler`);
 * otherwise it loads and installs nothing. `<lt-bug-report>` renders the button and opens the dialog for {@link open}
 * requests.
 */
@Service()
export class LtBugReportService {
  /** Resolved options. */
  readonly options = inject(LT_BUG_OPTIONS);

  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(LtI18nService);
  private readonly i18nOptions = inject(LT_I18N_OPTIONS);
  private readonly toast = inject(LtToastService);
  private readonly screenshotLoader = inject(LT_BUG_SCREENSHOT_LOADER);

  /**
   * Whether the reporter runs: `provideLtBug()` is present, the code runs in the browser and the runtime decision says
   * on (`enabled`, else app env not `production`, else dev mode only). Decided once at startup.
   */
  readonly active: boolean =
    inject(LT_BUG_INPUT_OPTIONS) !== null &&
    isPlatformBrowser(inject(PLATFORM_ID)) &&
    isLtBugActive(this.options, inject(LT_RUNTIME_CONFIG, { optional: true })?.appEnv, inject(LT_BUG_DEV_MODE));

  /** The dialog is open (or about to open). */
  readonly isOpen = signal(false);
  /** A report is being sent. */
  readonly isSubmitting = signal(false);
  /** Message of the last failed submission (shown in the dialog). */
  readonly error = signal<string | null>(null);
  /** The last captured error (pre-fills the form). */
  readonly lastError = signal<LtBugErrorInfo | null>(null);
  /** Screenshot taken before the dialog opened (data URL). */
  readonly screenshot = signal<string | null>(null);
  /** A screenshot is being taken. */
  readonly capturingScreenshot = signal(false);
  /** Whether `modern-screenshot` could be loaded (`null` until the first attempt). */
  readonly screenshotAvailable = signal<boolean | null>(null);
  /** An {@link open} request waits for `<lt-bug-report>` (read and reset by the component). */
  readonly openRequested = signal(false);

  private engine: LtBugCaptureEngine | null = null;
  private engineLoad: Promise<LtBugCaptureEngine | null> = Promise.resolve(null);
  private pendingErrors: { error: unknown; source?: string }[] = [];
  private started = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Whether the capture hooks are installed. */
  get running(): boolean {
    return this.engine !== null;
  }

  /**
   * Load the capture engine and install the hooks for the enabled features (idempotent; does nothing while not
   * {@link active}). Errors reported before the engine is ready are handed over once it is.
   */
  start(): void {
    const view = this.document.defaultView;
    if (!this.active || this.started || !view) {
      return;
    }
    this.started = true;
    const router = this.injector.get(ROUTES, null) ? this.injector.get(Router, null) : null;
    const errorHandler = this.injector.get(ErrorHandler, null);
    this.engineLoad = import('./capture-engine').then(
      ({ startLtBugCapture }) => {
        if (!this.started) {
          return null;
        }
        this.engine = startLtBugCapture({ baseUri: this.document.baseURI, errorHandler, onError: (info) => this.onCapturedError(info), options: this.options, router, view });
        for (const { error, source } of this.pendingErrors.splice(0)) {
          this.engine.reportError(error, source);
        }
        return this.engine;
      },
      (error: unknown) => {
        console.warn('[@lenne.tech/ng-base/bug] Could not load the capture engine', error);
        return null;
      },
    );
  }

  /** Resolves once {@link start} has installed the hooks (`false` when inactive or the engine failed to load). */
  async whenReady(): Promise<boolean> {
    return (await this.engineLoad) !== null;
  }

  /** Remove every capture hook and restore the patched globals. */
  stop(): void {
    this.engine?.stop();
    this.engine = null;
    this.engineLoad = Promise.resolve(null);
    this.pendingErrors = [];
    this.started = false;
  }

  /**
   * Ask `<lt-bug-report>` to take a screenshot and open the dialog (also when the floating button is hidden with
   * `autoShow: false`); `error` pre-fills the form. Ignored while the reporter is not active.
   */
  open(error?: LtBugErrorInfo): void {
    if (!this.active) {
      return;
    }
    if (error) {
      this.lastError.set(error);
    }
    this.error.set(null);
    this.openRequested.set(true);
  }

  /** Report an error by hand (e.g. from a `catch` block): it becomes {@link lastError} and may auto-open the dialog. */
  reportError(error: unknown, source?: string): void {
    if (!this.active || !this.started) {
      return;
    }
    if (this.engine) {
      this.engine.reportError(error, source);
    } else {
      this.pendingErrors.push({ error, source });
    }
  }

  /** Record a custom user journey event (no-op while the journey is off). */
  recordInteraction(type: LtUserInteractionType, target: string, metadata?: LtUserInteractionMetadata): void {
    this.engine?.record(type, target, metadata);
  }

  /** The captured console entries (newest `maxConsoleLogs`). */
  getConsoleLogs(): LtConsoleLogEntry[] {
    return this.engine?.consoleLogs() ?? [];
  }

  /** The captured network requests (newest `maxNetworkRequests`). */
  getNetworkRequests(): LtNetworkRequestEntry[] {
    return this.engine?.networkRequests() ?? [];
  }

  /** The captured user journey (newest `userJourney.maxEvents`). */
  getUserJourney(): LtUserInteractionEvent[] {
    return this.engine?.userJourney() ?? [];
  }

  /** Browser details of the current page (`null` while inactive or outside the browser). */
  getBrowserInfo(): LtBrowserInfo | null {
    return this.engine?.browserInfo() ?? null;
  }

  /**
   * Take a viewport screenshot into {@link screenshot} (without the reporter's UI; network capture paused meanwhile).
   * Resolves `null` when screenshots are disabled, `modern-screenshot` is missing or the capture failed.
   */
  async captureScreenshot(): Promise<string | null> {
    const view = this.document.defaultView;
    if (!this.active || !this.options.enableScreenshot || !view) {
      return null;
    }
    this.capturingScreenshot.set(true);
    this.engine?.setNetworkPaused(true);
    try {
      const library = await this.screenshotLoader();
      this.screenshotAvailable.set(!!library);
      const dataUrl = library ? await captureLtBugScreenshot(library, view, this.options.theme) : null;
      this.screenshot.set(dataUrl);
      return dataUrl;
    } catch (error) {
      console.warn('[@lenne.tech/ng-base/bug] Screenshot capture failed', error);
      this.screenshot.set(null);
      return null;
    } finally {
      this.capturingScreenshot.set(false);
      this.engine?.setNetworkPaused(false);
    }
  }

  /** Assemble the payload from the form, the attachments and the collected data the user kept switched on. */
  async buildReport(form: LtBugReportFormValue, attachments: readonly LtBugAttachment[], includes: LtBugReportIncludes): Promise<LtBugReportData> {
    const engine = await this.engineLoad;
    if (engine) {
      return engine.buildReport(form, attachments, includes);
    }
    const { buildLtBugReport } = await import('./report');
    return buildLtBugReport(form, attachments, includes, {});
  }

  /**
   * POST the report to the endpoint. Shows a success or error toast; on failure sets {@link error} and rejects with a
   * {@link LtBugSubmitError} carrying the translated message.
   */
  async submit(report: LtBugReportData): Promise<LtBugReportResponse> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      // The texts of toasts and errors live in the lazy part (also when an app submits without the dialog).
      await loadLtBugMessages(this.i18n, this.i18nOptions.messages);
      const view = this.document.defaultView;
      if (!view?.fetch) {
        throw new LtBugSubmitError(this.i18n.t('lt.bug.errorSubmit'), 0);
      }
      let response: Response;
      try {
        response = await view.fetch(this.options.endpoint, {
          body: JSON.stringify(report),
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          method: 'POST',
        });
      } catch {
        throw new LtBugSubmitError(this.i18n.t('lt.bug.errorSubmit'), 0);
      }
      let body: LtBugReportResponse | null = null;
      try {
        body = (await response.json()) as LtBugReportResponse;
      } catch {
        body = null;
      }
      if (!response.ok || !body?.success) {
        throw new LtBugSubmitError(this.messageForStatus(response.status), response.status);
      }
      this.toast.show({
        color: 'success',
        description: body.identifier ? this.i18n.t('lt.bug.successDescription', { identifier: body.identifier }) : undefined,
        duration: 5000,
        title: this.i18n.t('lt.bug.successTitle'),
      });
      return body;
    } catch (error) {
      const failure = error instanceof LtBugSubmitError ? error : new LtBugSubmitError(this.i18n.t('lt.bug.errorSubmit'), 0);
      this.error.set(failure.message);
      this.toast.show({ color: 'error', description: failure.message, duration: 7000, title: this.i18n.t('lt.bug.errorTitle') });
      throw failure;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Forget screenshot, pre-fill error and submission error (after a sent report). */
  reset(): void {
    this.screenshot.set(null);
    this.lastError.set(null);
    this.error.set(null);
  }

  private onCapturedError(info: LtBugErrorInfo): void {
    // Errors may arrive while Angular renders a template: update the state outside of it.
    queueMicrotask(() => {
      this.lastError.set(info);
      if (this.options.autoOpenOnError && !this.isOpen()) {
        this.open(info);
      }
    });
  }

  private messageForStatus(status: number): string {
    switch (status) {
      case 400:
        return this.i18n.t('lt.bug.errorInvalid');
      case 404:
        return this.i18n.t('lt.bug.errorUnavailable');
      case 413:
        return this.i18n.t('lt.bug.errorTooLarge');
      case 429:
        return this.i18n.t('lt.bug.errorRateLimited');
      default:
        return this.i18n.t('lt.bug.errorSubmit');
    }
  }
}
