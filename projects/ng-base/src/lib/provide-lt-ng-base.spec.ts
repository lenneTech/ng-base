import { ApplicationInitStatus, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LtErrorTranslationService } from './error-translation';
import { provideLtNgBase } from './provide-lt-ng-base';

describe('provideLtNgBase — error translation preload', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('never holds the app start: a hanging /i18n/errors request runs in the background, with a timeout', async () => {
    let init: RequestInit | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, options?: RequestInit) => {
      init = options;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideLtNgBase({ configCheck: false, preHydrationInput: { enabled: false }, runtime: { apiProxy: false, apiUrl: 'https://api.example.com' } }),
      ],
    });
    const started = await Promise.race([TestBed.inject(ApplicationInitStatus).donePromise.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 200))]);
    expect(started).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/^https:\/\/api\.example\.com\/i18n\/errors\/(de|en)$/);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(TestBed.inject(LtErrorTranslationService).isLoading()).toBe(true);
  });
});
