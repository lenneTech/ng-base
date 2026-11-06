/// <reference types="node" />
import { isLtBodyExcludedUrl, redactLtBody, redactLtText, redactLtUrl, truncateLt } from './redact';

/** Report types (mapped onto Linear labels). */
export const LT_BUG_REPORT_TYPES = ['bug', 'feature', 'enhancement', 'other'] as const;

/** Kind of report. */
export type LtBugServerReportType = (typeof LT_BUG_REPORT_TYPES)[number];

/** Size limits applied to an incoming report (texts are cut, lists keep their newest entries). */
export const LT_BUG_REPORT_LIMITS = Object.freeze({
  /** Attachments per report (including the screenshot). */
  attachments: 10,
  /** Characters of one attachment / screenshot data URL (about 11 MB decoded). */
  attachmentDataUrl: 15_000_000,
  consoleLogs: 100,
  description: 20_000,
  networkRequests: 100,
  text: 10_000,
  title: 255,
  userInteractions: 200,
});

/** A decoded file of a report. */
export interface LtBugServerFile {
  contentType: string;
  data: Buffer;
  isScreenshot: boolean;
  name: string;
}

/** Console entry after validation. */
export interface LtBugServerConsoleLog {
  level: string;
  message: string[];
  stack?: string;
  timestamp: string;
}

/** Network entry after validation (headers and request bodies are dropped). */
export interface LtBugServerNetworkRequest {
  error?: string;
  method: string;
  responseBody?: string;
  status: number;
  statusText: string;
  timestamp: string;
  url: string;
}

/** User journey entry after validation. */
export interface LtBugServerInteraction {
  metadata?: { errorMessage?: string; key?: string; text?: string; toUrl?: string; url?: string; value?: string };
  target: string;
  timestamp: string;
  type: string;
}

/** Browser details after validation. */
export interface LtBugServerBrowserInfo {
  browser?: { name?: string; version?: string };
  language?: string;
  os?: { name?: string; version?: string };
  platform?: string;
  timestamp?: string;
  url?: string;
  userAgent?: string;
  viewport?: { height: number; width: number };
}

/** A validated, size-capped and redacted report. */
export interface LtBugServerReport {
  attachments: LtBugServerFile[];
  browserInfo?: LtBugServerBrowserInfo;
  consoleLogs: LtBugServerConsoleLog[];
  description: string;
  expectedBehavior?: string;
  networkRequests: LtBugServerNetworkRequest[];
  /** Attachments dropped because they exceeded the limits. */
  skippedAttachments: number;
  stepsToReproduce?: string;
  title: string;
  type: LtBugServerReportType;
  userInteractions: LtBugServerInteraction[];
}

/** Result of {@link validateLtBugReport}. */
export type LtBugReportValidation = { error: string; ok: false } | { ok: true; report: LtBugServerReport };

/** Message for a report without title, type or description (same text as `@lenne.tech/bug.lt`). */
export const LT_BUG_MISSING_FIELDS = 'Missing required fields: title, type, and description are required';

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+)?((?:;[\w.+-]+=[^;,]*)*);base64,/i;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const MIME = /^[\w.+-]+\/[\w.+-]+$/;

/**
 * Validate an incoming report by hand: title, type and description are required strings, `type` one of
 * {@link LT_BUG_REPORT_TYPES}; files must be base64 `data:` URLs (never fetched: no URL is ever requested by the server).
 * Texts are cut, lists keep their newest entries, files above the limit are dropped and counted, everything is redacted.
 */
