/// <reference types="node" />
import { LT_BUG_REPORT_LIMITS, validateLtBugReport } from './validate';

const BASE = { description: 'd', title: 't', type: 'feature' };

describe('validateLtBugReport', () => {
  it('accepts a minimal report and trims the texts', () => {
    const result = validateLtBugReport({ description: '  d  ', title: '  t \n x ', type: 'other' });
    expect(result).toEqual({
      ok: true,
      report: {
        attachments: [],
        browserInfo: undefined,
        consoleLogs: [],
        description: 'd',
        expectedBehavior: undefined,
        networkRequests: [],
        skippedAttachments: 0,
        stepsToReproduce: undefined,
        title: 't x',
        type: 'other',
        userInteractions: [],
      },
    });
  });

  it('rejects non-objects, unknown types and wrongly typed fields', () => {
    expect(validateLtBugReport(null)).toEqual({ error: 'The bug report must be a JSON object', ok: false });
    expect(validateLtBugReport({ ...BASE, type: 'question' }).ok).toBe(false);
    expect(validateLtBugReport({ ...BASE, expectedBehavior: 5 }).ok).toBe(false);
    expect(validateLtBugReport({ ...BASE, attachments: {} }).ok).toBe(false);
    expect(validateLtBugReport({ ...BASE, browserInfo: 'x' }).ok).toBe(false);
    expect(validateLtBugReport({ ...BASE, screenshot: 'data:text/plain;base64,eA==' }).ok).toBe(false);
    expect(validateLtBugReport({ ...BASE, attachments: [{ data: 'data:image/png;base64,not base64!', name: 'x' }] }).ok).toBe(false);
  });

  it('caps lists to their newest entries and texts to their limits', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ message: [`m${index}`], method: 'GET', status: 200, target: `t${index}`, timestamp: 't', type: 'click', url: `/u${index}` }));
    const result = validateLtBugReport({ ...BASE, consoleLogs: many(120), description: 'x'.repeat(30_000), networkRequests: many(120), userInteractions: many(250) });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.report.consoleLogs).toHaveLength(LT_BUG_REPORT_LIMITS.consoleLogs);
    expect(result.report.consoleLogs[0]?.message).toEqual(['m20']);
    expect(result.report.networkRequests).toHaveLength(LT_BUG_REPORT_LIMITS.networkRequests);
    expect(result.report.userInteractions).toHaveLength(LT_BUG_REPORT_LIMITS.userInteractions);
    expect(result.report.description.startsWith('x'.repeat(LT_BUG_REPORT_LIMITS.description))).toBe(true);
    expect(result.report.description).toContain('[truncated');
  });

  it('decodes files, keeps at most 10 and drops request bodies of auth endpoints', () => {
    const file = { data: `data:application/pdf;base64,${Buffer.from('pdf').toString('base64')}`, name: 'C:\\temp\\report.pdf' };
    const result = validateLtBugReport({
      ...BASE,
      attachments: Array.from({ length: 12 }, () => file),
      networkRequests: [{ responseBody: '{"x":1}', status: 500, url: '/iam/get-session' }],
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.report.attachments).toHaveLength(10);
    expect(result.report.attachments[0]).toMatchObject({ contentType: 'application/pdf', isScreenshot: false, name: 'report.pdf' });
    expect(result.report.attachments[0]?.data.toString()).toBe('pdf');
    expect(result.report.skippedAttachments).toBe(2);
    expect(result.report.networkRequests[0]?.responseBody).toBeUndefined();
  });
});
