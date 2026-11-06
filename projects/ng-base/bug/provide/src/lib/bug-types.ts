/** Kind of report; mapped onto a Linear label (`bug`, `feature`, `enhancement`, `other`). */
export type LtBugReportType = 'bug' | 'enhancement' | 'feature' | 'other';

/** Corner of the floating report button. */
export type LtBugPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

/** Background of the screenshot: `auto` follows the app color mode (`html.dark`, `color-scheme`, system preference). */
export type LtBugTheme = 'auto' | 'dark' | 'light';

/** Browser, system and performance details attached to a report. URLs are redacted. */
export interface LtBrowserInfo {
  browser: { name: string; version?: string };
  cookieEnabled: boolean;
  language: string;
  languages: string[];
  onLine: boolean;
  os: { name: string; version: string };
  performance?: {
    domComplete: number;
    domContentLoaded: number;
    firstContentfulPaint: number | null;
    firstPaint: number | null;
    loadTime: number;
    navigationStart: number;
    responseEnd: number;
  };
  platform: string;
  referrer: string;
  screen: { colorDepth: number; height: number; pixelDepth: number; width: number };
  timestamp: string;
  timezone: string;
  title: string;
  url: string;
  userAgent: string;
  vendor: string;
  viewport: { height: number; width: number };
}

/** One captured console call (CSS `%c` styling removed, secrets redacted). */
export interface LtConsoleLogEntry {
  level: 'debug' | 'error' | 'info' | 'log' | 'warn';
  message: string[];
  stack?: string;
  timestamp: string;
}

/** One captured `fetch` / `XMLHttpRequest` call (sensitive headers and auth bodies are never recorded). */
export interface LtNetworkRequestEntry {
  duration?: number;
  error?: string;
  method: string;
  requestBody?: string;
  requestHeaders?: Record<string, string>;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  status: number;
  statusText: string;
  timestamp: string;
  type: 'fetch' | 'xhr';
  url: string;
}

/** Kind of a user journey event. */
export type LtUserInteractionType =
  | 'click'
  | 'error'
  | 'form_change'
  | 'form_submit'
  | 'hover'
  | 'input_change'
  | 'keyboard'
  | 'modal_close'
  | 'modal_open'
  | 'navigation'
  | 'scroll';

/** Details of a user journey event. */
export interface LtUserInteractionMetadata {
  [key: string]: unknown;
  classes?: string[];
  element?: string;
  errorMessage?: string;
  fromUrl?: string;
  id?: string;
  key?: string;
  scrollPosition?: number;
  tag?: string;
  text?: string;
  toUrl?: string;
  url?: string;
  value?: string;
}

/** One user journey event (click, navigation, form interaction, keyboard shortcut, error, dialog). */
export interface LtUserInteractionEvent {
  metadata?: LtUserInteractionMetadata;
  target: string;
  timestamp: string;
  type: LtUserInteractionType;
}

/** A captured error (Angular `ErrorHandler`, uncaught error, unhandled rejection or `reportError()`). */
export interface LtBugErrorInfo {
  /** Where the error came from (`ErrorHandler`, `window`, or the source passed to `reportError()`). */
  componentName?: string;
  message: string;
  stack?: string;
  timestamp: string;
  url?: string;
  userAgent?: string;
}

/** A file attached to a report (`data` is a base64 data URL). */
export interface LtBugAttachment {
  data: string;
  id: string;
  isScreenshot?: boolean;
  name: string;
  /** Data URL for the thumbnail (images only); never sent to the server. */
  preview?: string;
  size: number;
  type: string;
}

/** The report sent to the server endpoint (`POST /_bug-lt/report`). */
export interface LtBugReportData {
  attachments?: Omit<LtBugAttachment, 'preview'>[];
  browserInfo?: LtBrowserInfo;
  consoleLogs?: LtConsoleLogEntry[];
  description: string;
  expectedBehavior?: string;
  networkRequests?: LtNetworkRequestEntry[];
  /** Legacy single screenshot (data URL); the browser sends the screenshot as an attachment instead. */
  screenshot?: string;
  stepsToReproduce?: string;
  title: string;
  type: LtBugReportType;
  userInteractions?: LtUserInteractionEvent[];
}

/** Answer of the server endpoint. */
export interface LtBugReportResponse {
  error?: string;
  identifier?: string;
  issueId?: string;
  issueUrl?: string;
  message?: string;
  success: boolean;
}