export function validateLtBugReport(body: unknown): LtBugReportValidation {
  if (!isRecord(body)) {
    return invalid('The bug report must be a JSON object');
  }
  const title = typeof body['title'] === 'string' ? body['title'].trim() : '';
  const description = typeof body['description'] === 'string' ? body['description'].trim() : '';
  const type = body['type'];
  if (!title || !description || typeof type !== 'string' || !type) {
    return invalid(LT_BUG_MISSING_FIELDS);
  }
  if (!(LT_BUG_REPORT_TYPES as readonly string[]).includes(type)) {
    return invalid(`type must be one of ${LT_BUG_REPORT_TYPES.join(', ')}`);
  }
  for (const key of ['expectedBehavior', 'stepsToReproduce', 'screenshot']) {
    if (body[key] !== undefined && body[key] !== null && typeof body[key] !== 'string') {
      return invalid(`${key} must be a string`);
    }
  }
  for (const key of ['attachments', 'consoleLogs', 'networkRequests', 'userInteractions']) {
    if (body[key] !== undefined && body[key] !== null && !Array.isArray(body[key])) {
      return invalid(`${key} must be an array`);
    }
  }
  if (body['browserInfo'] !== undefined && body['browserInfo'] !== null && !isRecord(body['browserInfo'])) {
    return invalid('browserInfo must be an object');
  }

  const files: LtBugServerFile[] = [];
  let skippedAttachments = 0;
  const rawAttachments = (body['attachments'] as unknown[] | undefined) ?? [];
  for (const [index, raw] of rawAttachments.entries()) {
    if (!isRecord(raw) || typeof raw['data'] !== 'string') {
      return invalid(`attachments[${index}] needs a data URL`);
    }
    const file = decodeDataUrl(raw['data'], typeof raw['type'] === 'string' ? raw['type'] : undefined);
    if (file === 'invalid') {
      return invalid(`attachments[${index}] is not a base64 data URL`);
    }
    if (file === 'too-large' || files.length >= LT_BUG_REPORT_LIMITS.attachments || file.data.length === 0) {
      skippedAttachments++;
      continue;
    }
    files.push({ ...file, isScreenshot: raw['isScreenshot'] === true, name: fileName(raw['name'], index) });
  }
  const screenshot = typeof body['screenshot'] === 'string' && body['screenshot'] ? body['screenshot'] : undefined;
  if (screenshot && !files.some((file) => file.isScreenshot)) {
    const file = decodeDataUrl(screenshot, undefined);
    if (file === 'invalid' || (file !== 'too-large' && !file.contentType.startsWith('image/'))) {
      return invalid('screenshot is not a base64 image data URL');
    }
    if (file === 'too-large' || files.length >= LT_BUG_REPORT_LIMITS.attachments) {
      skippedAttachments++;
    } else {
      files.push({ ...file, isScreenshot: true, name: `screenshot-${Date.now()}.png` });
    }
  }

  return {
    ok: true,
    report: {
      attachments: files,
      browserInfo: browserInfo(body['browserInfo']),
      consoleLogs: newest(body['consoleLogs'], LT_BUG_REPORT_LIMITS.consoleLogs).flatMap(consoleLog),
      description: cleanText(description, LT_BUG_REPORT_LIMITS.description),
      expectedBehavior: optionalText(body['expectedBehavior']),
      networkRequests: newest(body['networkRequests'], LT_BUG_REPORT_LIMITS.networkRequests).flatMap(networkRequest),
      skippedAttachments,
      stepsToReproduce: optionalText(body['stepsToReproduce']),
      title: cleanText(title, LT_BUG_REPORT_LIMITS.title).replace(/\s+/g, ' '),
      type: type as LtBugServerReportType,
      userInteractions: newest(body['userInteractions'], LT_BUG_REPORT_LIMITS.userInteractions).flatMap(interaction),
    },
  };
}

