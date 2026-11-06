/*
 * Public API of `@lenne.tech/ng-base/bug/server` (Node only, import it in `server.ts`): the bug report endpoint
 * `ltBugReport()` that creates Linear issues from the reports of `@lenne.tech/ng-base/bug`, plus its building blocks.
 * Linear credentials live only here (`NG_LINEAR_API_KEY`, `NG_LINEAR_TEAM_NAME`, `NG_LINEAR_PROJECT_NAME`).
 */
export { createLtLinearIssue, isLtBugServerEnabled, LT_BUG_DEFAULT_MAX_BODY_BYTES, LT_BUG_SERVER_DEFAULT_ENDPOINT, LtBugConfigError, ltBugReport } from './lib/bug-report-handler';
export type { LtBugReportHandlerOptions } from './lib/bug-report-handler';
export { LT_BUG_LABELS, LT_LINEAR_API_URL, LtLinearClient, LtLinearError } from './lib/linear-client';
export type { LtLinearClientOptions, LtLinearIssue } from './lib/linear-client';
export { formatLtBugReportForLinear } from './lib/linear-format';
export {
  isLtBodyExcludedUrl,
  isLtSensitiveHeader,
  isLtSensitiveKey,
  LT_BUG_BODY_EXCLUDED_SEGMENTS,
  LT_BUG_REDACTED,
  LT_BUG_SENSITIVE_HEADERS,
  redactLtBody,
  redactLtHeaders,
  redactLtText,
  redactLtUrl,
} from './lib/redact';
export type { LtLinearFormatOptions, LtLinearIssueText } from './lib/linear-format';
export { LT_BUG_MISSING_FIELDS, LT_BUG_REPORT_LIMITS, LT_BUG_REPORT_TYPES, validateLtBugReport } from './lib/validate';
export type {
  LtBugReportValidation,
  LtBugServerBrowserInfo,
  LtBugServerConsoleLog,
  LtBugServerFile,
  LtBugServerInteraction,
  LtBugServerNetworkRequest,
  LtBugServerReport,
  LtBugServerReportType,
} from './lib/validate';
