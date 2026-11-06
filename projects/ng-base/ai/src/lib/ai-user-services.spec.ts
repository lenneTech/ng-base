import { TestBed } from '@angular/core/testing';
import { LT_FETCH, LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';

import { LtAiAdminService } from './ai-admin-service';
import { LtAiConnectionsService } from './ai-connections-service';
import { LtAiPlaceholdersService } from './ai-placeholders-service';
import { LtAiPromptsService } from './ai-prompts-service';
import { LtAiSettingsService } from './ai-settings-service';
import { LtAiUsageService } from './ai-usage-service';

function answer(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const call = (index: number) => {
  const [url, init] = fetchMock.mock.calls[index]!;
  return { body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined, method: init?.method, url };
};

beforeEach(() => {
  fetchMock.mockReset();
  TestBed.configureTestingModule({
    providers: [
      { provide: LT_FETCH, useValue: fetchMock },
      { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.test' }) },
    ],
  });
});

describe('LtAiSettingsService', () => {
  const ENFORCED = { error: 'Forbidden', message: '#LTNS_0609: This AI setting is fixed by the server', statusCode: 403 };

  it('loads the settings as they take effect', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { mcpConfirmation: true, mcpConfirmationEnforced: false }));
    const settings = TestBed.inject(LtAiSettingsService);
    expect(settings.enforced()).toBe(false);

    await settings.load();

    expect(call(0)).toEqual({ body: undefined, method: 'GET', url: 'https://api.test/ai/settings' });
    expect(settings.settings()).toEqual({ mcpConfirmation: true, mcpConfirmationEnforced: false });
    expect(settings.enforced()).toBe(false);
    expect(settings.loading()).toBe(false);
  });

  it('reports a setting the server fixed as enforced', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { mcpConfirmation: true, mcpConfirmationEnforced: true }));
    const settings = TestBed.inject(LtAiSettingsService);
    await settings.load();
    expect(settings.enforced()).toBe(true);
  });

  it('sends only the choice and adopts the server answer, not the input', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { mcpConfirmation: true, mcpConfirmationEnforced: false }));
    const settings = TestBed.inject(LtAiSettingsService);
    await settings.load();
    fetchMock.mockResolvedValueOnce(answer(200, { mcpConfirmation: true, mcpConfirmationEnforced: true }));

    await settings.update({ mcpConfirmation: false });

    expect(call(1)).toEqual({ body: { mcpConfirmation: false }, method: 'PUT', url: 'https://api.test/ai/settings' });
    expect(settings.settings()).toEqual({ mcpConfirmation: true, mcpConfirmationEnforced: true });
    expect(settings.enforced()).toBe(true);
  });

  it('keeps the previous value when the server refuses a fixed setting (403 #LTNS_0609)', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { mcpConfirmation: true, mcpConfirmationEnforced: false }));
    const settings = TestBed.inject(LtAiSettingsService);
    await settings.load();
    fetchMock.mockResolvedValueOnce(answer(403, ENFORCED));

    await expect(settings.update({ mcpConfirmation: false })).rejects.toMatchObject({ status: 403 });

    expect(settings.error()).toContain('#LTNS_0609');
    expect(settings.settings()).toEqual({ mcpConfirmation: true, mcpConfirmationEnforced: false });
    expect(settings.loading()).toBe(false);
  });

  it('reports a failed load without throwing', async () => {
    fetchMock.mockResolvedValueOnce(answer(401, { message: 'Unauthorized', statusCode: 401 }));
    const settings = TestBed.inject(LtAiSettingsService);

    await expect(settings.load()).resolves.toBeUndefined();

    expect(settings.error()).toBe('Unauthorized');
    expect(settings.settings()).toBeNull();
    expect(settings.enforced()).toBe(false);
  });
});

describe('LtAiConnectionsService', () => {
  const list = [
    { id: 'a', isDefault: true, name: 'A' },
    { id: 'b', name: 'B', selected: true },
  ];

  it('loads the available connections and derives selected/locked', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, list));
    const connections = TestBed.inject(LtAiConnectionsService);

    await connections.load();

    expect(call(0)).toMatchObject({ method: 'GET', url: 'https://api.test/ai/connections/available' });
    expect(connections.connections()).toEqual(list);
    expect(connections.selected()?.id).toBe('b');
    expect(connections.locked()).toBe(false);
  });

  it('is locked when a mandatory layer applies', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, [{ id: 'a', locked: true, selected: true }]));
    const connections = TestBed.inject(LtAiConnectionsService);
    await connections.load();
    expect(connections.locked()).toBe(true);
  });

  it('selects a connection and adopts the returned list', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, [{ id: 'a', selected: true }, { id: 'b' }]));
    const connections = TestBed.inject(LtAiConnectionsService);

    await connections.select('a');

    expect(call(0)).toEqual({ body: { connectionId: 'a' }, method: 'POST', url: 'https://api.test/ai/connections/select' });
    expect(connections.selected()?.id).toBe('a');
  });

  it('load() reports errors quietly, select() rethrows', async () => {
    const connections = TestBed.inject(LtAiConnectionsService);
    fetchMock.mockResolvedValueOnce(answer(500, { message: 'down' }));
    await connections.load();
    expect(connections.error()).toBe('down');

    fetchMock.mockResolvedValueOnce(answer(403, { message: 'locked' }));
    await expect(connections.select('x')).rejects.toMatchObject({ status: 403 });
    expect(connections.error()).toBe('locked');
    expect(connections.loading()).toBe(false);
  });
});