function invalid(error: string): LtBugReportValidation {
  return { error, ok: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function newest(value: unknown, limit: number): unknown[] {
  return Array.isArray(value) ? value.slice(-limit) : [];
}

function cleanText(text: string, max: number): string {
  return truncateLt(redactLtText(text.length > max * 2 ? text.slice(0, max * 2) : text), max);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? cleanText(value.trim(), LT_BUG_REPORT_LIMITS.text) : undefined;
}

function str(value: unknown, max: number): string | undefined {
  return typeof value === 'string' ? cleanText(value, max) : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Decode a base64 data URL; never fetches anything. */
function decodeDataUrl(dataUrl: string, declaredType: string | undefined): Omit<LtBugServerFile, 'isScreenshot' | 'name'> | 'invalid' | 'too-large' {
  const header = DATA_URL.exec(dataUrl.slice(0, 300));
  if (!header) {
    return 'invalid';
  }
  if (dataUrl.length > LT_BUG_REPORT_LIMITS.attachmentDataUrl) {
    return 'too-large';
  }
  const payload = dataUrl.slice(header[0].length);
  if (!BASE64.test(payload)) {
    return 'invalid';
  }
  const fromUrl = header[1]?.toLowerCase();
  const contentType = declaredType && MIME.test(declaredType) ? declaredType.toLowerCase() : fromUrl && MIME.test(fromUrl) ? fromUrl : 'application/octet-stream';
  return { contentType, data: Buffer.from(payload, 'base64') };
}

/** File name without path parts and control characters. */
function fileName(value: unknown, index: number): string {
  const raw = typeof value === 'string' ? value : '';
  const base = raw.split(/[/\\]/).pop() ?? '';
  const name = Array.from(base)
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join('')
    .trim();
  return (name || `attachment-${index + 1}`).slice(0, 200);
}

function browserInfo(value: unknown): LtBugServerBrowserInfo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const pair = (source: unknown) => (isRecord(source) ? { name: str(source['name'], 100), version: str(source['version'], 100) } : undefined);
  const viewport = isRecord(value['viewport']) ? { height: num(value['viewport']['height']) ?? 0, width: num(value['viewport']['width']) ?? 0 } : undefined;
  return {
    browser: pair(value['browser']),
    language: str(value['language'], 50),
    os: pair(value['os']),
    platform: str(value['platform'], 100),
    timestamp: str(value['timestamp'], 50),
    url: typeof value['url'] === 'string' ? truncateLt(redactLtUrl(value['url'].slice(0, 4000)), 2000) : undefined,
    userAgent: str(value['userAgent'], 500),
    viewport,
  };
}

function consoleLog(value: unknown): LtBugServerConsoleLog[] {
  if (!isRecord(value)) {
    return [];
  }
  const parts = Array.isArray(value['message']) ? value['message'] : [value['message']];
  return [
    {
      level: ['debug', 'error', 'info', 'log', 'warn'].includes(String(value['level'])) ? String(value['level']) : 'log',
      message: parts
        .slice(0, 20)
        .map((part) => str(typeof part === 'string' ? part : String(part ?? ''), 2000) ?? '')
        .filter(Boolean),
      stack: str(value['stack'], 5000),
      timestamp: str(value['timestamp'], 50) ?? '',
    },
  ];
}

function networkRequest(value: unknown): LtBugServerNetworkRequest[] {
  if (!isRecord(value)) {
    return [];
  }
  const url = typeof value['url'] === 'string' ? value['url'].slice(0, 4000) : '';
  const responseBody = typeof value['responseBody'] === 'string' && !isLtBodyExcludedUrl(url) ? redactLtBody(value['responseBody'], 1000) : undefined;
  return [
    {
      error: str(value['error'], 500),
      method: (str(value['method'], 16) ?? 'GET').toUpperCase(),
      responseBody,
      status: num(value['status']) ?? 0,
      statusText: str(value['statusText'], 200) ?? '',
      timestamp: str(value['timestamp'], 50) ?? '',
      url: truncateLt(redactLtUrl(url), 2000),
    },
  ];
}

function interaction(value: unknown): LtBugServerInteraction[] {
  if (!isRecord(value)) {
    return [];
  }
  const metadata = isRecord(value['metadata']) ? value['metadata'] : undefined;
  return [
    {
      metadata: metadata
        ? {
            errorMessage: str(metadata['errorMessage'], 500),
            key: str(metadata['key'], 50),
            text: str(metadata['text'], 500),
            toUrl: str(metadata['toUrl'], 2000),
            url: str(metadata['url'], 2000),
            value: str(metadata['value'], 500),
          }
        : undefined,
      target: str(value['target'], 200) ?? '',
      timestamp: str(value['timestamp'], 50) ?? '',
      type: str(value['type'], 50) ?? 'click',
    },
  ];
}
