import { LT_BUG_DEFAULT_ENDPOINT, LT_BUG_DEFAULTS, resolveLtBugOptions } from './bug-options';

describe('bug options', () => {
  it('use the defaults of @lenne.tech/bug.lt 1.6.9 (button color aside)', () => {
    expect(LT_BUG_DEFAULTS).toMatchObject({
      autoOpenOnError: false,
      autoShow: true,
      enableBrowserInfo: true,
      enableConsoleLogs: true,
      enableErrorBoundary: true,
      enableNetworkRequests: true,
      enableScreenshot: true,
      enableUserJourney: true,
      endpoint: '/_bug-lt/report',
      maxConsoleLogs: 50,
      maxNetworkRequests: 50,
      position: 'bottom-right',
      theme: 'auto',
    });
    expect(LT_BUG_DEFAULTS.userJourney).toEqual({
      captureClicks: true,
      captureErrors: true,
      captureFormInteractions: true,
      captureHover: false,
      captureInputChanges: false,
      captureInputValues: false,
      captureKeyboard: true,
      captureModalEvents: true,
      captureNavigation: true,
      captureScroll: false,
      enabled: true,
      maxEvents: 50,
      throttleRate: 100,
    });
    expect(LT_BUG_DEFAULTS.buttonColor).toBe('#dc2626');
  });

  it('merge code options over the defaults and user journey options per key', () => {
    const options = resolveLtBugOptions({ autoOpenOnError: true, buttonText: 'Bug', position: 'top-left', userJourney: { captureHover: true, maxEvents: 20 } });
    expect(options.autoOpenOnError).toBe(true);
    expect(options.position).toBe('top-left');
    expect(options.buttonText).toBe('Bug');
    expect(options.userJourney.captureHover).toBe(true);
    expect(options.userJourney.maxEvents).toBe(20);
    expect(options.userJourney.captureClicks).toBe(true);
  });

  it('apply runtime overrides (lt.bug) last and ignore undefined values', () => {
    const options = resolveLtBugOptions({ autoShow: true, maxConsoleLogs: 10 }, { autoShow: false, maxConsoleLogs: undefined });
    expect(options.autoShow).toBe(false);
    expect(options.maxConsoleLogs).toBe(10);
  });

  it('clamp ring buffer sizes and fall back to the default endpoint for invalid values', () => {
    const options = resolveLtBugOptions({
      endpoint: 'https://evil.example/collect',
      maxConsoleLogs: -5,
      maxNetworkRequests: 99_999,
      userJourney: { maxEvents: 0, throttleRate: -1 },
    });
    expect(options.endpoint).toBe(LT_BUG_DEFAULT_ENDPOINT);
    expect(options.maxConsoleLogs).toBe(50);
    expect(options.maxNetworkRequests).toBe(1000);
    expect(options.userJourney.maxEvents).toBe(50);
    expect(options.userJourney.throttleRate).toBe(0);
  });
});
