import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';

/** Options of {@link LtScrollService.scrollTo}. */
export interface LtScrollOptions {
  /** Scroll behaviour (default `smooth`, `auto` when the user prefers reduced motion). */
  behavior?: ScrollBehavior;
  /** Focus the target after scrolling (default `false`). */
  focus?: boolean;
  /** Offset in pixels above the target, e.g. for a sticky header (default `0`). */
  offset?: number;
}

/** Scrolling helpers (browser only, no-ops on the server). */
@Service()
export class LtScrollService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Scroll to an element (id or element). Returns `false` when it does not exist. */
  scrollTo(target: string | Element, options: LtScrollOptions = {}): boolean {
    if (!this.isBrowser) {
      return false;
    }
    const element = typeof target === 'string' ? this.document.getElementById(target.replace(/^#/, '')) : target;
    if (!element) {
      return false;
    }
    const top = element.getBoundingClientRect().top + (this.document.defaultView?.scrollY ?? 0) - (options.offset ?? 0);
    this.document.defaultView?.scrollTo({ behavior: options.behavior ?? this.defaultBehavior(), top: Math.max(0, top) });
    if (options.focus && element instanceof HTMLElement) {
      element.focus({ preventScroll: true });
    }
    return true;
  }

  /** Scroll to the top of the page. */
  scrollToTop(behavior?: ScrollBehavior): void {
    if (this.isBrowser) {
      this.document.defaultView?.scrollTo({ behavior: behavior ?? this.defaultBehavior(), top: 0 });
    }
  }

  private defaultBehavior(): ScrollBehavior {
    return this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }
}
