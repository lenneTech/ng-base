import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import { LtToastService } from '@lenne.tech/ng-base';
import { injectLtShareI18n } from './i18n';

/** Result of {@link LtShareService.share}. */
export type LtShareResult = 'aborted' | 'copied' | 'failed' | 'shared' | 'unavailable';

/**
 * Web Share API with clipboard fallback (counterpart of `useLtShare()`). Browser only.
 *
 * `share()` uses `navigator.share({ title, text, url })` where available; otherwise the URL is copied to the clipboard
 * and a success toast (`lt.share.copied`) is shown. The URL defaults to the current page.
 */
@Service()
export class LtShareService {
  private readonly i18n = injectLtShareI18n();
  private readonly toast = inject(LtToastService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Whether the native share sheet is available. */
  canShare(): boolean {
    return this.isBrowser && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  }

  /** Share a link (native share sheet, else clipboard + toast). */
  async share(title?: string, text?: string, url?: string): Promise<LtShareResult> {
    if (!this.isBrowser) {
      return 'unavailable';
    }
    const target = url ?? globalThis.location?.href ?? '';
    if (this.canShare()) {
      try {
        await navigator.share({ text: text ?? globalThis.location?.origin, title, url: target });
        return 'shared';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return 'aborted';
        }
      }
    }
    try {
      await navigator.clipboard.writeText(target);
      if (!this.toast.show({ color: 'success', description: this.i18n.t('lt.share.copiedDescription'), title: this.i18n.t('lt.share.copied') })) {
        console.info(`[@lenne.tech/ng-base] ${this.i18n.t('lt.share.copied')}: ${target}`);
      }
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}
