import { inject, makeEnvironmentProviders, provideAppInitializer, type EnvironmentProviders } from '@angular/core';
import { LT_TOAST_ADAPTER, type LtToastAdapter, type LtToastOptions } from '@lenne.tech/ng-base';

import { LtColorModeService } from './color-mode';

/** Options of {@link provideLtUi}. */
export interface LtUiOptions {
  /** Start `LtColorModeService` at bootstrap, so the `.dark` class is right from the SSR render on (default `true`). */
  colorMode?: boolean;
  /** Bind `LtToastService` / error toasts to Spartan Sonner (`<hlm-toaster />` in the app shell). Default `true`. */
  sonnerToasts?: boolean;
}

type LtSonnerToast = typeof import('@spartan-ng/brain/sonner').toast;
let sonner: Promise<LtSonnerToast> | undefined;

/** Load Sonner's `toast()` on first use (keeps it out of the initial bundle). */
function loadToast(): Promise<LtSonnerToast> {
  sonner ??= import('@spartan-ng/brain/sonner').then((module) => module.toast);
  return sonner;
}

/** Sonner toast adapter: maps the lt colors onto Sonner's variants; loads Sonner lazily on the first toast. */
export const ltSonnerToastAdapter: LtToastAdapter = {
  show(options: LtToastOptions): boolean {
    const message = options.title ?? options.description ?? '';
    const data = { description: options.title ? options.description : undefined, duration: options.duration };
    void loadToast().then((toast) => {
      switch (options.color) {
        case 'error':
          toast.error(message, data);
          break;
        case 'success':
          toast.success(message, data);
          break;
        case 'warning':
          toast.warning(message, data);
          break;
        case 'info':
          toast.info(message, data);
          break;
        default:
          toast(message, data);
      }
    });
    return true;
  },
};

/**
 * UI providers for `app.config.ts`: the color mode (started at bootstrap) and the toast bridge to Spartan Sonner (loaded
 * on the first toast). Put `<hlm-toaster />` (from `@lenne.tech/ng-base/ui`, ideally in a `@defer` block) into the
 * app shell. Lives in its own entry point and imports neither the component layer nor the CDK, so it adds almost
 * nothing to the initial bundle. Overlay defaults (toasts above dialogs): `provideLtUiOverlayDefaults()` from
 * `@lenne.tech/ng-base/ui` in the providers of the (lazy) routes that open overlays.
 */
export function provideLtUi(options: LtUiOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    ...(options.sonnerToasts === false ? [] : [{ provide: LT_TOAST_ADAPTER, useValue: ltSonnerToastAdapter }]),
    ...(options.colorMode === false ? [] : [provideAppInitializer(() => void inject(LtColorModeService))]),
  ]);
}
