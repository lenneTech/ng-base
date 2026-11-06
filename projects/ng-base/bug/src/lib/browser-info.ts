import type { LtBrowserInfo } from './bug-types';
import { redactLtUrl } from './redact';

const BROWSERS: readonly { name: string; regex: RegExp }[] = [
  { name: 'Edge', regex: /Edg(?:e|A|iOS)?\/([\d.]+)/ },
  { name: 'Opera', regex: /(?:OPR|Opera)\/([\d.]+)/ },
  { name: 'Firefox', regex: /(?:Firefox|FxiOS)\/([\d.]+)/ },
  { name: 'Chrome', regex: /(?:Chrome|CriOS)\/([\d.]+)/ },
  { name: 'Safari', regex: /Version\/([\d.]+).*Safari/ },
];

const SYSTEMS: readonly { name: string; regex: RegExp }[] = [
  { name: 'Windows', regex: /Windows NT ([\d.]+)/ },
  { name: 'Android', regex: /Android ([\d.]+)/ },
  { name: 'iOS', regex: /(?:iPhone|iPad|iPod).*? OS ([\d_]+)/ },
  { name: 'macOS', regex: /Mac OS X ([\d_.]+)/ },
  { name: 'Linux', regex: /Linux/ },
];

/** Browser name and version from a user agent (Edge and Opera before Chrome, Safari by its `Version/`). */
export function detectLtBrowser(userAgent: string): { name: string; version: string } {
  for (const browser of BROWSERS) {
    const match = browser.regex.exec(userAgent);
    if (match) {
      return { name: browser.name, version: match[1] ?? 'Unknown' };
    }
  }
  return { name: 'Unknown', version: 'Unknown' };
}

/** Operating system from a user agent (iOS before macOS, Android before Linux). */
export function detectLtOs(userAgent: string): { name: string; version: string } {
  for (const system of SYSTEMS) {
    const match = system.regex.exec(userAgent);
    if (match) {
      return { name: system.name, version: match[1] ? match[1].replace(/_/g, '.') : 'Unknown' };
    }
  }
  return { name: 'Unknown', version: 'Unknown' };
}

/**
 * Browser, OS, viewport, screen, locale and navigation timing of the current page. Page URL and referrer are redacted.
 * Throws outside the browser.
 */
export function getLtBrowserInfo(view: (Window & typeof globalThis) | null | undefined = typeof window === 'undefined' ? undefined : window): LtBrowserInfo {
  if (!view?.navigator) {
    throw new TypeError('Browser info collection is only available in the browser');
  }
  const { document, location, navigator, screen } = view;
  let timezone = 'Unknown';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
  } catch {
    // Keep 'Unknown'.
  }
  return {
    browser: detectLtBrowser(navigator.userAgent ?? ''),
    cookieEnabled: !!navigator.cookieEnabled,
    language: navigator.language,
    languages: navigator.languages?.length ? [...navigator.languages] : [navigator.language],
    onLine: !!navigator.onLine,
    os: detectLtOs(navigator.userAgent ?? ''),
    performance: performanceInfo(view),
    platform: navigator.platform ?? '',
    referrer: document?.referrer ? redactLtUrl(document.referrer) : '',
    screen: { colorDepth: screen?.colorDepth ?? 0, height: screen?.height ?? 0, pixelDepth: screen?.pixelDepth ?? 0, width: screen?.width ?? 0 },
    timestamp: new Date().toISOString(),
    timezone,
    title: document?.title ?? '',
    url: redactLtUrl(location?.href ?? ''),
    userAgent: navigator.userAgent ?? '',
    vendor: navigator.vendor ?? '',
    viewport: {
      height: view.innerHeight || document?.documentElement?.clientHeight || 0,
      width: view.innerWidth || document?.documentElement?.clientWidth || 0,
    },
  };
}

function performanceInfo(view: Window): LtBrowserInfo['performance'] {
  const performance = view.performance;
  if (!performance?.getEntriesByType) {
    return undefined;
  }
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (!navigation) {
    return undefined;
  }
  const paint = (name: string) => performance.getEntriesByName?.(name)[0]?.startTime ?? null;
  return {
    domComplete: navigation.domComplete,
    domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
    firstContentfulPaint: paint('first-contentful-paint'),
    firstPaint: paint('first-paint'),
    loadTime: navigation.loadEventEnd - navigation.loadEventStart,
    navigationStart: navigation.fetchStart,
    responseEnd: navigation.responseEnd,
  };
}
