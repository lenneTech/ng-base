import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig, resetLtWarnOnceState, type LtRuntimeConfig } from '@lenne.tech/ng-base';
import { LtAuthStateService } from '@lenne.tech/ng-base/auth/provide';

import { provideLtFiles, type LtFilesOptions } from './files-options';
import {
  LT_TUS_CLIENT_LOADER,
  LT_TUS_CLIENT_MISSING_MESSAGE,
  loadLtTusClient,
  type LtTusClientUpload,
  type LtTusClientUploadOptions,
  type LtTusHttpResponse,
  type LtTusPreviousUpload,
} from './tus-client';
import { injectLtTusUpload, LT_TUS_RETRY_DELAYS } from './tus-upload';
import type { LtUploadOptions } from './upload-types';

/** Fake tus-js-client `Upload`: records what the queue hands over and lets the test replay the callbacks. */
class FakeUpload implements LtTusClientUpload {
  static created: FakeUpload[] = [];
  static previous: LtTusPreviousUpload[] = [];
  url: null | string = null;
  started = 0;
  aborted = 0;
  lookups = 0;
  resumedFrom?: LtTusPreviousUpload;

  constructor(
    readonly file: File,
    readonly options: LtTusClientUploadOptions,
  ) {
    FakeUpload.created.push(this);
  }

  abort(): Promise<void> {
    this.aborted++;
    return Promise.resolve();
  }

  findPreviousUploads(): Promise<LtTusPreviousUpload[]> {
    this.lookups++;
    return Promise.resolve(FakeUpload.previous);
  }

  resumeFromPreviousUpload(previous: LtTusPreviousUpload): void {
    this.resumedFrom = previous;
  }

  start(): void {
    this.started++;
  }

  /** Replay a finished upload: `onAfterResponse` per response, then `onSuccess` (without payload, like 4.0/4.1). */
  finish(headers: Record<string, string>[] = [{}]): void {
    this.url = 'https://api.test/tus/upload-1';
    for (const values of headers) {
      this.options.onAfterResponse?.({ getUnderlyingObject: () => null, setHeader: () => undefined }, response(values));
    }
    this.options.onSuccess?.();
  }
}

function response(headers: Record<string, string> = {}, status = 204): LtTusHttpResponse {
  return { getHeader: (name) => headers[name] ?? null, getStatus: () => status };
}

