/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

import { LT_BUG_DEFAULT_MAX_BODY_BYTES, ltBugReport, type LtBugReportHandlerOptions } from './bug-report-handler';
import { LT_LINEAR_API_URL } from './linear-client';

const API_KEY = 'lin_api_SECRETKEY123';
const ENV = { NG_LINEAR_API_KEY: API_KEY, NG_LINEAR_PROJECT_NAME: 'Website', NG_LINEAR_TEAM_NAME: 'Entwicklung', NG_PUBLIC_APP_ENV: 'test' };
const PNG = `data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`;

interface Call {
  body: Record<string, unknown> | null;
  init: RequestInit;
  query: string;
  url: string;
}

/** Linear double: answers by GraphQL operation; `overrides` replace single answers. */
function linear(overrides: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const answers: Record<string, unknown> = {
    attachmentCreate: { attachmentCreate: { attachment: { id: 'att-1' }, success: true } },
    fileUpload: {
      fileUpload: {
        success: true,
        uploadFile: { assetUrl: 'https://uploads.linear.app/asset-1', headers: [{ key: 'x-goog-meta', value: '1' }], uploadUrl: 'https://storage.googleapis.com/upload-1' },
      },
    },
    issueCreate: { issueCreate: { issue: { id: 'issue-1', identifier: 'DEV-42', title: 'x', url: 'https://linear.app/lt/issue/DEV-42' }, success: true } },
    issueLabelCreate: { issueLabelCreate: { issueLabel: { id: 'label-new', name: 'bug' }, success: true } },
    issueLabels: { issueLabels: { nodes: [{ id: 'label-other-team', name: 'bug', team: { id: 'team-x' } }], pageInfo: { hasNextPage: false } } },
    projects: { projects: { nodes: [{ id: 'project-1', name: 'Website' }], pageInfo: { hasNextPage: false } } },
    teams: { teams: { nodes: [{ id: 'team-1', key: 'DEV', name: 'Entwicklung' }], pageInfo: { hasNextPage: false } } },
    ...overrides,
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const query = String(body?.['query'] ?? '');
    calls.push({ body, init, query, url });
    if (url !== LT_LINEAR_API_URL) {
      return new Response(null, { status: 200 });
    }
    const operation = Object.keys(answers).find((name) => new RegExp(`\\b${name}\\(`).test(query));
    const answer = operation ? answers[operation] : undefined;
    if (answer instanceof Response) {
      return answer;
    }
    return new Response(JSON.stringify(answer instanceof Error ? { errors: [{ message: answer.message }] } : { data: answer }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  });
  const graphql = (name: string) => calls.filter((call) => call.url === LT_LINEAR_API_URL && new RegExp(`\\b${name}\\(`).test(call.query));
  return { calls, fetch: fetchMock as unknown as typeof fetch, graphql };
}

interface Result {
  body: Record<string, unknown>;
  headers: Record<string, string>;
  nextCalled: boolean;
  status: number;
}

async function call(
  options: LtBugReportHandlerOptions,
  request: { body?: unknown; headers?: Record<string, string>; method?: string; parsed?: unknown; url?: string } = {},
): Promise<Result> {
  const raw = request.body === undefined ? '' : typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  const req = Readable.from(raw ? [Buffer.from(raw)] : []) as unknown as IncomingMessage & { body?: unknown };
  Object.assign(req, {
    headers: { 'content-type': 'application/json', ...request.headers },
    method: request.method ?? 'POST',
    socket: { remoteAddress: '10.0.0.1' },
    url: request.url ?? '/_bug-lt/report',
  });
  if (request.parsed !== undefined) {
    req.body = request.parsed;
  }
  return new Promise<Result>((resolve) => {
    const headers: Record<string, string> = {};
    const res = {
      end: (chunk?: string) => resolve({ body: chunk ? (JSON.parse(chunk) as Record<string, unknown>) : {}, headers, nextCalled: false, status: res.statusCode }),
      headersSent: false,
      setHeader: (name: string, value: string) => void (headers[name.toLowerCase()] = value),
      statusCode: 200,
    } as unknown as ServerResponse & { statusCode: number };
    ltBugReport(options)(req, res, () => resolve({ body: {}, headers, nextCalled: true, status: 0 }));
  });
}

const REPORT = { description: 'Test description', title: 'Test Bug', type: 'bug' };

/** `Authorization` header of the first Linear request. */
function authorization(api: ReturnType<typeof linear>): string | undefined {
  const first = api.calls[0];
  return first ? (first.init.headers as Record<string, string>)['Authorization'] : undefined;
}

/** The `input` of the (first) `issueCreate` mutation. */
function issueInput(api: ReturnType<typeof linear>): Record<string, unknown> & { description: string; title: string } {
  const variables = api.graphql('issueCreate')[0]?.body?.['variables'] as { input: Record<string, unknown> & { description: string; title: string } } | undefined;
  if (!variables) {
    throw new Error('issueCreate was not called');
  }
  return variables.input;
}

describe('ltBugReport()', () => {
  let logger: { error: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>; warn: ReturnType<typeof vi.fn<(...args: unknown[]) => void>> };

  beforeEach(() => {
    logger = { error: vi.fn<(...args: unknown[]) => void>(), warn: vi.fn<(...args: unknown[]) => void>() };
  });

  const loggedText = () => JSON.stringify([...logger.error.mock.calls, ...logger.warn.mock.calls]);

  it('creates the issue with team, project and label and answers with the issue', async () => {
    const api = linear();
    const result = await call({ env: ENV, fetch: api.fetch, logger }, { body: REPORT });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      identifier: 'DEV-42',
      issueId: 'issue-1',
      issueUrl: 'https://linear.app/lt/issue/DEV-42',
      message: 'Bug report submitted successfully',
      success: true,
    });
    const input = issueInput(api);
    expect(input).toMatchObject({ labelIds: ['label-new'], projectId: 'project-1', teamId: 'team-1', title: 'BUG: Test Bug' });
    expect(String(input['description'])).toContain('**Beschreibung:**\nTest description');
    expect(api.graphql('issueLabelCreate')[0]?.body?.['variables']).toEqual({ input: { color: '#f87171', name: 'bug', teamId: 'team-1' } });
    expect(authorization(api)).toBe(API_KEY);
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('uses an existing team or workspace label instead of creating one', async () => {
    const api = linear({ issueLabels: { issueLabels: { nodes: [{ id: 'label-ws', name: 'Bug', team: null }], pageInfo: { hasNextPage: false } } } });
    await call({ env: ENV, fetch: api.fetch, logger }, { body: REPORT });
    expect(api.graphql('issueLabelCreate')).toHaveLength(0);
    expect(issueInput(api)['labelIds']).toEqual(['label-ws']);
  });

  it('resolves the team by key and pages through teams', async () => {
    let page = 0;
    const api = linear({
      teams: {
        get teams() {
          page++;
          return page === 1
            ? { nodes: [{ id: 'team-a', key: 'OPS', name: 'Betrieb' }], pageInfo: { endCursor: 'c1', hasNextPage: true } }
            : { nodes: [{ id: 'team-1', key: 'DEV', name: 'Entwicklung' }], pageInfo: { hasNextPage: false } };
        },
      },
    });
    const result = await call({ env: { ...ENV, NG_LINEAR_TEAM_NAME: 'dev' }, fetch: api.fetch, logger }, { body: REPORT });
    expect(result.status).toBe(200);
    expect(api.graphql('teams')[1]?.body?.['variables']).toEqual({ after: 'c1' });
  });

  it('continues without project when the project is unknown', async () => {
    const api = linear({ projects: { projects: { nodes: [], pageInfo: { hasNextPage: false } } } });
    const result = await call({ env: ENV, fetch: api.fetch, logger }, { body: REPORT });
    expect(result.status).toBe(200);
    expect(issueInput(api)['projectId']).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('answers 500 when the Linear API key or team is missing (and logs which variable)', async () => {
    const api = linear();
    const result = await call({ env: { NG_PUBLIC_APP_ENV: 'test' }, fetch: api.fetch, logger }, { body: REPORT });
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: 'Bug reporting is not configured on the server', success: false });
    expect(loggedText()).toContain('NG_LINEAR_API_KEY');
    expect(api.calls).toHaveLength(0);
  });

  it('answers 500 (not configured) when the team does not exist, without exposing the team list', async () => {
    const api = linear({ teams: { teams: { nodes: [{ id: 't', key: 'OPS', name: 'Betrieb' }], pageInfo: { hasNextPage: false } } } });
    const result = await call({ env: ENV, fetch: api.fetch, logger }, { body: REPORT });
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain('Betrieb');
    expect(loggedText()).toContain('Betrieb');
  });

  it('answers 400 for every missing required field (same cases as bug.lt)', async () => {
    const api = linear();
    for (const body of [
      { description: 'desc', type: 'bug' },
      { description: 'desc', title: 'title' },
      { title: 'title', type: 'bug' },
      { description: 'desc', title: '', type: 'bug' },
      { description: 'desc', title: 'title', type: '' },
      { description: '', title: 'title', type: 'bug' },
    ]) {
      const result = await call({ env: ENV, fetch: api.fetch, logger }, { body });
      expect(result.status, JSON.stringify(body)).toBe(400);
      expect(result.body['error']).toBe('Missing required fields: title, type, and description are required');
    }
    expect(api.calls).toHaveLength(0);
  });

  it('answers 400 for malformed bodies and wrong types', async () => {
    const api = linear();
    expect((await call({ env: ENV, fetch: api.fetch, logger }, { body: '{not json' })).status).toBe(400);
    expect((await call({ env: ENV, fetch: api.fetch, logger }, { body: '[1,2]' })).status).toBe(400);
    expect((await call({ env: ENV, fetch: api.fetch, logger }, { body: { ...REPORT, type: 'question' } })).status).toBe(400);
    expect((await call({ env: ENV, fetch: api.fetch, logger }, { body: { ...REPORT, consoleLogs: 'x' } })).status).toBe(400);
  });

  it('never fetches attachment URLs (SSRF): only base64 data URLs are accepted', async () => {
    const api = linear();
    const result = await call(
      { env: ENV, fetch: api.fetch, logger },
      { body: { ...REPORT, attachments: [{ data: 'http://169.254.169.254/latest/meta-data', name: 'x', type: 'text/plain' }] } },
    );
    expect(result.status).toBe(400);
    expect(api.calls.some((entry) => entry.url.includes('169.254'))).toBe(false);
  });

  it('uploads the screenshot and attachments and links them to the issue', async () => {
    const api = linear();
    const text = `data:text/plain;base64,${Buffer.from('log line').toString('base64')}`;
    const result = await call(
      { env: ENV, fetch: api.fetch, logger },
      {
        body: {
          ...REPORT,
          attachments: [
            { data: PNG, isScreenshot: true, name: 'screenshot.png', type: 'image/png' },
            { data: text, name: '../../etc/app.log', type: 'text/plain' },
          ],
        },
      },
    );
    expect(result.status).toBe(200);
    expect(api.graphql('fileUpload').map((entry) => entry.body?.['variables'])).toEqual([
      { contentType: 'image/png', filename: 'screenshot.png', size: 8 },
      { contentType: 'text/plain', filename: 'app.log', size: 8 },
    ]);
    const put = api.calls.find((entry) => entry.init.method === 'PUT') as Call;
    expect(put.url).toBe('https://storage.googleapis.com/upload-1');
    expect((put.init.headers as Headers).get('content-type')).toBe('image/png');
    expect((put.init.headers as Headers).get('x-goog-meta')).toBe('1');
    expect(api.graphql('attachmentCreate').map((entry) => entry.body?.['variables'])).toEqual([
      { input: { issueId: 'issue-1', title: 'screenshot.png', url: 'https://uploads.linear.app/asset-1' } },
      { input: { issueId: 'issue-1', title: 'app.log', url: 'https://uploads.linear.app/asset-1' } },
    ]);
  });

  it('accepts the legacy screenshot field and keeps the issue when an upload fails', async () => {
    const api = linear({ fileUpload: new Error('upload denied') });
    const result = await call({ env: ENV, fetch: api.fetch, logger }, { body: { ...REPORT, screenshot: PNG } });
    expect(result.status).toBe(200);
    expect(api.graphql('fileUpload')[0]?.body?.['variables']).toMatchObject({ contentType: 'image/png', size: 8 });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('answers 502 with a generic message when Linear fails, never echoing Linear errors or the API key', async () => {
    const api = linear({ issueCreate: new Response(`unauthorized for key ${API_KEY}`, { status: 401, statusText: 'Unauthorized' }) });
    const result = await call({ env: ENV, fetch: api.fetch, logger }, { body: REPORT });
    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: 'Linear rejected the bug report', success: false });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(loggedText()).toContain('401');
    expect(loggedText()).not.toContain(API_KEY);
  });

  it('answers 500 with a generic message for unexpected errors', async () => {
    const failing = vi.fn(() => Promise.reject(new Error(`socket hang up ${API_KEY}`))) as unknown as typeof fetch;
    const result = await call({ env: ENV, fetch: failing, logger }, { body: REPORT });
    expect([500, 502]).toContain(result.status);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(loggedText()).not.toContain(API_KEY);
  });

  it('is off (404) in production and without NG_PUBLIC_APP_ENV, unless enabled is passed', async () => {
    const api = linear();
    expect((await call({ env: { ...ENV, NG_PUBLIC_APP_ENV: 'production' }, fetch: api.fetch, logger }, { body: REPORT })).status).toBe(404);
    const { NG_PUBLIC_APP_ENV: _unused, ...withoutEnv } = ENV;
    expect((await call({ env: withoutEnv, fetch: api.fetch, logger }, { body: REPORT })).status).toBe(404);
    expect((await call({ env: { ...withoutEnv, NG_PUBLIC_APP_ENV: '' }, fetch: api.fetch, logger }, { body: REPORT })).status).toBe(404);
    expect(api.calls).toHaveLength(0);
    expect((await call({ enabled: true, env: { ...ENV, NG_PUBLIC_APP_ENV: 'production' }, fetch: api.fetch, logger }, { body: REPORT })).status).toBe(200);
    expect((await call({ enabled: false, env: ENV, fetch: api.fetch, logger }, { body: REPORT })).status).toBe(404);
  });

  it('follows NG_PUBLIC_LT_BUG_ENABLED, the switch the browser part reads, before the enabled option', async () => {
    const api = linear();
    const production = { ...ENV, NG_PUBLIC_APP_ENV: 'production' };
    expect((await call({ env: { ...production, NG_PUBLIC_LT_BUG_ENABLED: 'true' }, fetch: api.fetch, logger }, { body: REPORT })).status).toBe(200);
    expect((await call({ enabled: true, env: { ...ENV, NG_PUBLIC_LT_BUG_ENABLED: 'false' }, fetch: api.fetch, logger }, { body: REPORT })).status).toBe(404);
    // Anything but a boolean leaves the decision to the option and the app env.
    expect((await call({ env: { ...production, NG_PUBLIC_LT_BUG_ENABLED: 'maybe' }, fetch: api.fetch, logger }, { body: REPORT })).status).toBe(404);
  });

  it('passes other paths on and serves a custom endpoint', async () => {
    const api = linear();
    expect((await call({ env: ENV, fetch: api.fetch, logger }, { url: '/api/users' })).nextCalled).toBe(true);
    expect((await call({ endpoint: '/bugs', env: ENV, fetch: api.fetch, logger }, { body: REPORT, url: '/bugs?x=1' })).status).toBe(200);
  });

  it('answers 405 for other methods and 415 for non-JSON bodies', async () => {
    const api = linear();
    const get = await call({ env: ENV, fetch: api.fetch, logger }, { method: 'GET' });
    expect(get.status).toBe(405);
    expect(get.headers['allow']).toBe('POST');
    expect((await call({ env: ENV, fetch: api.fetch, logger }, { body: 'title=x', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status).toBe(415);
  });

  it('caps the body size (413) by Content-Length and while streaming', async () => {
    const api = linear();
    expect(LT_BUG_DEFAULT_MAX_BODY_BYTES).toBe(30 * 1024 * 1024);
    expect((await call({ env: ENV, fetch: api.fetch, logger, maxBodyBytes: 100 }, { body: REPORT, headers: { 'content-length': '5000' } })).status).toBe(413);
    expect((await call({ env: ENV, fetch: api.fetch, logger, maxBodyBytes: 100 }, { body: { ...REPORT, description: 'x'.repeat(500) } })).status).toBe(413);
    expect(api.calls).toHaveLength(0);
  });

  it('drops oversized attachments, cuts texts and keeps only the newest log entries', async () => {
    const api = linear();
    const huge = `data:image/png;base64,${'A'.repeat(15_000_004)}`;
    const consoleLogs = Array.from({ length: 150 }, (_, index) => ({ level: 'log', message: [`line ${index}`], timestamp: 't' }));
    const result = await call(
      { env: ENV, fetch: api.fetch, logger },
      { body: { ...REPORT, attachments: [{ data: huge, name: 'big.png', type: 'image/png' }], consoleLogs, title: 'T'.repeat(400) } },
    );
    expect(result.status).toBe(200);
    expect(api.graphql('fileUpload')).toHaveLength(0);
    const input = issueInput(api);
    expect(input.title.length).toBeLessThan(320);
    expect(input.description).toContain('line 149');
    expect(input.description).not.toContain('line 0]');
    expect(input.description).toContain('1 Anhang/Anhänge nicht übernommen');
  });

  it('redacts tokens and auth bodies once more before writing to Linear', async () => {
    const api = linear();
    await call(
      { env: ENV, fetch: api.fetch, logger },
      {
        body: {
          ...REPORT,
          browserInfo: { url: 'https://app.test/reset?token=abc123' },
          consoleLogs: [{ level: 'error', message: ['{"password":"hunter2"}'], timestamp: 't' }],
          description: 'Link https://app.test/verify?code=999 failed',
          networkRequests: [{ method: 'POST', responseBody: '{"token":"t0k"}', status: 500, statusText: 'Error', timestamp: 't', url: '/iam/sign-in/email?token=zzz' }],
        },
      },
    );
    const description = issueInput(api).description;
    expect(description).not.toMatch(/abc123|hunter2|999|t0k|zzz/);
    expect(description).toContain('[redacted]');
  });

  it('limits reports per client (429 with Retry-After)', async () => {
    const api = linear();
    const options = { env: ENV, fetch: api.fetch, logger, rateLimit: { max: 2, windowMs: 60_000 } };
    const handlerResults: number[] = [];
    const middleware = ltBugReport(options);
    for (let i = 0; i < 3; i++) {
      handlerResults.push(
        await new Promise<number>((resolve) => {
          const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(REPORT))]), {
            headers: { 'content-type': 'application/json' },
            method: 'POST',
            socket: { remoteAddress: '10.0.0.9' },
            url: '/_bug-lt/report',
          });
          const res = { end: () => resolve(res.statusCode), headersSent: false, setHeader: () => undefined, statusCode: 200 };
          middleware(req as unknown as IncomingMessage, res as unknown as ServerResponse, () => resolve(-1));
        }),
      );
    }
    expect(handlerResults).toEqual([200, 200, 429]);
  });

  it('prefers the env over code options and accepts a body parsed by express.json()', async () => {
    const api = linear();
    const result = await call({ env: ENV, fetch: api.fetch, linearApiKey: 'lin_api_code', linearTeamName: 'Betrieb', logger }, { parsed: REPORT });
    expect(result.status).toBe(200);
    expect(authorization(api)).toBe(API_KEY);
    const fromOptions = await call({ env: { NG_PUBLIC_APP_ENV: 'local' }, fetch: api.fetch, linearApiKey: API_KEY, linearTeamName: 'DEV', logger }, { body: REPORT });
    expect(fromOptions.status).toBe(200);
  });
});
