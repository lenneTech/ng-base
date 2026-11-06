/*
 * Public API of `@lenne.tech/ng-base/bug`: the bug reporter, the Angular counterpart of `@lenne.tech/bug.lt`.
 *
 * `provideLtBug()` and the options come from `@lenne.tech/ng-base/bug/provide` (re-exported here; import them from there
 * in `app.config.ts`). This entry holds the state service and the floating button `<lt-bug-report>`. The capture engine (console, network, user journey, errors, redaction) is loaded
 * only while the reporter is active, the report dialog (ui layer) and the texts on first use, so a production bundle
 * carries neither. The server part (Linear) is `@lenne.tech/ng-base/bug/server`, which also exports the redaction helpers.
 */
export * from '@lenne.tech/ng-base/bug/provide';
export { LT_BUG_DEFAULT_ENDPOINT, LT_BUG_DEFAULTS, LT_BUG_OPTIONS, resolveLtBugOptions } from './lib/bug-options';
export { LtBugReportService, LtBugSubmitError } from './lib/bug-report-service';
export { LT_BUG_UI_ATTRIBUTE } from './lib/constants';
export type { LtBugReportFormValue, LtBugReportIncludes } from './lib/report';
export { LT_BUG_SCREENSHOT_LOADER } from './lib/screenshot';
export type { LtScreenshotLibrary } from './lib/screenshot';
export { LtBugReport } from './lib/ui/bug-report';
