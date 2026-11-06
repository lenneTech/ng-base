/// <reference types="node" />

/** Linear GraphQL endpoint. */
export const LT_LINEAR_API_URL = 'https://api.linear.app/graphql';

/** Label name and color per report type (same mapping as `@lenne.tech/bug.lt`). */
export const LT_BUG_LABELS: Readonly<Record<string, { color: string; name: string }>> = Object.freeze({
  bug: { color: '#f87171', name: 'bug' },
  enhancement: { color: '#34d399', name: 'enhancement' },
  feature: { color: '#60a5fa', name: 'feature' },
  other: { color: '#a78bfa', name: 'other' },
});

/** Error of a Linear request. The message may contain Linear's answer: log it server-side only, never send it out. */
export class LtLinearError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LtLinearError';
  }
}

/** Options of {@link LtLinearClient}. */
export interface LtLinearClientOptions {
  /** Linear personal API key (sent as `Authorization`). */
  apiKey: string;
  /** GraphQL endpoint (default {@link LT_LINEAR_API_URL}). */
  apiUrl?: string;
  /** `fetch` implementation (default the global `fetch`). */
  fetch?: typeof fetch;
  /** Timeout per request in ms (default 15000). */
  timeoutMs?: number;
}

/** Issue created by {@link LtLinearClient.createIssue}. */
export interface LtLinearIssue {
  id: string;
  identifier?: string;
  url?: string;
}

interface Page<T> {
  nodes: T[];
  pageInfo?: { endCursor?: string | null; hasNextPage?: boolean };
}

const MAX_PAGES = 10;

/**
 * Minimal Linear GraphQL client for bug reports (the port of `LinearApiClient` of `@lenne.tech/bug.lt`): team and project
 * lookup by name (paginated, case-insensitive), label lookup/creation, issue creation and the two-step file upload
 * (signed URL from `fileUpload`, `PUT` to storage, then `attachmentCreate`).
 */
