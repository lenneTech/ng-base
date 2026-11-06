import type {
  LtBrowserInfo,
  LtBugAttachment,
  LtBugErrorInfo,
  LtBugReportData,
  LtBugReportType,
  LtConsoleLogEntry,
  LtNetworkRequestEntry,
  LtUserInteractionEvent,
} from './bug-types';

/** Values of the report form. */
export interface LtBugReportFormValue {
  description: string;
  expectedBehavior: string;
  stepsToReproduce: string;
  title: string;
  type: LtBugReportType | null;
}

/** Which collected data the user chose to include. */
export interface LtBugReportIncludes {
  browserInfo: boolean;
  consoleLogs: boolean;
  networkRequests: boolean;
  userJourney: boolean;
}

/** Collected data; a missing source means the feature is disabled. */
export interface LtBugReportSources {
  browserInfo?: () => LtBrowserInfo;
  consoleLogs?: () => LtConsoleLogEntry[];
  networkRequests?: () => LtNetworkRequestEntry[];
  userInteractions?: () => LtUserInteractionEvent[];
}

/** An empty form. */
export function emptyLtBugReportForm(): LtBugReportFormValue {
  return { description: '', expectedBehavior: '', stepsToReproduce: '', title: '', type: null };
}

/**
 * Assemble the payload for the server endpoint: trimmed form values, attachments without their preview copy, and the
 * collected data the user kept switched on (only for enabled features, i.e. when a source exists).
 */
export function buildLtBugReport(form: LtBugReportFormValue, attachments: readonly LtBugAttachment[], includes: LtBugReportIncludes, sources: LtBugReportSources): LtBugReportData {
  const data: LtBugReportData = {
    description: form.description.trim(),
    title: form.title.trim(),
    type: form.type ?? 'bug',
  };
  const expected = form.expectedBehavior.trim();
  const steps = form.stepsToReproduce.trim();
  if (expected) {
    data.expectedBehavior = expected;
  }
  if (steps) {
    data.stepsToReproduce = steps;
  }
  if (attachments.length) {
    data.attachments = attachments.map(({ data: content, id, isScreenshot, name, size, type }) => ({
      data: content,
      id,
      name,
      size,
      type,
      ...(isScreenshot ? { isScreenshot } : {}),
    }));
  }
  if (includes.browserInfo && sources.browserInfo) {
    try {
      data.browserInfo = sources.browserInfo();
    } catch {
      // Not available (e.g. no navigator): send the report without it.
    }
  }
  if (includes.consoleLogs && sources.consoleLogs) {
    data.consoleLogs = sources.consoleLogs();
  }
  if (includes.networkRequests && sources.networkRequests) {
    data.networkRequests = sources.networkRequests();
  }
  if (includes.userJourney && sources.userInteractions) {
    data.userInteractions = sources.userInteractions();
  }
  return data;
}

/** Form pre-fill for a captured error (same text as `@lenne.tech/bug.lt`). */
export function ltBugPrefillFromError(error: LtBugErrorInfo): Pick<LtBugReportFormValue, 'description' | 'title' | 'type'> {
  return {
    description: `**Error Message:**\n${error.message}\n\n**Component:** ${error.componentName || 'Unknown'}\n\n**Stack Trace:**\n\`\`\`\n${error.stack || 'No stack trace available'}\n\`\`\``,
    title: error.message.slice(0, 100),
    type: 'bug',
  };
}

/** Decoded size in bytes of a base64 data URL. */
export function ltDataUrlSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Human readable file size (`0 Bytes`, `1.5 KB`, `2 MB`). */
export function formatLtBugFileSize(bytes: number): string {
  if (!bytes) {
    return '0 Bytes';
  }
  const units = ['Bytes', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${Math.round((bytes / 1024 ** index) * 100) / 100} ${units[index]}`;
}