function detailedError(status?: number): Error & { originalResponse: LtTusHttpResponse | null } {
  return Object.assign(new Error(`tus: response code ${status}`), { originalResponse: status ? response({}, status) : null });
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const file = (name = 'a.txt', size = 1000, type = 'text/plain'): File => new File(['x'.repeat(size)], name, { type });

describe('injectLtTusUpload', () => {
  let authMode: 'cookie' | 'jwt';
  let jwt: null | string;

  function setup(runtime: Partial<LtRuntimeConfig> = {}, filesOptions?: LtFilesOptions): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.test', ...runtime }) },
        { provide: LT_TUS_CLIENT_LOADER, useValue: () => Promise.resolve({ Upload: FakeUpload }) },
        { provide: LtAuthStateService, useValue: { getAuthMode: () => authMode, getJwtToken: () => jwt } },
        ...(filesOptions ? [provideLtFiles(filesOptions)] : []),
      ],
    });
  }

  const create = (options?: LtUploadOptions) => TestBed.runInInjectionContext(() => injectLtTusUpload(options));
  const last = (): FakeUpload => FakeUpload.created.at(-1)!;

  async function endpointFor(options: LtUploadOptions = {}): Promise<string | undefined> {
    await create({ autoStart: false, ...options }).addFiles(file());
    return last().options.endpoint;
  }

  beforeEach(() => {
    FakeUpload.created = [];
    FakeUpload.previous = [];
    authMode = 'cookie';
    jwt = null;
    resetLtWarnOnceState();
  });

  afterEach(() => vi.restoreAllMocks());

  it('throws outside an injection context', () => {
    expect(() => injectLtTusUpload()).toThrow();
  });

  describe('options handed to tus-js-client', () => {
    it('uses the defaults: /tus on the API, 5 MB chunks, retry delays, fingerprint cleanup', async () => {
      setup();
      await create({ autoStart: false }).addFiles(file());
      expect(last().options).toMatchObject({
        chunkSize: 5 * 1024 * 1024,
        endpoint: 'https://api.test/tus',
        removeFingerprintOnSuccess: true,
        retryDelays: [...LT_TUS_RETRY_DELAYS],
      });
    });

    it('sends filename and filetype plus the configured metadata', async () => {
      setup();
      await create({ autoStart: false, metadata: { folder: 'docs' } }).addFiles(file('report.pdf', 10, 'application/pdf'));
      expect(last().options.metadata).toEqual({ filename: 'report.pdf', filetype: 'application/pdf', folder: 'docs' });
    });

    it('takes chunk size, retry delays and headers from the options', async () => {
      setup();
      await create({ autoStart: false, chunkSize: 1024, headers: { 'X-Tenant': 't1' }, retryDelays: [0] }).addFiles(file());
      expect(last().options).toMatchObject({ chunkSize: 1024, headers: { 'X-Tenant': 't1' }, retryDelays: [0] });
    });

    it('takes the defaults of provideLtFiles() and of the runtime config', async () => {
      setup({ lt: { tus: { defaultChunkSize: 2048 } } }, { tus: { defaultEndpoint: '/uploads' } });
      await create({ autoStart: false }).addFiles(file());
      expect(last().options).toMatchObject({ chunkSize: 2048, endpoint: 'https://api.test/uploads' });
    });
  });

  describe('endpoint resolution', () => {
    it('keeps the default endpoint when the caller passes endpoint: undefined', async () => {
      setup();
      expect(await endpointFor({ endpoint: undefined })).toBe('https://api.test/tus');
    });

    it('resolves a relative endpoint, with or without leading slash, against the API', async () => {
      setup({ apiUrl: 'https://api.test/' });
      expect(await endpointFor({ endpoint: '/files/upload' })).toBe('https://api.test/files/upload');
      expect(await endpointFor({ endpoint: 'tus' })).toBe('https://api.test/tus');
    });

    it('routes through the dev proxy prefix in proxy mode', async () => {
      setup({ apiProxy: true });
      expect(await endpointFor({ endpoint: '/tus' })).toBe('/api/tus');
    });

    it('leaves absolute and protocol-relative endpoints unchanged', async () => {
      setup();
      expect(await endpointFor({ endpoint: 'https://uploads.example.com/tus' })).toBe('https://uploads.example.com/tus');
      expect(await endpointFor({ endpoint: '//uploads.example.com/tus' })).toBe('//uploads.example.com/tus');
    });

    it('keeps a relative endpoint on the app origin when resolveAgainstApi is false', async () => {
      setup({}, { tus: { resolveAgainstApi: false } });
      expect(await endpointFor()).toBe('/tus');
      expect(await endpointFor({ endpoint: '/files/upload' })).toBe('/files/upload');
    });

    it('keeps the relative path and warns once when no API URL is configured', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      setup({ apiUrl: '' });
      expect(await endpointFor()).toBe('/tus');
      expect(await endpointFor()).toBe('/tus');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('NG_PUBLIC_API_URL');
    });
  });

  describe('requests', () => {
    function request(): { headers: Record<string, string>; req: Parameters<NonNullable<LtTusClientUploadOptions['onBeforeRequest']>>[0]; xhr: { withCredentials: boolean } } {
      const headers: Record<string, string> = {};
      const xhr = { withCredentials: false };
      return { headers, req: { getUnderlyingObject: () => xhr, setHeader: (name, value) => (headers[name] = value) }, xhr };
    }

    it('sends the session cookie (withCredentials) and no Bearer token in cookie mode', async () => {
      setup();
      jwt = 'token-1';
      await create({ autoStart: false }).addFiles(file());
      const { headers, req, xhr } = request();
      last().options.onBeforeRequest?.(req);
      expect(xhr.withCredentials).toBe(true);
      expect(headers).toEqual({});
    });

    it('adds the JWT as Bearer token in JWT mode, read per request', async () => {
      setup();
      authMode = 'jwt';
      jwt = 'token-1';
      await create({ autoStart: false }).addFiles(file());
      const first = request();
      last().options.onBeforeRequest?.(first.req);
      jwt = 'token-2';
      const second = request();
      last().options.onBeforeRequest?.(second.req);
      expect(first.headers).toEqual({ Authorization: 'Bearer token-1' });
      expect(second.headers).toEqual({ Authorization: 'Bearer token-2' });
    });

    it('keeps an Authorization header the caller set', async () => {
      setup();
      authMode = 'jwt';
      jwt = 'token-1';
      await create({ autoStart: false, headers: { authorization: 'Custom x' } }).addFiles(file());
      const { headers, req } = request();
      last().options.onBeforeRequest?.(req);
      expect(headers).toEqual({});
    });

    it('does not retry on 4xx except 429', async () => {
      setup();
      await create({ autoStart: false }).addFiles(file());
      const shouldRetry = (status?: number) => last().options.onShouldRetry?.(detailedError(status), 0, {});
      expect(shouldRetry(400)).toBe(false);
      expect(shouldRetry(403)).toBe(false);
      expect(shouldRetry(413)).toBe(false);
      expect(shouldRetry(429)).toBe(true);
      expect(shouldRetry(500)).toBe(true);
      expect(shouldRetry(undefined)).toBe(true);
    });
  });

  describe('fileId', () => {
    it('reads the stored file id from the X-File-Id header of the completing response', async () => {
      setup();
      const upload = create({ autoStart: false });
      await upload.addFiles(file());
      last().finish([{}, { 'X-File-Id': '6650a1b2c3d4e5f6a7b8c9d0' }]);
      expect(upload.uploads()[0]).toMatchObject({ fileId: '6650a1b2c3d4e5f6a7b8c9d0', status: 'completed', url: 'https://api.test/tus/upload-1' });
      expect(upload.uploads()[0]?.completedAt).toBeInstanceOf(Date);
      expect(upload.uploads()[0]?.progress).toMatchObject({ bytesUploaded: 1000, percentage: 100, speed: 0 });
    });

    it('hands the item with its fileId to onSuccess', async () => {
      setup();
      const onSuccess = vi.fn();
      await create({ autoStart: false, onSuccess }).addFiles(file());
      last().finish([{ 'X-File-Id': 'file-1' }]);
      expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'file-1', status: 'completed' }));
    });

    it('leaves fileId undefined when the backend sends no X-File-Id header', async () => {
      setup();
      const upload = create({ autoStart: false });
      await upload.addFiles(file());
      last().finish([{}, {}]);
      expect(upload.uploads()[0]?.status).toBe('completed');
      expect(upload.uploads()[0]?.fileId).toBeUndefined();
    });
  });

  describe('queue', () => {
    it('starts right away by default, also with autoStart: undefined', async () => {
      setup();
      const upload = create({ autoStart: undefined });
      const ids = await upload.addFiles(file());
      await flush();
      expect(ids).toHaveLength(1);
      expect(upload.getUpload(ids[0]!)?.status).toBe('uploading');
      expect(upload.getUpload(ids[0]!)?.startedAt).toBeInstanceOf(Date);
      expect(upload.isUploading()).toBe(true);
      expect(last().started).toBe(1);
    });

    it('keeps uploads idle with autoStart: false until started', async () => {
      setup();
      const upload = create({ autoStart: false });
      const [id] = await upload.addFiles([file()]);
      expect(upload.uploads()[0]?.status).toBe('idle');
      expect(last().started).toBe(0);

      upload.startUpload(id!);
      await flush();
      expect(last().started).toBe(1);
    });

    it('runs at most parallelUploads at once and starts the next when one finishes', async () => {
      setup();
      const upload = create({ parallelUploads: 2 });
      await upload.addFiles([file('1'), file('2'), file('3'), file('4')]);
      await flush();
      expect(upload.uploads().map((item) => item.status)).toEqual(['uploading', 'uploading', 'idle', 'idle']);

      FakeUpload.created[0]!.finish();
      await flush();
      expect(upload.uploads().map((item) => item.status)).toEqual(['completed', 'uploading', 'uploading', 'idle']);

      FakeUpload.created[1]!.options.onError?.(new Error('boom'));
      await flush();
      expect(upload.uploads().map((item) => item.status)).toEqual(['completed', 'error', 'uploading', 'uploading']);
    });

    it('startAll() starts idle uploads up to the limit', async () => {
      setup();
      const upload = create({ autoStart: false, parallelUploads: 3 });
      await upload.addFiles([file('1'), file('2'), file('3'), file('4')]);
      upload.startAll();
      await flush();
      expect(upload.uploads().filter((item) => item.status === 'uploading')).toHaveLength(3);
    });

    it('adding files does not resume a paused upload', async () => {
      setup();
      const upload = create();
      const [first] = await upload.addFiles(file('1'));
      await flush();
      upload.pauseUpload(first!);
      await upload.addFiles(file('2'));
      await flush();
      expect(upload.uploads().map((item) => item.status)).toEqual(['paused', 'uploading']);
    });

    it('ignores an empty file list', async () => {
      setup();
      await expect(create().addFiles([])).resolves.toEqual([]);
      expect(FakeUpload.created).toHaveLength(0);
    });
  });

  describe('pause, resume, retry, cancel', () => {
    it('pauses an upload (abort) and resumes it', async () => {
      setup();
      const upload = create();
      const [id] = await upload.addFiles(file());
      await flush();

      upload.pauseUpload(id!);
      expect(last().aborted).toBe(1);
      expect(upload.getUpload(id!)?.status).toBe('paused');
      expect(upload.isUploading()).toBe(false);

      upload.resumeUpload(id!);
      await flush();
      expect(upload.getUpload(id!)?.status).toBe('uploading');
      expect(last().started).toBe(2);
    });

    it('does not start an upload that was paused while looking for a previous upload', async () => {
      setup();
      const upload = create();
      const [id] = await upload.addFiles(file());
      upload.pauseUpload(id!);
      await flush();
      expect(last().started).toBe(0);
    });

    it('pauseAll() and resumeAll() act on the matching uploads only', async () => {
      setup();
      const upload = create();
      await upload.addFiles([file('1'), file('2')]);
      await flush();
      FakeUpload.created[0]!.finish();

      upload.pauseAll();
      expect(upload.uploads().map((item) => item.status)).toEqual(['completed', 'paused']);
      upload.resumeAll();
      await flush();
      expect(upload.uploads().map((item) => item.status)).toEqual(['completed', 'uploading']);
    });

    it('ignores pausing a completed upload', async () => {
      setup();
      const upload = create({ autoStart: false });
      const [id] = await upload.addFiles(file());
      last().finish();
      upload.pauseUpload(id!);
      expect(upload.getUpload(id!)?.status).toBe('completed');
    });

    it('resumes an interrupted upload of the same file from the latest previous upload', async () => {
      FakeUpload.previous = [{ creationTime: '2026-01-01T00:00:00Z' }, { creationTime: '2026-03-01T00:00:00Z' }];
      setup();
      await create().addFiles(file());
      await flush();
      expect(last().resumedFrom).toEqual({ creationTime: '2026-03-01T00:00:00Z' });
      expect(last().started).toBe(1);
    });

    it('does not look for previous uploads again when the upload already has its URL', async () => {
      setup();
      const upload = create();
      const [id] = await upload.addFiles(file());
      await flush();
      last().url = 'https://api.test/tus/abc';
      upload.pauseUpload(id!);
      upload.resumeUpload(id!);
      await flush();
      expect(last().lookups).toBe(1);
      expect(last().started).toBe(2);
    });

    it('marks a failed upload, calls onError and retries it', async () => {
      setup();
      const onError = vi.fn();
      const upload = create({ onError });
      const [id] = await upload.addFiles(file());
      await flush();
      const error = new Error('tus: failed to upload chunk');
      last().options.onError?.(error);

      expect(upload.getUpload(id!)).toMatchObject({ error: 'tus: failed to upload chunk', status: 'error' });
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ id, status: 'error' }), error);

      upload.retryUpload(id!);
      await flush();
      expect(upload.getUpload(id!)?.status).toBe('uploading');
      expect(upload.getUpload(id!)?.error).toBeUndefined();
      expect(last().started).toBe(2);
    });

    it('retries only failed uploads', async () => {
      setup();
      const upload = create({ autoStart: false });
      const [id] = await upload.addFiles(file());
      upload.retryUpload(id!);
      await flush();
      expect(last().started).toBe(0);
    });

    it('cancels and removes uploads', async () => {
      setup();
      const upload = create();
      const [first, second, third] = await upload.addFiles([file('1'), file('2'), file('3')]);
      await flush();

      upload.cancelUpload(first!);
      expect(FakeUpload.created[0]!.aborted).toBe(1);
      expect(upload.getUpload(first!)).toBeUndefined();

      upload.removeUpload(second!);
      expect(upload.uploads().map((item) => item.id)).toEqual([third]);

      upload.cancelAll();
      expect(upload.uploads()).toEqual([]);
    });

    it('clearCompleted() removes only completed uploads', async () => {
      setup();
      const upload = create({ autoStart: false });
      await upload.addFiles([file('1'), file('2')]);
      FakeUpload.created[0]!.finish();
      upload.clearCompleted();
      expect(upload.uploads().map((item) => item.file.name)).toEqual(['2']);
    });
  });

  describe('progress', () => {
    it('tracks percentage, smoothed speed (EMA 0.7/0.3) and remaining time, and aggregates them', async () => {
      setup();
      const now = vi.spyOn(Date, 'now').mockReturnValue(0);
      const onProgress = vi.fn();
      const upload = create({ onProgress });
      const [id] = await upload.addFiles([file('a', 10000), file('b', 10000)]);
      await flush();

      now.mockReturnValue(1000);
      last().options.onProgress?.(1000, 10000);
      expect(upload.getUpload(upload.uploads()[1]!.id)?.progress).toEqual({ bytesTotal: 10000, bytesUploaded: 1000, percentage: 10, remainingTime: 9, speed: 1000 });

      now.mockReturnValue(2000);
      last().options.onProgress?.(3000, 10000);
      expect(upload.uploads()[1]?.progress).toMatchObject({ bytesUploaded: 3000, percentage: 30, remainingTime: 6, speed: 1300 });
      expect(onProgress).toHaveBeenCalledTimes(2);

      expect(upload.totalProgress()).toEqual({ bytesTotal: 20000, bytesUploaded: 3000, percentage: 15, remainingTime: 14, speed: 1300 });
      expect(upload.getUpload(id!)?.progress.bytesUploaded).toBe(0);
    });

    it('reports zero progress for an empty queue and a zero-byte file', async () => {
      setup();
      const upload = create();
      expect(upload.totalProgress()).toEqual({ bytesTotal: 0, bytesUploaded: 0, percentage: 0, remainingTime: 0, speed: 0 });
      await upload.addFiles(new File([], 'empty.txt'));
      await flush();
      last().options.onProgress?.(0, 0);
      expect(upload.uploads()[0]?.progress.percentage).toBe(0);
    });

    it('resets the speed on pause', async () => {
      setup();
      const now = vi.spyOn(Date, 'now').mockReturnValue(0);
      const upload = create();
      const [id] = await upload.addFiles(file('a', 10000));
      await flush();
      now.mockReturnValue(1000);
      last().options.onProgress?.(1000, 10000);
      upload.pauseUpload(id!);
      expect(upload.getUpload(id!)?.progress).toMatchObject({ bytesUploaded: 1000, speed: 0 });
    });
  });

  it('aborts running uploads when the injection context is destroyed', async () => {
    setup();
    const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    const upload = runInInjectionContext(injector, () => injectLtTusUpload());
    await upload.addFiles([file('1'), file('2')]);
    await flush();

    injector.destroy();

    expect(FakeUpload.created.map((created) => created.aborted)).toEqual([1, 1]);
    await expect(upload.addFiles(file('3'))).resolves.toEqual([]);
  });

  it('reads options with getters whenever a file is added', async () => {
    setup();
    let endpoint = '/first';
    const options: LtUploadOptions = { autoStart: false };
    Object.defineProperty(options, 'endpoint', { enumerable: true, get: () => endpoint });
    const upload = create(options);
    await upload.addFiles(file());
    endpoint = '/second';
    await upload.addFiles(file());
    expect(FakeUpload.created.map((created) => created.options.endpoint)).toEqual(['https://api.test/first', 'https://api.test/second']);
  });

  it('rejects addFiles with an install hint when tus-js-client is missing', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.test' }) },
        { provide: LT_TUS_CLIENT_LOADER, useValue: () => Promise.reject(new Error(LT_TUS_CLIENT_MISSING_MESSAGE)) },
      ],
    });
    const upload = create();
    await expect(upload.addFiles(file())).rejects.toThrow(/tus-js-client is not installed/);
    expect(upload.uploads()).toEqual([]);
  });

  // A cold import of the real package through the test build: it checks that the lazy load works, not how fast it is,
  // and took over the 5 s default under a loaded machine (load average 80, 2026-11-07).
  it('loads the real tus-js-client lazily', { timeout: 30_000 }, async () => {
    const client = await loadLtTusClient();
    expect(typeof client.Upload).toBe('function');
    expect(await loadLtTusClient()).toBe(client);
  });
});
