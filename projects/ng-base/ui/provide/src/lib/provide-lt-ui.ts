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

/** `<hlm-toaster>` instances that have rendered (browser). */
let renderedToasters = 0;
/** Toasts raised in the browser before a toaster rendered, in order. */
let pendingToasts: LtToastOptions[] = [];

/**
 * Sonner's toaster empties the toast state when it is created, so a toast handed to Sonner before that is lost: with
 * `<hlm-toaster />` in a `@defer` block, every toast of the first moments of a page load (a page that warns and
 * redirects on a direct visit). In the browser such toasts wait until a toaster has rendered. An app that renders
 * `<brn-sonner-toaster>` without `<hlm-toaster>` gets its toasts handed over at once, as before.
 */
function toasterReady(): boolean {
  return renderedToasters > 0 || !!document.querySelector('brn-sonner-toaster:not(hlm-toaster > brn-sonner-toaster)');
}

/** Hand the waiting toasts to Sonner, oldest first (one `then`, so a toast raised afterwards follows them). */
function flushPendingToasts(): void {
  if (!pendingToasts.length) {
    return;
  }
  const queued = pendingToasts;
  pendingToasts = [];
  void loadToast().then((toast) => queued.forEach((options) => showSonnerToast(toast, options)));
}

function showSonnerToast(toast: LtSonnerToast, options: LtToastOptions): void {
  const message = options.title ?? options.description ?? '';
  const data = { description: options.title ? options.description : undefined, duration: options.duration };
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
}

/**
 * Called by `<hlm-toaster>` after its first render: from then on toasts go straight to Sonner, and the ones that waited
 * are shown. Returns the function its destruction calls. Not meant for app code.
 */
export function ltToasterRendered(): () => void {
  renderedToasters++;
  flushPendingToasts();
  let released = false;
  return () => {
    if (!released) {
      released = true;
      renderedToasters--;
    }
  };
}

/**
 * Sonner toast adapter: maps the lt colors onto Sonner's variants; loads Sonner lazily on the first toast. In the
 * browser a toast raised before `<hlm-toaster>` rendered waits for it (see {@link ltToasterRendered}).
 */
export const ltSonnerToastAdapter: LtToastAdapter = {
  show(options: LtToastOptions): boolean {
    // On the server nothing renders a toast; it goes to Sonner as before and never waits in a queue shared by requests.
    if (typeof document !== 'undefined' && !toasterReady()) {
      pendingToasts.push(options);
      return true;
    }
    flushPendingToasts();
    void loadToast().then((toast) => showSonnerToast(toast, options));
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
