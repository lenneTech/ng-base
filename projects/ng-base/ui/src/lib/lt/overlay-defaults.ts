import { Dialog } from '@angular/cdk/dialog';
import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import type { Provider } from '@angular/core';
import { BrnDialogService } from '@spartan-ng/brain/dialog';

import { HlmDialogService } from '../helm/dialog';
import { LtOverlayService } from './overlay';

/**
 * CDK overlays without the browser `popover` top layer, so the `position: fixed` toaster stays visible above dialogs,
 * sheets and tooltips — the same as Spartan's `provideSpartanHlm()`.
 *
 * Put it into the `providers` of the lazy routes or of the (lazy) layout components whose content opens overlays,
 * not into `app.config.ts`: the token lives in the CDK overlay module, which would otherwise land in the initial bundle
 * (~57 kB, measured in ng-base-starter).
 *
 * The dialog services (`Dialog` of the CDK, `BrnDialogService`, `HlmDialogService`, `LtOverlayService`) are root
 * services that read the token from the injector they were created in, so they are provided again here: components of
 * the route then get route-level instances that see the token. Without that, only directive overlays (tooltip, menu,
 * popover) would follow it, not dialogs (found by ng-base-starter, 2026-11-06).
 *
 * Returns plain providers, so they work in route `providers` and in a component's `providers` alike (a layout
 * component: its router outlet inherits the element injector).
 *
 * @example { path: 'app', loadChildren: () => import('./app.routes'), providers: [provideLtUiOverlayDefaults()] }
 * @example @Component({ selector: 'app-default-layout', providers: [provideLtUiOverlayDefaults()], … })
 */
export function provideLtUiOverlayDefaults(): Provider[] {
  return [{ provide: OVERLAY_DEFAULT_CONFIG, useValue: { usePopover: false } }, Dialog, BrnDialogService, HlmDialogService, LtOverlayService];
}