/** User journey options (`provideLtBug({ userJourney })`). */
export interface LtBugUserJourneyOptions {
  /** Record clicks (default `true`). */
  captureClicks?: boolean;
  /** Record errors (default `true`). */
  captureErrors?: boolean;
  /** Record submit and change events of form fields (default `true`). */
  captureFormInteractions?: boolean;
  /** Record hovered elements, throttled (default `false`, noisy). */
  captureHover?: boolean;
  /** Record typing in text fields, throttled (default `false`; values only with `captureInputValues`). */
  captureInputChanges?: boolean;
  /**
   * Record the values of form fields (default `false`). Values of password fields, of fields with `autocomplete`
   * `current-password` / `new-password` / `one-time-code` / `cc-*` and of fields named like tokens, secrets, PINs or card
   * numbers are never recorded, not even with this option.
   */
  captureInputValues?: boolean;
  /** Record keyboard shortcuts (with Ctrl/Meta/Alt); typed text is never recorded (default `true`). */
  captureKeyboard?: boolean;
  /** Record dialogs that open and close (`role="dialog"`, `role="alertdialog"`, `<dialog open>`) (default `true`). */
  captureModalEvents?: boolean;
  /** Record navigation (`Router` events, `popstate` without a router) (default `true`). */
  captureNavigation?: boolean;
  /** Record the scroll position, throttled (default `false`, noisy). */
  captureScroll?: boolean;
  /** Record the user journey at all (default `true`). */
  enabled?: boolean;
  /** Ring buffer size (default `50`). */
  maxEvents?: number;
  /** Throttle interval of hover, scroll and input events in ms (default `100`). */
  throttleRate?: number;
}

/**
 * Options of `provideLtBug()`, the counterpart of the `bug` block of `@lenne.tech/bug.lt` in `nuxt.config.ts`.
 * Linear credentials are not part of it: they live on the server only (`ltBugReport()` from
 * `@lenne.tech/ng-base/bug/server`).
 */
export interface LtBugOptions {
  /** Open the dialog automatically when an error is captured (default `false`). */
  autoOpenOnError?: boolean;
  /** Render the floating button of `<lt-bug-report>` (default `true`); `false` keeps only programmatic opening. */
  autoShow?: boolean;
  /** Button background color (default `#dc2626`, white text on it meets WCAG AA). */
  buttonColor?: string;
  /** ng-icons name of the button icon (default the Lucide bug icon); register custom icons with `provideIcons()`. */
  buttonIcon?: string;
  /** Text next to the icon (default none: round icon button). */
  buttonText?: string;
  /** Capture browser, OS, viewport and performance details (default `true`). */
  enableBrowserInfo?: boolean;
  /** Capture console output (default `true`). */
  enableConsoleLogs?: boolean;
  /** Capture errors through the app's `ErrorHandler` and window error events (default `true`). */
  enableErrorBoundary?: boolean;
  /** Capture `fetch` and `XMLHttpRequest` calls (default `true`). */
  enableNetworkRequests?: boolean;
  /** Take a viewport screenshot before the dialog opens (default `true`; needs the optional peer `modern-screenshot`). */
  enableScreenshot?: boolean;
  /** Capture the user journey (default `true`; see {@link userJourney}). */
  enableUserJourney?: boolean;
  /**
   * Force the reporter on or off. Default: decided at runtime, on unless the app env (`NG_PUBLIC_APP_ENV`) is
   * `production`; without an app env only in dev mode (`isDevMode()`), so a production build fails closed.
   */
  enabled?: boolean;
  /** Server endpoint (default `/_bug-lt/report`, outside `/api` so an API proxy does not swallow it). */
  endpoint?: string;
  /** Console ring buffer size (default `50`). */
  maxConsoleLogs?: number;
  /** Network ring buffer size (default `50`). */
  maxNetworkRequests?: number;
  /** Button corner (default `bottom-right`). */
  position?: LtBugPosition;
  /** Screenshot background (default `auto`). */
  theme?: LtBugTheme;
  /** User journey options. */
  userJourney?: LtBugUserJourneyOptions;
}

/** {@link LtBugOptions} with every default applied. */
export interface LtResolvedBugOptions extends Required<Omit<LtBugOptions, 'buttonIcon' | 'buttonText' | 'enabled' | 'userJourney'>> {
  buttonIcon?: string;
  buttonText?: string;
  enabled?: boolean;
  userJourney: Required<LtBugUserJourneyOptions>;
}
