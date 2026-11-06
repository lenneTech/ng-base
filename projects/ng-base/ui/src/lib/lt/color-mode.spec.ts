import { PLATFORM_ID, REQUEST } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LtCookieService, LtI18nService } from '@lenne.tech/ng-base';

import { LT_COLOR_MODE_COOKIE, LtColorModeService } from '@lenne.tech/ng-base/ui/provide';
import { LtColorModeButton } from './color-mode-button';

interface FakeMediaQuery {
  matches: boolean;
  listener?: (event: MediaQueryListEvent) => void;
  addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => void;
  removeEventListener: () => void;
}

function fakeMatchMedia(matches: boolean): FakeMediaQuery {
  const query: FakeMediaQuery = {
    matches,
    addEventListener: (_type, listener) => (query.listener = listener),
    removeEventListener: vi.fn(),
  };
  vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList);
  return query;
}

function clearCookie(): void {
  document.cookie = `${LT_COLOR_MODE_COOKIE}=; path=/; max-age=0`;
}

describe('LtColorModeService (browser)', () => {
  const root = document.documentElement;

  beforeEach(() => {
    clearCookie();
    root.classList.remove('dark');
    root.style.colorScheme = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCookie();
    root.classList.remove('dark');
  });

  it('defaults to system and follows prefers-color-scheme', () => {
    const query = fakeMatchMedia(true);
    const service = TestBed.inject(LtColorModeService);
    expect(service.mode()).toBe('system');
    expect(service.resolved()).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.colorScheme).toBe('dark');

    query.listener?.({ matches: false } as MediaQueryListEvent);
    expect(service.resolved()).toBe('light');
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.colorScheme).toBe('light');
  });

  it('reads the preference from the cookie', () => {
    fakeMatchMedia(false);
    document.cookie = `${LT_COLOR_MODE_COOKIE}=dark; path=/`;
    const service = TestBed.inject(LtColorModeService);
    expect(service.mode()).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('falls back to system for unknown cookie values', () => {
    fakeMatchMedia(false);
    document.cookie = `${LT_COLOR_MODE_COOKIE}=sepia; path=/`;
    expect(TestBed.inject(LtColorModeService).mode()).toBe('system');
  });

  it('persists setMode in a one-year lax cookie on path /', () => {
    fakeMatchMedia(false);
    const set = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: LtCookieService, useValue: { get: () => null, set } }] });
    const service = TestBed.inject(LtColorModeService);
    service.setMode('dark');
    expect(set).toHaveBeenCalledWith(LT_COLOR_MODE_COOKIE, 'dark', { maxAge: 31536000, path: '/', sameSite: 'lax' });
    expect(service.mode()).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('writes the cookie to the document and ignores the system scheme outside system mode', () => {
    const query = fakeMatchMedia(true);
    const service = TestBed.inject(LtColorModeService);
    service.setMode('light');
    expect(document.cookie).toContain(`${LT_COLOR_MODE_COOKIE}=light`);
    query.listener?.({ matches: true } as MediaQueryListEvent);
    expect(service.resolved()).toBe('light');
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('toggles between light and dark from the resolved mode', () => {
    fakeMatchMedia(false);
    const service = TestBed.inject(LtColorModeService);
    service.toggle();
    expect(service.mode()).toBe('dark');
    service.toggle();
    expect(service.mode()).toBe('light');
  });
});

function requestStub(headers: Record<string, string>): Request {
  const lower = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  return { headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null } } as unknown as Request;
}

describe('LtColorModeService (server)', () => {
  const root = document.documentElement;

  function setupServer(cookie: string, headers: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        // A stub: happy-dom's Request drops forbidden headers such as `cookie` and `Sec-*`.
        { provide: REQUEST, useValue: requestStub({ cookie, ...headers }) },
      ],
    });
    return TestBed.inject(LtColorModeService);
  }

  afterEach(() => root.classList.remove('dark'));

  it('sets .dark on the SSR document from the request cookie', () => {
    const service = setupServer(`${LT_COLOR_MODE_COOKIE}=dark`);
    expect(service.resolved()).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('clears .dark for a light preference and never writes cookies', () => {
    root.classList.add('dark');
    const cookie = vi.spyOn(Document.prototype, 'cookie', 'set');
    const service = setupServer(`${LT_COLOR_MODE_COOKIE}=light`);
    expect(root.classList.contains('dark')).toBe(false);
    service.setMode('dark');
    expect(cookie).not.toHaveBeenCalled();
    expect(root.classList.contains('dark')).toBe(true);
    cookie.mockRestore();
  });

  it('uses the Sec-CH-Prefers-Color-Scheme hint in system mode', () => {
    const service = setupServer('', { 'sec-ch-prefers-color-scheme': 'dark' });
    expect(service.mode()).toBe('system');
    expect(service.resolved()).toBe('dark');
  });
});

describe('LtColorModeButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearCookie();
    document.documentElement.classList.remove('dark');
  });

  it('is a labelled toggle button that switches the mode', async () => {
    fakeMatchMedia(false);
    TestBed.inject(LtI18nService).setLocale('de');
    const fixture = TestBed.createComponent(LtColorModeButton);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Dunkles Farbschema');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('type')).toBe('button');
    expect(fixture.nativeElement.querySelector('ng-icon')?.getAttribute('aria-hidden')).toBe('true');

    button.click();
    await fixture.whenStable();
    expect(TestBed.inject(LtColorModeService).mode()).toBe('dark');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('uses the size input for the helm button size', async () => {
    fakeMatchMedia(false);
    const fixture = TestBed.createComponent(LtColorModeButton);
    fixture.componentRef.setInput('size', 'icon-sm');
    await fixture.whenStable();
    expect((fixture.nativeElement.querySelector('button') as HTMLElement).className).toContain('size-8');
  });
});
