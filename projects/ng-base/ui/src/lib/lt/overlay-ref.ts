import { inject, InjectionToken } from '@angular/core';

import type { LtOverlayRef } from './overlay';

/** Data passed with `LtOverlayOptions.data` (read it with {@link injectLtOverlayData}). */
export const LT_OVERLAY_DATA = new InjectionToken<unknown>('LT_OVERLAY_DATA');

/** Handle of the overlay the injecting component runs in (read it with {@link injectLtOverlayRef}). */
export const LT_OVERLAY_REF = new InjectionToken<LtOverlayRef<unknown>>('LT_OVERLAY_REF');

/**
 * Data of the overlay the calling component was opened in by `LtOverlayService.open()`. Call it in an injection
 * context (field initializer or constructor).
 */
export function injectLtOverlayData<D>(): D {
  return inject(LT_OVERLAY_DATA) as D;
}

/**
 * Handle of the overlay the calling component was opened in, so the component can close itself with a result.
 *
 * @example
 * readonly overlay = injectLtOverlayRef<boolean>();
 * save() { this.overlay.close(true); }
 */
export function injectLtOverlayRef<R>(): LtOverlayRef<R> {
  return inject(LT_OVERLAY_REF) as LtOverlayRef<R>;
}
