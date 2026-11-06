/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { LtEnv, LtNodeMiddleware } from '@lenne.tech/ng-base/server';

import { LT_BUG_LABELS, LtLinearClient } from './linear-client';
import { formatLtBugReportForLinear } from './linear-format';
import { LT_BUG_REDACTED, redactLtText } from './redact';
import { validateLtBugReport, type LtBugServerReport } from './validate';

/** Default endpoint (the same as `@lenne.tech/bug.lt` and `provideLtBug()`). */
export const LT_BUG_SERVER_DEFAULT_ENDPOINT = '/_bug-lt/report';

/** Default request body limit (30 MB: one 10 MB file plus screenshot fit, base64 included). */
export const LT_BUG_DEFAULT_MAX_BODY_BYTES = 30 * 1024 * 1024;

const PREFIX = '[@lenne.tech/ng-base/bug/server]';

/** Options of {@link ltBugReport}. */
export interface LtBugReportHandlerOptions {
  /**
   * Force the endpoint on or off (env `NG_PUBLIC_LT_BUG_ENABLED` wins). Default: on when `NG_PUBLIC_APP_ENV` is set and
   * not `production`; without `NG_PUBLIC_APP_ENV` it stays off (fail closed). Off answers `404`.
   */
  enabled?: boolean;
  /** Route (default `/_bug-lt/report`); must match `provideLtBug({ endpoint })`. */
  endpoint?: string;
  /** Environment (default `process.env`). */
  env?: LtEnv;
  /** `fetch` used for Linear (default the global `fetch`; for tests or an outbound proxy). */
  fetch?: typeof fetch;
  /** Linear API key; env `NG_LINEAR_API_KEY` wins. Server only, never sent to the browser. */
  linearApiKey?: string;
  /** Linear project name (optional); env `NG_LINEAR_PROJECT_NAME` wins. */
  linearProjectName?: string;
  /** Linear team name or key; env `NG_LINEAR_TEAM_NAME` wins. */
  linearTeamName?: string;
  /** Logger for server-side diagnostics (default `console`); messages are redacted and never contain the API key. */
  logger?: Pick<Console, 'error' | 'warn'>;
  /** Request body limit in bytes (default {@link LT_BUG_DEFAULT_MAX_BODY_BYTES}); larger bodies get `413`. */
  maxBodyBytes?: number;
  /** Reports per client address and window (default 20 per 10 minutes); `false` turns the limit off. */
  rateLimit?: false | { max: number; windowMs: number };
  /** Time zone of the times in the issue (default `Europe/Berlin`). */
  timeZone?: string;
}

/** Linear settings of one request. */
interface LinearConfig {
  apiKey: string;
  projectName?: string;
  teamName: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Whether the bug report endpoint is on, in this order:
 *
 * 1. `NG_PUBLIC_LT_BUG_ENABLED` (`true`/`false`), the same switch the browser part reads, so one variable turns the
 *    reporter on or off per stage on both sides.
 * 2. The `enabled` option.
 * 3. On when `NG_PUBLIC_APP_ENV` is set and neither `production` nor `prod`; without `NG_PUBLIC_APP_ENV` it is off
 *    (fail closed, also locally: set e.g. `local`).
 */
export function isLtBugServerEnabled(enabled: boolean | undefined, env: LtEnv): boolean {
  const switchValue = env['NG_PUBLIC_LT_BUG_ENABLED']?.trim() ?? '';
  if (/^(true|1|yes|on)$/i.test(switchValue)) {
    return true;
  }
  if (/^(false|0|no|off)$/i.test(switchValue)) {
    return false;
  }
  if (typeof enabled === 'boolean') {
    return enabled;
  }
  const appEnv = env['NG_PUBLIC_APP_ENV']?.trim().toLowerCase();
  return !!appEnv && appEnv !== 'production' && appEnv !== 'prod';
}

/**
 * `POST /_bug-lt/report`: validates a report of `provideLtBug()` / `<lt-bug-report>` and creates a Linear issue (team
 * and optional project resolved by name, label per type found or created, screenshot and attachments uploaded and
 * linked), the counterpart of the Nitro handler of `@lenne.tech/bug.lt`.
 *
 * - Credentials only here: `NG_LINEAR_API_KEY`, `NG_LINEAR_TEAM_NAME`, `NG_LINEAR_PROJECT_NAME` (or the options).
 * - Off (`404`) when `NG_PUBLIC_APP_ENV` is `production` or missing, unless `NG_PUBLIC_LT_BUG_ENABLED` or `enabled` turn it on.
 * - JSON only (`415` otherwise, which also blocks simple cross-site form posts), body limit (`413`), per-client rate
 *   limit (`429`), hand-written validation (`400`), files only as base64 data URLs (no URL is ever fetched).
 * - Redacts tokens, passwords and auth bodies once more before writing to Linear; answers never contain the API key or
 *   Linear's error messages (`502` with a generic text, details only in the server log).
 *
 * Register it before `express.json()` (which would reject large reports with its 100 kB default) and before the Angular
 * handler.
 *
 * @example server.ts
 * app.use(ltBugReport());
 */
export function ltBugReport(options: LtBugReportHandlerOptions = {}): LtNodeMiddleware {
  const endpoint = options.endpoint ?? LT_BUG_SERVER_DEFAULT_ENDPOINT;
  const limiter = createRateLimiter(options.rateLimit === undefined ? { max: 20, windowMs: 10 * 60 * 1000 } : options.rateLimit);
  const logger = options.logger ?? console;
  return (req, res, next) => {
    if ((req.url ?? '').split('?')[0] !== endpoint) {
      next();
      return;
    }
    const env = options.env ?? processEnv();
    if (!isLtBugServerEnabled(options.enabled, env)) {
      sendJson(res, 404, { error: 'Not Found', success: false });
      return;
    }
    handle(req, res, env, options, limiter).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500;
      if (!(error instanceof HttpError)) {
        logger.error(`${PREFIX} Unexpected error:`, sanitize(error, linearConfig(env, options)?.apiKey));
      }
      if (!res.headersSent) {
        sendJson(res, status, { error: error instanceof HttpError ? error.message : 'Internal server error while processing bug report', success: false });
      }
    });
  };
}

