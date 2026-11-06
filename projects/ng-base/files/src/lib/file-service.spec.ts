import { TestBed } from '@angular/core/testing';
import { LT_FETCH, LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig, type LtRuntimeConfig } from '@lenne.tech/ng-base';

import { formatLtDuration, formatLtFileSize, isLtMongoId, LtFileService } from './file-service';
import { LT_FILES_DEFAULTS, LT_FILES_OPTIONS, provideLtFiles, type LtFilesOptions } from './files-options';

const ID = '6650a1b2c3d4e5f6a7b8c9d0';

describe('LtFileService', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  function setup(runtime: Partial<LtRuntimeConfig> = {}, options?: LtFilesOptions): LtFileService {
    TestBed.configureTestingModule({
      providers: [
        { provide: LT_FETCH, useValue: fetchMock },
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.test', ...runtime }) },
        ...(options ? [provideLtFiles(options)] : []),
      ],
    });
    return TestBed.inject(LtFileService);
  }

  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  describe('URLs', () => {
    it('resolves file and download URLs against the API', () => {
      const files = setup();
      expect(files.getFileUrl(ID)).toBe(`https://api.test/files/id/${ID}`);
      expect(files.getDownloadUrl(ID)).toBe(`https://api.test/files/id/${ID}`);
      expect(files.getDownloadUrl(ID, 'a b.pdf')).toBe(`https://api.test/files/id/${ID}`);
    });

    it('does not derive the file routes from the TUS endpoint', () => {
      const files = setup({}, { tus: { defaultEndpoint: '/tus' } });
      expect(files.getFileUrl('abc')).toBe('https://api.test/files/id/abc');
    });

    it('uses a configured filesBasePath, also an absolute one', () => {
      expect(setup({}, { filesBasePath: '/storage/' }).getFileUrl('abc')).toBe('https://api.test/storage/id/abc');
      TestBed.resetTestingModule();
      expect(setup({}, { filesBasePath: 'https://cdn.example.com/files' }).getFileUrl('abc')).toBe('https://cdn.example.com/files/id/abc');
    });

    it('goes through the dev proxy in proxy mode', () => {
      expect(setup({ apiProxy: true }).getFileUrl('abc')).toBe('/api/files/id/abc');
    });

    it('encodes the id segment', () => {
      expect(setup().getFileUrl('a/b')).toBe('https://api.test/files/id/a%2Fb');
    });
  });

  describe('getFileInfo', () => {
    it('fetches the file info with credentials from the API', async () => {
      const info = { filename: 'a.pdf', id: ID, mimetype: 'application/pdf', size: 12 };
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(info), { status: 200 }));
      const files = setup();

      await expect(files.getFileInfo(ID)).resolves.toEqual(info);

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`https://api.test/files/info/${ID}`);
      expect(init).toMatchObject({ credentials: 'include', method: 'GET' });
    });

    it('returns null for an empty id without a request', async () => {
      const files = setup();
      await expect(files.getFileInfo(undefined)).resolves.toBeNull();
      await expect(files.getFileInfo('')).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns a non-ObjectId string (e.g. a URL) as is', async () => {
      await expect(setup().getFileInfo('https://example.com/a.png')).resolves.toBe('https://example.com/a.png');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns null on an error status or a network error', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const files = setup();
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }));
      await expect(files.getFileInfo(ID)).resolves.toBeNull();
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(files.getFileInfo(ID)).resolves.toBeNull();
    });
  });

  it('delegates the format helpers', () => {
    const files = setup();
    expect(files.formatFileSize(1536)).toBe('1.5 KB');
    expect(files.formatDuration(125)).toBe('2m 5s');
    expect(files.isValidMongoID(ID)).toBe(true);
  });
});

describe('format helpers', () => {
  it('formats file sizes 1024-based with two decimals', () => {
    expect(formatLtFileSize(0)).toBe('0 B');
    expect(formatLtFileSize(-5)).toBe('0 B');
    expect(formatLtFileSize(1023)).toBe('1023 B');
    expect(formatLtFileSize(1024)).toBe('1 KB');
    expect(formatLtFileSize(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatLtFileSize(1024 ** 5)).toBe('1024 TB');
  });

  it('formats durations', () => {
    expect(formatLtDuration(45)).toBe('45s');
    expect(formatLtDuration(125)).toBe('2m 5s');
    expect(formatLtDuration(3780)).toBe('1h 3m');
    expect(formatLtDuration(Number.NaN)).toBe('0s');
  });

  it('recognises MongoDB ObjectIds', () => {
    expect(isLtMongoId(ID)).toBe(true);
    expect(isLtMongoId(ID.toUpperCase())).toBe(true);
    expect(isLtMongoId('abc')).toBe(false);
    expect(isLtMongoId(`${ID}0`)).toBe(false);
  });
});

describe('LT_FILES_OPTIONS', () => {
  function resolve(options?: LtFilesOptions, runtime: Partial<LtRuntimeConfig> = {}) {
    TestBed.configureTestingModule({
      providers: [{ provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, runtime) }, ...(options ? [provideLtFiles(options)] : [])],
    });
    return TestBed.inject(LT_FILES_OPTIONS);
  }

  it('defaults to /tus, 5 MB chunks, resolveAgainstApi true and /files', () => {
    expect(resolve()).toEqual(LT_FILES_DEFAULTS);
    expect(LT_FILES_DEFAULTS.tus).toEqual({ defaultChunkSize: 5 * 1024 * 1024, defaultEndpoint: '/tus', resolveAgainstApi: true });
  });

  it('keeps resolveAgainstApi: false from the code options', () => {
    expect(resolve({ tus: { resolveAgainstApi: false } }).tus.resolveAgainstApi).toBe(false);
  });

  it('lets the runtime config (NG_PUBLIC_LT_TUS_*) override the code options', () => {
    const options = resolve({ tus: { defaultEndpoint: '/code' } }, { lt: { tus: { defaultEndpoint: '/runtime', resolveAgainstApi: false } } });
    expect(options.tus).toEqual({ defaultChunkSize: 5 * 1024 * 1024, defaultEndpoint: '/runtime', resolveAgainstApi: false });
  });

  it('ignores undefined values', () => {
    expect(resolve({ filesBasePath: undefined, tus: { defaultEndpoint: undefined } })).toEqual(LT_FILES_DEFAULTS);
  });
});
