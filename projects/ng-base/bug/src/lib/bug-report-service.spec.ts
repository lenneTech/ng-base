import { Component, ErrorHandler, type EnvironmentProviders, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, LT_TOAST_ADAPTER, LtI18nService, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';

import { LT_BUG_DEV_MODE } from './bug-options';
import { LtBugReportService, LtBugSubmitError } from './bug-report-service';
import type { LtBugOptions } from './bug-types';
import { provideLtBug } from '@lenne.tech/ng-base/bug/provide';
import { LT_BUG_SCREENSHOT_LOADER, type LtScreenshotLibrary } from './screenshot';

class RecordingErrorHandler extends ErrorHandler {
  readonly errors: unknown[] = [];
  override handleError(error: unknown): void {
    this.errors.push(error);
  }
}

@Component({ template: '' })
class EmptyPage {}

interface SetupOptions {
  appEnv?: string;
  bug?: LtBugOptions | null;
  devMode?: boolean;
  loader?: () => Promise<LtScreenshotLibrary | null>;
  providers?: (EnvironmentProviders | Provider)[];
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('LtBugReportService', () => {
  const originalFetch = window.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  let toast: { show: ReturnType<typeof vi.fn> };

  function setup(options: SetupOptions = {}): LtBugReportService {
    TestBed.configureTestingModule({
      providers: [
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { appEnv: 'appEnv' in options ? options.appEnv : 'test' }) },
        { provide: LT_BUG_DEV_MODE, useValue: options.devMode ?? false },
        { provide: LT_BUG_SCREENSHOT_LOADER, useValue: options.loader ?? (() => Promise.resolve(null)) },
        { provide: LT_TOAST_ADAPTER, useValue: toast },
        { provide: ErrorHandler, useClass: RecordingErrorHandler },
        ...(options.bug === null ? [] : [provideLtBug(options.bug ?? {})]),
        ...(options.providers ?? []),
      ],
    });
    TestBed.inject(LtI18nService).setLocale('de');
    const service = TestBed.inject(LtBugReportService);
    // What `<lt-bug-report>` does when it is created.
    service.start();
    return service;
  }

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response('{"success":true,"identifier":"DEV-1","issueId":"i1"}', { headers: { 'content-type': 'application/json' }, status: 200 }));
    window.fetch = fetchMock as unknown as typeof fetch;
    toast = { show: vi.fn(() => true) };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    window.fetch = originalFetch;
  });

  it('installs no capture hook (and loads no capture code) when the app env is production', async () => {
    const consoleLog = window.console.log;
    const service = setup({ appEnv: 'production', devMode: true });
    expect(service.active).toBe(false);
    expect(await service.whenReady()).toBe(false);
    expect(service.running).toBe(false);
    expect(window.fetch).toBe(fetchMock);
    expect(window.console.log).toBe(consoleLog);
    expect(Object.prototype.hasOwnProperty.call(TestBed.inject(ErrorHandler), 'handleError')).toBe(false);
  });

  it('fails closed: without app env it is off in a production build and on in dev mode', () => {
    const service = setup({ appEnv: undefined, devMode: false });
    expect(service.active).toBe(false);
    expect(window.fetch).toBe(fetchMock);
    TestBed.resetTestingModule();
    expect(setup({ appEnv: '', devMode: true }).active).toBe(true);
  });

  it('stays off without provideLtBug() and honours an explicit enabled', () => {
    expect(setup({ bug: null }).active).toBe(false);
    TestBed.resetTestingModule();
    expect(setup({ appEnv: 'production', bug: { enabled: true } }).active).toBe(true);
    TestBed.resetTestingModule();
    expect(setup({ appEnv: 'test', bug: { enabled: false } }).active).toBe(false);
  });

  it('loads the capture engine, installs the enabled hooks and removes them when the app is destroyed', async () => {
    const service = setup();
    expect(await service.whenReady()).toBe(true);
    expect(service.running).toBe(true);
    expect(window.fetch).not.toBe(fetchMock);
    window.console.info('captured line');
    await window.fetch('/api/items');
    expect(service.getConsoleLogs().some((log) => log.message.includes('captured line'))).toBe(true);
    expect(service.getNetworkRequests().map((request) => request.url)).toEqual(['/api/items']);
    TestBed.resetTestingModule();
    expect(window.fetch).toBe(fetchMock);
  });

  it('skips disabled features', async () => {
    const service = setup({ bug: { enableConsoleLogs: false, enableErrorBoundary: false, enableNetworkRequests: false, enableUserJourney: false } });
    await service.whenReady();
    expect(window.fetch).toBe(fetchMock);
    expect(Object.prototype.hasOwnProperty.call(TestBed.inject(ErrorHandler), 'handleError')).toBe(false);
    window.console.info('not captured');
    expect(service.getConsoleLogs()).toEqual([]);
    expect(service.getUserJourney()).toEqual([]);
    expect(
      await service.buildReport({ description: 'd', expectedBehavior: '', stepsToReproduce: '', title: 't', type: 'bug' }, [], {
        browserInfo: true,
        consoleLogs: true,
        networkRequests: true,
        userJourney: true,
      }),
    ).toEqual(expect.not.objectContaining({ consoleLogs: expect.anything() }));
  });

  it("wraps the app's ErrorHandler: the app handler keeps handling, the reporter keeps the last error", async () => {
    const service = setup();
    await service.whenReady();
    const handler = TestBed.inject(ErrorHandler) as RecordingErrorHandler;
    const error = new Error('Template broke');
    handler.handleError(error);
    expect(handler.errors).toEqual([error]);
    await flush();
    expect(service.lastError()?.message).toBe('Template broke');
    expect(service.lastError()?.componentName).toBe('ErrorHandler');
    expect(service.openRequested()).toBe(false);
    expect(service.getUserJourney().some((event) => event.type === 'error')).toBe(true);
  });

  it('requests the dialog on errors with autoOpenOnError and pre-fills from reportError()', async () => {
    const service = setup({ bug: { autoOpenOnError: true } });
    // Reported before the engine is loaded: handed over once it is.
    service.reportError(new Error('manual'), 'CheckoutPage');
    await service.whenReady();
    await flush();
    expect(service.openRequested()).toBe(true);
    expect(service.lastError()).toMatchObject({ componentName: 'CheckoutPage', message: 'manual' });
  });

  it('records router navigation in the user journey', async () => {
    const service = setup({ providers: [provideRouter([{ component: EmptyPage, path: 'orders' }])] });
    await service.whenReady();
    await TestBed.inject(Router).navigateByUrl('/orders?token=abc');
    const navigation = service.getUserJourney().filter((event) => event.type === 'navigation');
    expect(navigation.at(-1)?.target).toMatch(/\/orders\?token=\[redacted\]$/);
  });

  it('submits the report as JSON to the endpoint and shows a success toast', async () => {
    const service = setup();
    await service.whenReady();
    const response = await service.submit({ description: 'd', title: 't', type: 'bug' });
    expect(response.identifier).toBe('DEV-1');
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('/_bug-lt/report');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ description: 'd', title: 't', type: 'bug' });
    expect(toast.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'success', description: 'Ticket DEV-1 wurde angelegt.', title: 'Fehlerbericht gesendet' }));
    expect(service.isSubmitting()).toBe(false);
    expect(service.getNetworkRequests()).toEqual([]);
  });

  it('translates failures (404 = endpoint off) into the error signal and an error toast', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"success":false,"error":"Not Found"}', { status: 404 }));
    const service = setup();
    const failure = service.submit({ description: 'd', title: 't', type: 'bug' });
    await expect(failure).rejects.toBeInstanceOf(LtBugSubmitError);
    expect(service.error()).toBe('Fehlermeldungen sind auf diesem Server nicht aktiviert.');
    expect(toast.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'error', title: 'Fehlerbericht konnte nicht gesendet werden' }));
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(service.submit({ description: 'd', title: 't', type: 'bug' })).rejects.toThrow('Bitte versuchen Sie es später erneut.');
  });

  it('takes the screenshot through modern-screenshot without the reporter UI and pauses network capture', async () => {
    const domToPng = vi.fn(async () => {
      await window.fetch('/fonts/x.css?during-screenshot');
      return 'data:image/png;base64,AAAA';
    });
    const service = setup({ loader: () => Promise.resolve({ domToPng }) });
    await service.whenReady();
    await expect(service.captureScreenshot()).resolves.toBe('data:image/png;base64,AAAA');
    expect(service.screenshot()).toBe('data:image/png;base64,AAAA');
    expect(service.screenshotAvailable()).toBe(true);
    const options = (domToPng.mock.calls[0] as unknown[])[1] as { filter: (node: Node) => boolean };
    const own = document.createElement('div');
    own.setAttribute('data-lt-bug-ui', '');
    expect(options.filter(own)).toBe(false);
    expect(options.filter(document.createElement('p'))).toBe(true);
    expect(service.getNetworkRequests()).toEqual([]);
  });

  it('hides the screenshot when modern-screenshot is missing (no error)', async () => {
    const service = setup({ loader: () => Promise.resolve(null) });
    await expect(service.captureScreenshot()).resolves.toBeNull();
    expect(service.screenshotAvailable()).toBe(false);
    TestBed.resetTestingModule();
    const off = setup({ bug: { enableScreenshot: false }, loader: () => Promise.reject(new Error('must not load')) });
    await expect(off.captureScreenshot()).resolves.toBeNull();
  });
});
