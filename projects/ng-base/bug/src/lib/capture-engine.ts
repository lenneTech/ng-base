import type { ErrorHandler } from '@angular/core';
import { NavigationEnd, type Router } from '@angular/router';

import { getLtBrowserInfo } from './browser-info';
import type {
  LtBrowserInfo,
  LtBugAttachment,
  LtBugErrorInfo,
  LtBugReportData,
  LtConsoleLogEntry,
  LtNetworkRequestEntry,
  LtResolvedBugOptions,
  LtUserInteractionEvent,
  LtUserInteractionMetadata,
  LtUserInteractionType,
} from './bug-types';
import { LtConsoleCapture } from './console-capture';
import { LtErrorCapture, toLtBugErrorInfo } from './error-capture';
import { LtJourneyCapture } from './journey-capture';
import { LtNetworkCapture } from './network-capture';
import { buildLtBugReport, type LtBugReportFormValue, type LtBugReportIncludes } from './report';

/** What {@link startLtBugCapture} needs from the app. */
export interface LtBugCaptureDeps {
  /** Base URL for router URLs (`document.baseURI`). */
  baseUri: string;
  /** The app's `ErrorHandler` (wrapped, it keeps handling every error); `null` skips it. */
  errorHandler: ErrorHandler | null;
  /** Called once per captured error. */
  onError: (info: LtBugErrorInfo) => void;
  options: LtResolvedBugOptions;
  /** The app's router (navigation from `NavigationEnd`); without one `popstate`/`hashchange` are used. */
  router: Pick<Router, 'events'> | null;
  view: Window;
}

/** Handle of the installed capture hooks. */
export interface LtBugCaptureEngine {
  browserInfo(): LtBrowserInfo | null;
  buildReport(form: LtBugReportFormValue, attachments: readonly LtBugAttachment[], includes: LtBugReportIncludes): LtBugReportData;
  consoleLogs(): LtConsoleLogEntry[];
  networkRequests(): LtNetworkRequestEntry[];
  record(type: LtUserInteractionType, target: string, metadata?: LtUserInteractionMetadata): void;
  recordError(message: string): void;
  reportError(error: unknown, source?: string): void;
  setNetworkPaused(paused: boolean): void;
  stop(): void;
  userJourney(): LtUserInteractionEvent[];
}

/**
 * Install the capture hooks of the enabled features (console, `fetch`/`XMLHttpRequest`, user journey, `ErrorHandler`
 * and window errors). Loaded by `LtBugReportService.start()` only while the reporter is active, so production bundles
 * load none of this code.
 */
export function startLtBugCapture(deps: LtBugCaptureDeps): LtBugCaptureEngine {
  const { options, view } = deps;
  const consoleCapture = options.enableConsoleLogs ? new LtConsoleCapture(options.maxConsoleLogs, (view as Window & typeof globalThis).console ?? console) : null;
  consoleCapture?.install(view);

  const networkCapture = options.enableNetworkRequests ? new LtNetworkCapture(options.maxNetworkRequests, [options.endpoint]) : null;
  networkCapture?.install(view);

  const journeyEnabled = options.enableUserJourney && options.userJourney.enabled;
  const journeyCapture = journeyEnabled ? new LtJourneyCapture(options.userJourney) : null;
  journeyCapture?.install(view, { listenToHistory: !deps.router });
  const routerSubscription =
    journeyCapture && deps.router && options.userJourney.captureNavigation
      ? deps.router.events.subscribe((event) => {
          if (event instanceof NavigationEnd) {
            journeyCapture.recordNavigation(absoluteUrl(event.urlAfterRedirects, deps.baseUri || view.location.href));
          }
        })
      : null;

  const errorCapture = options.enableErrorBoundary
    ? new LtErrorCapture((info) => {
        journeyCapture?.recordError(info.message);
        deps.onError(info);
      })
    : null;
  errorCapture?.install(deps.errorHandler, view);

  const engine: LtBugCaptureEngine = {
    browserInfo: () => {
      try {
        return getLtBrowserInfo(view as Window & typeof globalThis);
      } catch {
        return null;
      }
    },
    buildReport: (form, attachments, includes) =>
      buildLtBugReport(form, attachments, includes, {
        browserInfo: options.enableBrowserInfo ? () => getLtBrowserInfo(view as Window & typeof globalThis) : undefined,
        consoleLogs: consoleCapture ? () => engine.consoleLogs() : undefined,
        networkRequests: networkCapture ? () => engine.networkRequests() : undefined,
        userInteractions: journeyCapture ? () => engine.userJourney() : undefined,
      }),
    consoleLogs: () => consoleCapture?.entries(options.maxConsoleLogs) ?? [],
    networkRequests: () => networkCapture?.entries(options.maxNetworkRequests) ?? [],
    record: (type, target, metadata) => journeyCapture?.record(type, target, metadata),
    recordError: (message) => journeyCapture?.recordError(message),
    reportError: (error, source) => (errorCapture ? errorCapture.report(error, source) : deps.onError(toLtBugErrorInfo(error, source, view))),
    setNetworkPaused: (paused) => {
      if (networkCapture) {
        networkCapture.paused = paused;
      }
    },
    stop: () => {
      consoleCapture?.uninstall();
      networkCapture?.uninstall();
      journeyCapture?.uninstall();
      errorCapture?.uninstall();
      routerSubscription?.unsubscribe();
    },
    userJourney: () => journeyCapture?.entries(options.userJourney.maxEvents) ?? [],
  };
  return engine;
}

/** Router URL (`/orders?x=1`) as absolute URL below the base href. */
function absoluteUrl(routerUrl: string, base: string): string {
  try {
    return new URL(routerUrl.replace(/^\//, ''), base).href;
  } catch {
    return routerUrl;
  }
}
