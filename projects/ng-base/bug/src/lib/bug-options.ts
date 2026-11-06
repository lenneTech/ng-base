import { inject, InjectionToken } from '@angular/core';
import { LT_RUNTIME_CONFIG, mergeLtFeatureOptions } from '@lenne.tech/ng-base';
import { LT_BUG_INPUT_OPTIONS, type LtBugOptions, type LtResolvedBugOptions } from '@lenne.tech/ng-base/bug/provide';

/** The runtime decision lives in `@lenne.tech/ng-base/bug/provide` (light entry for `app.config.ts` and the shell). */
export { isLtBugActive, LT_BUG_ACTIVE, LT_BUG_DEV_MODE, LT_BUG_INPUT_OPTIONS } from '@lenne.tech/ng-base/bug/provide';

/** Default endpoint, the same as `@lenne.tech/bug.lt` (outside `/api`, so an API proxy does not swallow it). */
export const LT_BUG_DEFAULT_ENDPOINT = '/_bug-lt/report';

/** Defaults of {@link LtBugOptions} (the module defaults of `@lenne.tech/bug.lt` 1.6.9, except the button color). */
export const LT_BUG_DEFAULTS: LtResolvedBugOptions = {
  autoOpenOnError: false,
  autoShow: true,
  // bug.lt: #ef4444; white text on it has 3.8:1 contrast (WCAG AA needs 4.5:1), red-600 has 4.8:1.
  buttonColor: '#dc2626',
  enableBrowserInfo: true,
  enableConsoleLogs: true,
  enableErrorBoundary: true,
  enableNetworkRequests: true,
  enableScreenshot: true,
  enableUserJourney: true,
  endpoint: LT_BUG_DEFAULT_ENDPOINT,
  maxConsoleLogs: 50,
  maxNetworkRequests: 50,
  position: 'bottom-right',
  theme: 'auto',
  userJourney: {
    captureClicks: true,
    captureErrors: true,
    captureFormInteractions: true,
    captureHover: false,
    captureInputChanges: false,
    captureInputValues: false,
    captureKeyboard: true,
    captureModalEvents: true,
    captureNavigation: true,
    captureScroll: false,
    enabled: true,
    maxEvents: 50,
    throttleRate: 100,
  },
};

/** Resolved options: defaults ← `provideLtBug(options)` ← runtime `lt.bug` (`LT_RUNTIME_CONFIG`). */
export const LT_BUG_OPTIONS = new InjectionToken<LtResolvedBugOptions>('LT_BUG_OPTIONS', {
  factory: () => resolveLtBugOptions(inject(LT_BUG_INPUT_OPTIONS) ?? {}, inject(LT_RUNTIME_CONFIG, { optional: true })?.lt?.['bug']),
});

/** Merge options onto the defaults; `userJourney` is merged per key, `undefined` never overrides, sizes are clamped. */
export function resolveLtBugOptions(...overrides: (LtBugOptions | Record<string, unknown> | null | undefined)[]): LtResolvedBugOptions {
  const merged = mergeLtFeatureOptions<LtResolvedBugOptions>(LT_BUG_DEFAULTS, ...overrides);
  return {
    ...merged,
    endpoint: typeof merged.endpoint === 'string' && merged.endpoint.startsWith('/') ? merged.endpoint : LT_BUG_DEFAULT_ENDPOINT,
    maxConsoleLogs: clampSize(merged.maxConsoleLogs, LT_BUG_DEFAULTS.maxConsoleLogs),
    maxNetworkRequests: clampSize(merged.maxNetworkRequests, LT_BUG_DEFAULTS.maxNetworkRequests),
    userJourney: {
      ...merged.userJourney,
      maxEvents: clampSize(merged.userJourney.maxEvents, LT_BUG_DEFAULTS.userJourney.maxEvents),
      throttleRate: Math.max(0, Number(merged.userJourney.throttleRate) || 0),
    },
  };
}

/** Ring buffer sizes are whole numbers between 1 and 1000. */
function clampSize(value: unknown, fallback: number): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(number, 1000) : fallback;
}
