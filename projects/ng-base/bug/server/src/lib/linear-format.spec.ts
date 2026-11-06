/// <reference types="node" />
import { formatLtBugReportForLinear } from './linear-format';
import { validateLtBugReport, type LtBugServerReport } from './validate';

function report(body: Record<string, unknown>): LtBugServerReport {
  const result = validateLtBugReport({ description: 'Test description', title: 'Test Bug', type: 'bug', ...body });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.report;
}

describe('formatLtBugReportForLinear', () => {
  it('formats a report with all sections (as bug.lt)', () => {
    const { description, title } = formatLtBugReportForLinear(
      report({
        attachments: [{ data: `data:image/png;base64,${Buffer.from('x').toString('base64')}`, isScreenshot: true, name: 's.png', type: 'image/png' }],
        browserInfo: {
          browser: { name: 'Chrome', version: '120' },
          os: { name: 'macOS', version: '14' },
          timestamp: '2024-01-01T00:00:00.000Z',
          url: 'https://app.test/page',
          viewport: { height: 800, width: 1200 },
        },
        consoleLogs: [{ level: 'error', message: ['Test error'], timestamp: '2024-01-01T00:00:00.000Z' }],
        expectedBehavior: 'Should work',
        networkRequests: [
          { method: 'GET', status: 200, statusText: 'OK', timestamp: 't', url: '/api/ok' },
          { method: 'POST', responseBody: '{"message":"Validation failed"}', status: 422, statusText: 'Unprocessable', timestamp: 't', url: '/api/fail' },
        ],
        stepsToReproduce: '1. Open\n2. Click',
        userInteractions: [{ metadata: { text: 'Speichern' }, target: 'button#save', timestamp: '2024-01-01T10:00:00.000Z', type: 'form_submit' }],
      }),
      { timeZone: 'UTC' },
    );
    expect(title).toBe('BUG: Test Bug');
    expect(description).toContain('## Bug Report');
    expect(description).toContain('**Beschreibung:**\nTest description');
    expect(description).toContain('**Erwartetes Verhalten:**\nShould work');
    expect(description).toContain('**Schritte zur Reproduktion:**\n1. Open\n2. Click');
    expect(description).toContain('## Kontext');
    expect(description).toContain('| **Browser** | Chrome 120 |');
    expect(description).toContain('| **Viewport** | 1200x800 |');
    expect(description).toContain('## User Journey');
    expect(description).toContain('| 10:00:00 | Form Submit | button#save | Speichern |');
    expect(description).toContain('### Console Logs (1)');
    expect(description).toContain('[2024-01-01T00:00:00.000Z] ERROR: Test error');
    expect(description).toContain('### Network Requests (2)');
    expect(description).toContain('**Fehlerhafte Requests:**\n- POST /api/fail → 422 Unprocessable');
    expect(description).toContain('Validation failed');
    expect(description).toContain('*1 Screenshot(s) angehängt*');
  });

  it('handles a minimal report', () => {
    const { description } = formatLtBugReportForLinear(report({}));
    expect(description).toBe('## Bug Report\n\n**Beschreibung:**\nTest description');
  });

  it('does not throw for network requests without url or interactions without target', () => {
    const { description } = formatLtBugReportForLinear(report({ networkRequests: [{ method: 'GET', status: 0 }], userInteractions: [{ timestamp: 't', type: 'click' }] }));
    expect(description).toContain('| GET |  | ERR |');
    expect(description).toContain('## User Journey');
  });

  it('escapes table cells so | and line breaks keep the tables intact', () => {
    const { description } = formatLtBugReportForLinear(
      report({ browserInfo: { url: 'https://app.test/a|b' }, userInteractions: [{ target: 'div\n|x', timestamp: 't', type: 'click' }] }),
    );
    expect(description).toContain('| **URL** | https://app.test/a\\|b |');
    expect(description).toContain('div \\|x');
  });

  it('names screenshots and other attachments in the attachments note', () => {
    const file = (name: string, isScreenshot = false) => ({ data: `data:text/plain;base64,${Buffer.from(name).toString('base64')}`, isScreenshot, name, type: 'text/plain' });
    expect(formatLtBugReportForLinear(report({ attachments: [file('a', true), file('b')] })).description).toContain('*1 Screenshot(s) und 1 weitere Anhänge*');
    expect(formatLtBugReportForLinear(report({ attachments: [file('b')] })).description).toContain('*1 Anhänge*');
  });
});
