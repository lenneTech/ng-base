import { InjectionToken } from '@angular/core';

import type { LtBugTheme } from './bug-types';
import { LT_BUG_UI_ATTRIBUTE } from './constants';

/** The part of `modern-screenshot` the reporter uses (structural, so the peer stays optional). */
export interface LtScreenshotLibrary {
  domToPng(node: Node, options?: Record<string, unknown>): Promise<string>;
}

let library: Promise<LtScreenshotLibrary | null> | null = null;

/** Load the optional peer `modern-screenshot` once; resolves `null` when it is not installed. */
export function loadLtScreenshotLibrary(): Promise<LtScreenshotLibrary | null> {
  library ??= import('modern-screenshot').then(
    (module) => {
      const candidate = module as unknown as Partial<LtScreenshotLibrary> & { default?: Partial<LtScreenshotLibrary> };
      const resolved = typeof candidate.domToPng === 'function' ? candidate : candidate.default;
      return typeof resolved?.domToPng === 'function' ? (resolved as LtScreenshotLibrary) : null;
    },
    () => null,
  );
  return library;
}

/**
 * Loader of the screenshot library (default: lazy `import('modern-screenshot')`, `null` when the optional peer is
 * missing: the screenshot feature is then hidden). Replace it in tests.
 */
export const LT_BUG_SCREENSHOT_LOADER = new InjectionToken<() => Promise<LtScreenshotLibrary | null>>('LT_BUG_SCREENSHOT_LOADER', {
  factory: () => loadLtScreenshotLibrary,
});

/**
 * PNG data URL of the visible viewport (current scroll position, device pixel ratio up to 2), without the reporter's
 * own UI. The background follows `theme` (`auto`: `html.dark` / `html.light`, then `color-scheme`, then the system).
 */
export function captureLtBugScreenshot(lib: LtScreenshotLibrary, view: Window, theme: LtBugTheme): Promise<string> {
  const doc = view.document;
  const dark = theme === 'dark' || (theme === 'auto' && isLtDarkColorMode(view));
  return lib.domToPng(doc.documentElement, {
    backgroundColor: dark ? '#0a0a0a' : '#ffffff',
    features: { restoreScrollPosition: true },
    fetch: { bypassingCache: true, requestInit: { mode: 'cors' } },
    filter: (node: Node) => !(node.nodeType === 1 && (node as Element).hasAttribute?.(LT_BUG_UI_ATTRIBUTE)),
    height: view.innerHeight,
    scale: Math.min(view.devicePixelRatio || 1, 2),
    style: { transform: 'none', transformOrigin: 'top left' },
    width: view.innerWidth,
  });
}

/** Whether the page currently renders dark (`html.dark`, `html.light`, computed `color-scheme`, system preference). */
export function isLtDarkColorMode(view: Window): boolean {
  const root = view.document?.documentElement;
  if (root?.classList.contains('dark')) {
    return true;
  }
  if (root?.classList.contains('light')) {
    return false;
  }
  const scheme = root && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(root).colorScheme : '';
  if (scheme === 'dark' || scheme === 'light') {
    return scheme === 'dark';
  }
  return !!view.matchMedia?.('(prefers-color-scheme: dark)').matches;
}