describe('LtAiUsageService', () => {
  it('loads the usage', async () => {
    const usage = { user: { period: 'month', scope: 'user', usedPrompts: 2, usedTokens: 100 } };
    fetchMock.mockResolvedValueOnce(answer(200, usage));
    const service = TestBed.inject(LtAiUsageService);

    await service.load();

    expect(call(0)).toMatchObject({ method: 'GET', url: 'https://api.test/ai/usage' });
    expect(service.usage()).toEqual(usage);
  });

  it('reports a failure without throwing', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const service = TestBed.inject(LtAiUsageService);
    await service.load();
    expect(service.error()).toBe('Failed to fetch');
    expect(service.usage()).toBeNull();
  });
});

describe('LtAiPlaceholdersService', () => {
  it('loads the placeholder registry', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, [{ description: 'Roles', name: 'roles' }]));
    const service = TestBed.inject(LtAiPlaceholdersService);
    await service.load();
    expect(call(0).url).toBe('https://api.test/ai/placeholders');
    expect(service.placeholders()).toEqual([{ description: 'Roles', name: 'roles' }]);
  });

  it('empties the list on failure', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, [{ description: 'Roles', name: 'roles' }])).mockResolvedValueOnce(answer(500, { message: 'down' }));
    const service = TestBed.inject(LtAiPlaceholdersService);
    await service.load();
    await service.load();
    expect(service.placeholders()).toEqual([]);
    expect(service.error()).toBe('down');
  });
});

describe('LtAiPromptsService', () => {
  const prompt = { content: 'Summarise', id: 'p/1', name: 'Summary', scope: 'user' };

  it('loads the visible prompts', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, [prompt]));
    const prompts = TestBed.inject(LtAiPromptsService);
    await prompts.load();
    expect(call(0)).toMatchObject({ method: 'GET', url: 'https://api.test/ai/prompts' });
    expect(prompts.prompts()).toEqual([prompt]);
  });

  it('reloads the list after create, update and remove; ids are encoded', async () => {
    const prompts = TestBed.inject(LtAiPromptsService);
    fetchMock.mockResolvedValueOnce(answer(201, prompt)).mockResolvedValueOnce(answer(200, [prompt]));
    await expect(prompts.create({ content: 'Summarise', name: 'Summary' })).resolves.toEqual(prompt);
    expect(prompts.prompts()).toEqual([prompt]);

    fetchMock.mockResolvedValueOnce(answer(200, { ...prompt, name: 'New' })).mockResolvedValueOnce(answer(200, [{ ...prompt, name: 'New' }]));
    await prompts.update('p/1', { name: 'New' });
    expect(prompts.prompts()[0]?.name).toBe('New');

    fetchMock.mockResolvedValueOnce(answer(200, prompt)).mockResolvedValueOnce(answer(200, []));
    await prompts.remove('p/1');
    expect(prompts.prompts()).toEqual([]);

    expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`)).toEqual([
      'POST https://api.test/ai/prompts',
      'GET https://api.test/ai/prompts',
      'PUT https://api.test/ai/prompts/p%2F1',
      'GET https://api.test/ai/prompts',
      'DELETE https://api.test/ai/prompts/p%2F1',
      'GET https://api.test/ai/prompts',
    ]);
    expect(prompts.loading()).toBe(false);
  });

  it('rethrows a refused mutation without reloading', async () => {
    fetchMock.mockResolvedValueOnce(answer(403, { message: 'nope' }));
    const prompts = TestBed.inject(LtAiPromptsService);
    await expect(prompts.create({ name: 'x' })).rejects.toMatchObject({ message: 'nope' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prompts.error()).toBe('nope');
  });

  it('empties the list when loading fails', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, [prompt])).mockResolvedValueOnce(answer(500, { message: 'down' }));
    const prompts = TestBed.inject(LtAiPromptsService);
    await prompts.load();
    await prompts.load();
    expect(prompts.prompts()).toEqual([]);
    expect(prompts.error()).toBe('down');
  });

  it('applies only the latest of overlapping loads', async () => {
    let releaseFirst!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve))).mockResolvedValueOnce(answer(200, [prompt]));
    const prompts = TestBed.inject(LtAiPromptsService);
    const first = prompts.load();
    await prompts.load();
    releaseFirst(answer(200, []));
    await first;
    expect(prompts.prompts()).toEqual([prompt]);
  });
});

describe('LtAiAdminService', () => {
  it('returns raw responses and encodes ids', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { id: 'a b' }));
    const admin = TestBed.inject(LtAiAdminService);
    await expect(admin.getConnection('a b')).resolves.toEqual({ id: 'a b' });
    expect(call(0)).toMatchObject({ method: 'GET', url: 'https://api.test/ai/connections/a%20b' });
  });
});