async function handle(req: IncomingMessage, res: ServerResponse, env: LtEnv, options: LtBugReportHandlerOptions, limiter: RateLimiter): Promise<void> {
  const logger = options.logger ?? console;
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    throw new HttpError(405, 'Method Not Allowed');
  }
  if (!/^application\/json\b/i.test(headerValue(req.headers['content-type']) ?? '')) {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  const retryAfter = limiter(clientKey(req));
  if (retryAfter > 0) {
    res.setHeader('retry-after', String(Math.ceil(retryAfter / 1000)));
    throw new HttpError(429, 'Too many bug reports, please try again later');
  }
  const config = linearConfig(env, options);
  if (!config) {
    const missing = [
      !pick(env, 'NG_LINEAR_API_KEY', options.linearApiKey) && 'NG_LINEAR_API_KEY',
      !pick(env, 'NG_LINEAR_TEAM_NAME', options.linearTeamName) && 'NG_LINEAR_TEAM_NAME',
    ].filter(Boolean);
    logger.error(`${PREFIX} Linear is not configured: set ${missing.join(' and ')} on the server.`);
    throw new HttpError(500, 'Bug reporting is not configured on the server');
  }

  const body = await readJsonBody(req, options.maxBodyBytes ?? LT_BUG_DEFAULT_MAX_BODY_BYTES);
  const validation = validateLtBugReport(body);
  if (!validation.ok) {
    throw new HttpError(400, validation.error);
  }

  let result: { identifier?: string; issueId: string; issueUrl?: string };
  try {
    result = await createLtLinearIssue(validation.report, config, { fetch: options.fetch, logger, timeZone: options.timeZone });
  } catch (error) {
    if (error instanceof LtBugConfigError) {
      logger.error(`${PREFIX} ${sanitize(error, config.apiKey)}`);
      throw new HttpError(500, 'Bug reporting is not configured on the server');
    }
    logger.error(`${PREFIX} Linear rejected the bug report:`, sanitize(error, config.apiKey));
    throw new HttpError(502, 'Linear rejected the bug report');
  }
  sendJson(res, 200, { identifier: result.identifier, issueId: result.issueId, issueUrl: result.issueUrl, message: 'Bug report submitted successfully', success: true });
}

/** Team or project setup does not match the Linear workspace. */
export class LtBugConfigError extends Error {}

/**
 * Create the Linear issue of a validated report: resolve the team (required) and project (optional), find or create
 * the type label, create the issue, then upload and link every file (failures are logged and skipped).
 */
