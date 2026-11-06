import type { LtBugServerReport } from './validate';

/** Options of {@link formatLtBugReportForLinear}. */
export interface LtLinearFormatOptions {
  /** Time zone of the journey times (default `Europe/Berlin`; the browser sends UTC timestamps). */
  timeZone?: string;
}

/** Title and Markdown description of the Linear issue. */
export interface LtLinearIssueText {
  description: string;
  title: string;
}

/**
 * Linear issue text of a report, in the layout of `@lenne.tech/bug.lt` (German headings): bug report, context table,
 * user journey table, technical details (last 10 console logs and network requests, failed requests with the start of
 * their response) and an attachments note. Table cells are escaped, so `|` or line breaks in data keep the tables intact.
 */
export function formatLtBugReportForLinear(report: LtBugServerReport, options: LtLinearFormatOptions = {}): LtLinearIssueText {
  const timeZone = options.timeZone ?? 'Europe/Berlin';
  const sections: string[] = [];

  const reportParts = [`**Beschreibung:**\n${report.description}`];
  if (report.expectedBehavior) {
    reportParts.push(`**Erwartetes Verhalten:**\n${report.expectedBehavior}`);
  }
  if (report.stepsToReproduce) {
    reportParts.push(`**Schritte zur Reproduktion:**\n${report.stepsToReproduce}`);
  }
  sections.push(`## Bug Report\n\n${reportParts.join('\n\n')}`);

  const info = report.browserInfo;
  if (info) {
    const browser = `${info.browser?.name || 'Unknown'} ${info.browser?.version || ''}`.trim();
    const os = `${info.os?.name || info.platform || 'Unknown'} ${info.os?.version || ''}`.trim();
    sections.push(
      [
        '---',
        '',
        '## Kontext',
        '',
        '| | |',
        '|---|---|',
        `| **URL** | ${cell(info.url ?? '')} |`,
        `| **Browser** | ${cell(browser)} |`,
        `| **OS** | ${cell(os)} |`,
        `| **Viewport** | ${info.viewport ? `${info.viewport.width}x${info.viewport.height}` : ''} |`,
        `| **Zeitpunkt** | ${cell(info.timestamp ?? '')} |`,
      ].join('\n'),
    );
  }

  if (report.userInteractions.length) {
    const rows = report.userInteractions.map(
      (event) => `| ${time(event.timestamp, timeZone)} | ${cell(eventType(event.type))} | ${cell(shorten(event.target, 40))} | ${cell(eventDetails(event))} |`,
    );
    sections.push(
      [
        '---',
        '',
        '## User Journey',
        '',
        `> Letzte ${report.userInteractions.length} Aktionen vor dem Bug`,
        '',
        '| Zeit | Aktion | Element | Details |',
        '|------|--------|---------|---------|',
        ...rows,
      ].join('\n'),
    );
  }

  const technical: string[] = [];
  if (report.consoleLogs.length) {
    const logs = report.consoleLogs.slice(-10);
    const lines = logs.map((log) => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message.join(' ')}`.replace(/```/g, '`​``'));
    technical.push(`### Console Logs (${logs.length})\n\n\`\`\`\n${lines.join('\n')}\n\`\`\``);
  }
  if (report.networkRequests.length) {
    const requests = report.networkRequests.slice(-10);
    const failed = requests.filter((request) => request.status >= 400 || request.status === 0);
    let content = [
      '| Method | URL | Status |',
      '|--------|-----|--------|',
      ...requests.map((request) => `| ${cell(request.method)} | ${cell(shorten(request.url, 60))} | ${request.status === 0 ? 'ERR' : request.status} |`),
    ].join('\n');
    if (failed.length) {
      const lines = failed.map((request) => {
        const reason = request.status === 0 ? request.error || request.statusText : `${request.status} ${request.statusText}`.trim();
        const body = request.responseBody ? `\n  \`${shorten(request.responseBody, 200).replace(/`/g, "'").replace(/\s+/g, ' ')}\`` : '';
        return `- ${request.method} ${request.url.slice(0, 60)} → ${reason}${body}`;
      });
      content += `\n\n**Fehlerhafte Requests:**\n${lines.join('\n')}`;
    }
    technical.push(`### Network Requests (${requests.length})\n\n${content}`);
  }
  if (technical.length) {
    sections.push(`---\n\n## Technische Details\n\n${technical.join('\n\n')}`);
  }

  const notes: string[] = [];
  if (report.attachments.length) {
    const screenshots = report.attachments.filter((file) => file.isScreenshot).length;
    const others = report.attachments.length - screenshots;
    notes.push(
      screenshots && others ? `*${screenshots} Screenshot(s) und ${others} weitere Anhänge*` : screenshots ? `*${screenshots} Screenshot(s) angehängt*` : `*${others} Anhänge*`,
    );
  }
  if (report.skippedAttachments) {
    notes.push(`*${report.skippedAttachments} Anhang/Anhänge nicht übernommen (zu groß oder zu viele)*`);
  }
  if (notes.length) {
    sections.push(`---\n\n${notes.join('\n\n')}`);
  }

  return { description: sections.join('\n\n'), title: `${report.type.toUpperCase()}: ${report.title}` };
}

/** Escape a Markdown table cell. */
function cell(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\s*[\r\n]+\s*/g, ' ');
}

function shorten(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function eventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function time(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  try {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone });
  } catch {
    return date.toISOString().slice(11, 19);
  }
}

function eventDetails(event: LtBugServerReport['userInteractions'][number]): string {
  const metadata = event.metadata;
  if (!metadata) {
    return '';
  }
  if (metadata.toUrl) {
    return `→ ${metadata.toUrl.slice(0, 50)}`;
  }
  if (metadata.text) {
    return metadata.text.slice(0, 40);
  }
  if (metadata.errorMessage) {
    return `Error: ${metadata.errorMessage.slice(0, 40)}`;
  }
  if (metadata.key) {
    return `Key: ${metadata.key}`;
  }
  return '';
}
