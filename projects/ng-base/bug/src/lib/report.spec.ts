import type { LtBrowserInfo } from './bug-types';
import { buildLtBugReport, emptyLtBugReportForm, formatLtBugFileSize, ltBugPrefillFromError, ltDataUrlSize } from './report';

const ALL = { browserInfo: true, consoleLogs: true, networkRequests: true, userJourney: true };

describe('report payload', () => {
  it('trims the form, drops empty optional fields and sends attachments without the preview copy', () => {
    const report = buildLtBugReport(
      { ...emptyLtBugReportForm(), description: '  Kaputt  ', expectedBehavior: '   ', title: ' Titel ', type: 'feature' },
      [{ data: 'data:image/png;base64,AAAA', id: 's', isScreenshot: true, name: 'screenshot.png', preview: 'data:image/png;base64,AAAA', size: 3, type: 'image/png' }],
      ALL,
      {},
    );
    expect(report).toEqual({
      attachments: [{ data: 'data:image/png;base64,AAAA', id: 's', isScreenshot: true, name: 'screenshot.png', size: 3, type: 'image/png' }],
      description: 'Kaputt',
      title: 'Titel',
      type: 'feature',
    });
    expect(report.screenshot).toBeUndefined();
  });

  it('includes collected data only for enabled features the user kept switched on', () => {
    const sources = {
      browserInfo: () => ({ url: 'https://app.test' }) as LtBrowserInfo,
      consoleLogs: () => [{ level: 'log' as const, message: ['x'], timestamp: 't' }],
      networkRequests: () => [],
      userInteractions: () => [{ target: 'button', timestamp: 't', type: 'click' as const }],
    };
    const form = { ...emptyLtBugReportForm(), description: 'd', title: 't', type: 'bug' as const };
    const report = buildLtBugReport(form, [], { browserInfo: true, consoleLogs: false, networkRequests: true, userJourney: true }, sources);
    expect(Object.keys(report).sort()).toEqual(['browserInfo', 'description', 'networkRequests', 'title', 'type', 'userInteractions']);
    const disabled = buildLtBugReport(form, [], ALL, { consoleLogs: sources.consoleLogs });
    expect(Object.keys(disabled).sort()).toEqual(['consoleLogs', 'description', 'title', 'type']);
    const failing = buildLtBugReport(form, [], ALL, {
      browserInfo: () => {
        throw new TypeError('no browser');
      },
    });
    expect(failing.browserInfo).toBeUndefined();
  });

  it('pre-fills the form from an error like bug.lt', () => {
    const prefill = ltBugPrefillFromError({ componentName: 'ErrorHandler', message: 'x'.repeat(150), stack: 'Error: x\n  at y', timestamp: 't' });
    expect(prefill.title).toHaveLength(100);
    expect(prefill.type).toBe('bug');
    expect(prefill.description).toContain('**Component:** ErrorHandler');
    expect(prefill.description).toContain('```\nError: x\n  at y\n```');
    expect(ltBugPrefillFromError({ message: 'm', timestamp: 't' }).description).toContain('No stack trace available');
  });

  it('computes data URL sizes and formats file sizes', () => {
    expect(ltDataUrlSize('data:text/plain;base64,aGVsbG8=')).toBe(5);
    expect(ltDataUrlSize(`data:image/png;base64,${btoa('abcdef')}`)).toBe(6);
    expect(formatLtBugFileSize(0)).toBe('0 Bytes');
    expect(formatLtBugFileSize(1536)).toBe('1.5 KB');
    expect(formatLtBugFileSize(10 * 1024 * 1024)).toBe('10 MB');
  });
});
