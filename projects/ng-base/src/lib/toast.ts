import { inject, InjectionToken, Service } from '@angular/core';

/** Toast colors (same set as Nuxt UI). */
export type LtToastColor = 'error' | 'info' | 'neutral' | 'primary' | 'secondary' | 'success' | 'warning';

/** A toast message. */
export interface LtToastOptions {
  color?: LtToastColor;
  description?: string;
  /** Display time in milliseconds (adapter default when omitted). */
  duration?: number;
  title?: string;
}

/**
 * Bridge to the app's toaster. `provideLtUi()` binds it to Spartan Sonner (`<hlm-toaster />`); bind your own for
 * another UI library. Return `false` when nothing could be shown, the caller then logs to the console.
 */
export interface LtToastAdapter {
  show(options: LtToastOptions): boolean;
}

/** Optional toaster bridge (see {@link LtToastAdapter}). */
export const LT_TOAST_ADAPTER = new InjectionToken<LtToastAdapter>('LT_TOAST_ADAPTER');

/** Shows toasts through {@link LT_TOAST_ADAPTER}; without an adapter, `show` returns `false`. */
@Service()
export class LtToastService {
  private readonly adapter = inject(LT_TOAST_ADAPTER, { optional: true });

  /** Show a toast. Returns `false` when no toaster is bound or it threw. */
  show(options: LtToastOptions): boolean {
    if (!this.adapter) {
      return false;
    }
    try {
      return this.adapter.show(options) !== false;
    } catch {
      return false;
    }
  }

  /** Shortcut for a success toast. */
  success(title: string, description?: string): boolean {
    return this.show({ color: 'success', description, title });
  }

  /** Shortcut for an error toast. */
  error(title: string, description?: string): boolean {
    return this.show({ color: 'error', description, title });
  }
}
