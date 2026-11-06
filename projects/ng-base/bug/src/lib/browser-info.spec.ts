import { detectLtBrowser, detectLtOs, getLtBrowserInfo } from './browser-info';

const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fakeWindow(overrides: Record<string, unknown> = {}): Window & typeof globalThis {
  return {
    document: { documentElement: { clientHeight: 0, clientWidth: 0 }, referrer: 'https://google.com/?q=x', title: 'Test Page Title' },
    innerHeight: 800,
    innerWidth: 1200,
    location: { href: 'https://example.com/test?param=1&token=abc' },
    navigator: { cookieEnabled: true, language: 'de-DE', languages: ['de-DE', 'en'], onLine: true, platform: 'MacIntel', userAgent: CHROME_MAC, vendor: 'Google Inc.' },
    performance: {
      getEntriesByName: (name: string) => (name === 'first-paint' ? [{ startTime: 1300 }] : name === 'first-contentful-paint' ? [{ startTime: 1400 }] : []),
      getEntriesByType: () => [
        { domComplete: 1800, domContentLoadedEventEnd: 1500, domContentLoadedEventStart: 1400, fetchStart: 1000, loadEventEnd: 2000, loadEventStart: 1900, responseEnd: 1200 },
      ],
    },
    screen: { colorDepth: 24, height: 1080, pixelDepth: 24, width: 1920 },
    ...overrides,
  } as unknown as Window & typeof globalThis;
}

describe('browser info', () => {
  it('collects browser information when a window is available (URL redacted)', () => {
    const info = getLtBrowserInfo(fakeWindow());
    expect(info).toMatchObject({
      browser: { name: 'Chrome', version: '120.0.0.0' },
      language: 'de-DE',
      os: { name: 'macOS', version: '10.15.7' },
      platform: 'MacIntel',
      title: 'Test Page Title',
      url: 'https://example.com/test?param=1&token=[redacted]',
      viewport: { height: 800, width: 1200 },
    });
    expect(info.performance).toEqual({
      domComplete: 1800,
      domContentLoaded: 100,
      firstContentfulPaint: 1400,
      firstPaint: 1300,
      loadTime: 100,
      navigationStart: 1000,
      responseEnd: 1200,
    });
  });

  it('throws when no window is available', () => {
    expect(() => getLtBrowserInfo(null)).toThrow('Browser info collection is only available in the browser');
  });

  it('handles missing performance data', () => {
    const info = getLtBrowserInfo(fakeWindow({ performance: undefined }));
    expect(info.userAgent).toBe(CHROME_MAC);
    expect(info.performance).toBeUndefined();
  });

  it('detects Edge, Safari, Firefox and iOS correctly (bug.lt reported them as Chrome/macOS)', () => {
    expect(detectLtBrowser(`${CHROME_MAC} Edg/120.0.2210.91`)).toEqual({ name: 'Edge', version: '120.0.2210.91' });
    expect(detectLtBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15')).toEqual({
      name: 'Safari',
      version: '17.2',
    });
    expect(detectLtBrowser('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0')).toEqual({ name: 'Firefox', version: '121.0' });
    expect(detectLtOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15')).toEqual({ name: 'iOS', version: '17.2' });
    expect(detectLtOs('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toEqual({ name: 'Android', version: '14' });
    expect(detectLtOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toEqual({ name: 'Windows', version: '10.0' });
  });
});
