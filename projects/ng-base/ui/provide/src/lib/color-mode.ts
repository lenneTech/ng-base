import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { computed, DestroyRef, inject, PLATFORM_ID, REQUEST, Service, signal } from '@angular/core';
import { LtCookieService } from '@lenne.tech/ng-base';

/** Color mode preference. */
export type LtColorMode = 'dark' | 'light' | 'system';

/** Cookie holding the preference (read during SSR so the first paint has the right theme). */
export const LT_COLOR_MODE_COOKIE = 'lt-color-mode';

/**
 * Inline script for `<head>` (before any stylesheet) that sets `.dark` on `<html>` from the cookie or
 * `prefers-color-scheme` before the first paint, so dark mode never flashes light.
 */
export const LT_COLOR_MODE_SCRIPT = `(function(){try{var m=(document.cookie.match(/(?:^|; )${LT_COLOR_MODE_COOKIE}=([^;]*)/)||[])[1]||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

/** Lifetime of the preference cookie (one year, in seconds). */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Light / dark / system color mode: toggles `.dark` on `<html>` (Tailwind `dark:` variant and the theme tokens),
 * persists the preference in a cookie (SSR reads it), follows `prefers-color-scheme` in `system` mode.
 *
 * - Server: reads the preference from the request cookie and sets or clears `.dark` on the rendered document, so the
 *   HTML arrives with the right theme. In `system` mode the server only knows the scheme when the browser sends the
 *   `Sec-CH-Prefers-Color-Scheme` client hint (the app opts in with `Accept-CH`); otherwise `LT_COLOR_MODE_SCRIPT`
 *   fixes it before the first paint.
 * - Browser: toggles the class and `color-scheme` on `<html>` and listens to `prefers-color-scheme` changes.
 *
 * The class is applied as soon as the service exists (an `lt-color-mode-button` creates it). When the app renders no
 * button, create it at startup: `provideAppInitializer(() => void inject(LtColorModeService))`.
 */
@Service()
export class LtColorModeService {
  private readonly document = inject(DOCUMENT);
  private readonly cookies = inject(LtCookieService);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly modeState = signal<LtColorMode>(parseLtColorMode(this.cookies.get(LT_COLOR_MODE_COOKIE)));
  private readonly systemDark = signal(false);

  /** The preference. */
  readonly mode = this.modeState.asReadonly();
  /** The effective mode. */
  readonly resolved = computed<'dark' | 'light'>(() => {
    const mode = this.modeState();
    if (mode === 'system') {
      return this.systemDark() ? 'dark' : 'light';
    }
    return mode;
  });

  constructor() {
    if (this.isBrowser) {
      this.listenToSystemScheme();
    } else {
      this.systemDark.set(this.request?.headers.get('sec-ch-prefers-color-scheme')?.toLowerCase() === 'dark');
    }
    this.apply();
  }

  /** Set the preference (persisted for one year in the `lt-color-mode` cookie). */
  setMode(mode: LtColorMode): void {
    this.modeState.set(mode);
    this.cookies.set(LT_COLOR_MODE_COOKIE, mode, { maxAge: COOKIE_MAX_AGE, path: '/', sameSite: 'lax' });
    this.apply();
  }

  /** Switch between light and dark (leaves `system`). */
  toggle(): void {
    this.setMode(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  private listenToSystemScheme(): void {
    const view = this.document.defaultView;
    if (!view || typeof view.matchMedia !== 'function') {
      return;
    }
    const query = view.matchMedia(DARK_QUERY);
    this.systemDark.set(query.matches);
    const listener = (event: MediaQueryListEvent) => {
      this.systemDark.set(event.matches);
      this.apply();
    };
    query.addEventListener?.('change', listener);
    inject(DestroyRef).onDestroy(() => query.removeEventListener?.('change', listener));
  }

  /** Write the resolved mode to `<html>` (server: the SSR document; browser: the live document). */
  private apply(): void {
    const root = this.document.documentElement;
    if (!root) {
      return;
    }
    const dark = this.resolved() === 'dark';
    root.classList.toggle('dark', dark);
    try {
      root.style.colorScheme = dark ? 'dark' : 'light';
    } catch {
      // The server DOM may not implement `style.colorScheme`; the class is what the theme relies on.
    }
  }
}

/** Parse a stored preference; unknown values fall back to `system`. */
function parseLtColorMode(value: string | null): LtColorMode {
  return value === 'dark' || value === 'light' || value === 'system' ? value : 'system';
}