export class LtLinearClient {
  private readonly apiUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: LtLinearClientOptions) {
    this.apiUrl = options.apiUrl ?? LT_LINEAR_API_URL;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  /** Run a GraphQL request; throws {@link LtLinearError} on HTTP and GraphQL errors. */
  async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFn(this.apiUrl, {
        body: JSON.stringify({ query, variables }),
        headers: { Authorization: this.options.apiKey, 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new LtLinearError(`Linear API request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new LtLinearError(`Linear API request failed: ${response.status} ${response.statusText} - ${text.slice(0, 500)}`, response.status);
    }
    const result = (await response.json().catch(() => null)) as { data?: T; errors?: unknown[] } | null;
    if (!result) {
      throw new LtLinearError('Linear API answered with invalid JSON');
    }
    if (result.errors?.length) {
      throw new LtLinearError(`Linear GraphQL error: ${JSON.stringify(result.errors).slice(0, 1000)}`);
    }
    return result.data as T;
  }

  /** All teams (paginated). */
  async getTeams(): Promise<{ id: string; key: string; name: string }[]> {
    return this.collect<{ id: string; key: string; name: string }>(
      'query Teams($after: String) { teams(first: 250, after: $after) { nodes { id name key } pageInfo { hasNextPage endCursor } } }',
      (data) => (data as { teams?: Page<{ id: string; key: string; name: string }> }).teams,
    );
  }

  /** Team by name or key (case-insensitive), `null` when none matches. */
  async findTeam(nameOrKey: string): Promise<{ id: string; key: string; name: string } | null> {
    const wanted = nameOrKey.trim().toLowerCase();
    return (await this.getTeams()).find((team) => team.name.toLowerCase() === wanted || team.key.toLowerCase() === wanted) ?? null;
  }

  /** Project by name (case-insensitive), `null` when none matches. */
  async findProject(name: string): Promise<{ id: string; name: string } | null> {
    const wanted = name.trim().toLowerCase();
    const projects = await this.collect<{ id: string; name: string }>(
      'query Projects($after: String) { projects(first: 250, after: $after) { nodes { id name } pageInfo { hasNextPage endCursor } } }',
      (data) => (data as { projects?: Page<{ id: string; name: string }> }).projects,
    );
    return projects.find((project) => project.name.toLowerCase() === wanted) ?? null;
  }

  /** Id of the label `name` usable in `teamId` (a team label or a workspace label), `null` when there is none. */
  async findLabel(teamId: string, name: string): Promise<string | null> {
    const wanted = name.toLowerCase();
    const labels = await this.collect<{ id: string; name: string; team?: { id: string } | null }>(
      'query Labels($after: String) { issueLabels(first: 250, after: $after) { nodes { id name team { id } } pageInfo { hasNextPage endCursor } } }',
      (data) => (data as { issueLabels?: Page<{ id: string; name: string; team?: { id: string } | null }> }).issueLabels,
    );
    const matches = labels.filter((label) => label.name.toLowerCase() === wanted && (!label.team || label.team.id === teamId));
    return (matches.find((label) => label.team?.id === teamId) ?? matches[0])?.id ?? null;
  }

  /** Create a team label; returns its id. */
  async createLabel(teamId: string, name: string, color: string): Promise<string | null> {
    const data = await this.request<{ issueLabelCreate?: { issueLabel?: { id: string }; success: boolean } }>(
      'mutation CreateLabel($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { success issueLabel { id name } } }',
      { input: { color, name, teamId } },
    );
    return data.issueLabelCreate?.success ? (data.issueLabelCreate.issueLabel?.id ?? null) : null;
  }

  /** Create an issue. */
  async createIssue(input: { description: string; labelIds?: string[]; projectId?: string; teamId: string; title: string }): Promise<LtLinearIssue> {
    const payload: Record<string, unknown> = { description: input.description, teamId: input.teamId, title: input.title };
    if (input.projectId) {
      payload['projectId'] = input.projectId;
    }
    if (input.labelIds?.length) {
      payload['labelIds'] = input.labelIds;
    }
    const data = await this.request<{ issueCreate?: { issue?: LtLinearIssue; success: boolean } }>(
      'mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id url identifier title } } }',
      { input: payload },
    );
    if (!data.issueCreate?.success || !data.issueCreate.issue?.id) {
      throw new LtLinearError('Linear did not create the issue');
    }
    return data.issueCreate.issue;
  }

  /** Upload a file to Linear's storage; returns the asset URL. */
  async uploadFile(content: Uint8Array, filename: string, contentType: string): Promise<string> {
    if (!content.length) {
      throw new LtLinearError(`File ${filename} has zero size`);
    }
    const data = await this.request<{
      fileUpload?: { success: boolean; uploadFile?: { assetUrl: string; headers?: { key: string; value: string }[]; uploadUrl: string } };
    }>(
      'mutation FileUpload($contentType: String!, $filename: String!, $size: Int!) { fileUpload(contentType: $contentType, filename: $filename, size: $size) { success uploadFile { uploadUrl assetUrl headers { key value } } } }',
      { contentType, filename, size: content.length },
    );
    const upload = data.fileUpload?.uploadFile;
    if (!data.fileUpload?.success || !upload?.uploadUrl || !upload.assetUrl) {
      throw new LtLinearError('Failed to get upload URL from Linear');
    }
    if (!/^https:\/\//i.test(upload.uploadUrl)) {
      throw new LtLinearError('Linear returned a non-HTTPS upload URL');
    }
    const headers = new Headers({ 'Content-Type': contentType });
    for (const { key, value } of upload.headers ?? []) {
      headers.set(key, value);
    }
    let response: Response;
    try {
      // Copy into a plain ArrayBuffer-backed view (`BodyInit` does not take views over a SharedArrayBuffer).
      const body = new Uint8Array(content.byteLength);
      body.set(content);
      response = await this.fetchFn(upload.uploadUrl, { body, headers, method: 'PUT', signal: AbortSignal.timeout(this.timeoutMs * 4) });
    } catch (error) {
      throw new LtLinearError(`Failed to upload file: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
      throw new LtLinearError(`Failed to upload file: ${response.status} ${response.statusText}`, response.status);
    }
    return upload.assetUrl;
  }

  /** Link an uploaded file to an issue. */
  async createAttachment(issueId: string, url: string, title: string): Promise<string | null> {
    const data = await this.request<{ attachmentCreate?: { attachment?: { id: string }; success: boolean } }>(
      'mutation CreateAttachment($input: AttachmentCreateInput!) { attachmentCreate(input: $input) { success attachment { id } } }',
      { input: { issueId, title, url } },
    );
    return data.attachmentCreate?.success ? (data.attachmentCreate.attachment?.id ?? null) : null;
  }

  private async collect<T>(query: string, pick: (data: unknown) => Page<T> | undefined): Promise<T[]> {
    const items: T[] = [];
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const connection: Page<T> | undefined = pick(await this.request<unknown>(query, { after }));
      items.push(...(connection?.nodes ?? []));
      if (!connection?.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) {
        break;
      }
      after = connection.pageInfo.endCursor;
    }
    return items;
  }
}