export async function createLtLinearIssue(
  report: LtBugServerReport,
  config: LinearConfig,
  options: { fetch?: typeof fetch; logger?: Pick<Console, 'error' | 'warn'>; timeZone?: string } = {},
): Promise<{ identifier?: string; issueId: string; issueUrl?: string }> {
  const logger = options.logger ?? console;
  const client = new LtLinearClient({ apiKey: config.apiKey, fetch: options.fetch });

  const team = await client.findTeam(config.teamName);
  if (!team) {
    const available = (await client.getTeams().catch(() => [])).map((candidate) => candidate.name).join(', ');
    throw new LtBugConfigError(`Linear team "${config.teamName}" not found (NG_LINEAR_TEAM_NAME). Available teams: ${available || 'none'}`);
  }

  let projectId: string | undefined;
  if (config.projectName) {
    try {
      projectId = (await client.findProject(config.projectName))?.id;
      if (!projectId) {
        logger.warn(`${PREFIX} Linear project "${config.projectName}" not found (NG_LINEAR_PROJECT_NAME); creating the issue without project.`);
      }
    } catch (error) {
      logger.warn(`${PREFIX} Could not resolve the Linear project, continuing without:`, sanitize(error, config.apiKey));
    }
  }

  let labelId: string | null = null;
  const label = LT_BUG_LABELS[report.type];
  if (label) {
    try {
      labelId = (await client.findLabel(team.id, label.name)) ?? (await client.createLabel(team.id, label.name, label.color));
    } catch (error) {
      logger.warn(`${PREFIX} Could not find or create the label "${label.name}", continuing without:`, sanitize(error, config.apiKey));
    }
  }

  const text = formatLtBugReportForLinear(report, { timeZone: options.timeZone });
  const issue = await client.createIssue({ ...text, labelIds: labelId ? [labelId] : undefined, projectId, teamId: team.id });

  for (const file of report.attachments) {
    try {
      const assetUrl = await client.uploadFile(file.data, file.name, file.contentType);
      await client.createAttachment(issue.id, assetUrl, file.name);
    } catch (error) {
      logger.warn(`${PREFIX} Could not upload the attachment "${file.name}", continuing without:`, sanitize(error, config.apiKey));
    }
  }
  return { identifier: issue.identifier, issueId: issue.id, issueUrl: issue.url };
}

function linearConfig(env: LtEnv, options: LtBugReportHandlerOptions): LinearConfig | null {
  const apiKey = pick(env, 'NG_LINEAR_API_KEY', options.linearApiKey);
  const teamName = pick(env, 'NG_LINEAR_TEAM_NAME', options.linearTeamName);
  if (!apiKey || !teamName) {
    return null;
  }
  return { apiKey, projectName: pick(env, 'NG_LINEAR_PROJECT_NAME', options.linearProjectName), teamName };
}

/** Env value (trimmed, non-empty) before the option. */
function pick(env: LtEnv, name: string, fallback: string | undefined): string | undefined {
  const value = env[name]?.trim();
  return value || fallback?.trim() || undefined;
}

/** Error text for the server log: redacted, the API key replaced. */
function sanitize(error: unknown, apiKey: string | undefined): string {
  let text = error instanceof Error ? error.message : String(error);
  if (apiKey) {
    text = text.split(apiKey).join(LT_BUG_REDACTED);
  }
  return redactLtText(text.replace(/lin_api_[A-Za-z0-9]+/g, LT_BUG_REDACTED));
}

async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const parsed = (req as IncomingMessage & { body?: unknown }).body;
  if (parsed !== undefined && parsed !== null && typeof parsed === 'object' && !Buffer.isBuffer(parsed)) {
    return parsed;
  }
  if (Number(headerValue(req.headers['content-length']) ?? 0) > limit) {
    req.resume();
    throw new HttpError(413, 'Bug report too large');
  }
  const text = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) {
        return;
      }
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        reject(new HttpError(413, 'Bug report too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!tooLarge) {
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
    req.on('error', (error) => reject(error));
  });
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'The bug report must be valid JSON');
  }
}

type RateLimiter = (key: string) => number;

/** Fixed-window limiter; returns 0 when allowed, else the ms until the window resets. */
function createRateLimiter(limit: false | { max: number; windowMs: number }): RateLimiter {
  if (!limit) {
    return () => 0;
  }
  const windows = new Map<string, { count: number; resetAt: number }>();
  return (key) => {
    const now = Date.now();
    if (windows.size > 5000) {
      for (const [entryKey, entry] of windows) {
        if (entry.resetAt <= now) {
          windows.delete(entryKey);
        }
      }
    }
    const entry = windows.get(key);
    if (!entry || entry.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + limit.windowMs });
      return 0;
    }
    entry.count++;
    return entry.count > limit.max ? entry.resetAt - now : 0;
  };
}

/** Client address: the last `X-Forwarded-For` entry (added by the own proxy), else the socket address. */
function clientKey(req: IncomingMessage): string {
  const forwarded = headerValue(req.headers['x-forwarded-for'])?.split(',').pop()?.trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(body));
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function processEnv(): LtEnv {
  return (globalThis as { process?: { env?: LtEnv } }).process?.env ?? {};
}
