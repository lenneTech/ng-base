/*
 * Public API of `@lenne.tech/ng-base/bug/provide`: the light half of the bug reporter for `app.config.ts` —
 * `provideLtBug()`, the options and the runtime decision. It never imports `@lenne.tech/ng-base/bug` statically: the
 * state service, the capture engine, the button and the dialog load only while the reporter is active, so a production
 * bundle carries none of them. `@lenne.tech/ng-base/bug` re-exports all of it.
 */
export { isLtBugActive, LT_BUG_ACTIVE, LT_BUG_DEV_MODE, LT_BUG_INPUT_OPTIONS } from './lib/bug-options';
export type {
  LtBrowserInfo,
  LtBugAttachment,
  LtBugErrorInfo,
  LtBugOptions,
  LtBugPosition,
  LtBugReportData,
  LtBugReportResponse,
  LtBugReportType,
  LtBugTheme,
  LtBugUserJourneyOptions,
  LtConsoleLogEntry,
  LtNetworkRequestEntry,
  LtResolvedBugOptions,
  LtUserInteractionEvent,
  LtUserInteractionMetadata,
  LtUserInteractionType,
} from './lib/bug-types';
export { provideLtBug } from './lib/provide-lt-bug';
