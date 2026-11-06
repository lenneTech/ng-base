import { Dialog } from '@angular/cdk/dialog';
import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { Component, createEnvironmentInjector, EnvironmentInjector, inject, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrnDialogService } from '@spartan-ng/brain/dialog';

import { HlmDialogService } from '../helm/dialog';
import { LtOverlayService } from './overlay';
import { provideLtUiOverlayDefaults } from './overlay-defaults';

@Component({ selector: 'lt-test-dialog-body', template: '<p>body</p>' })
class DialogBody {}

@Component({ selector: 'lt-test-layout', template: '<p>layout</p>', providers: [provideLtUiOverlayDefaults()] })
class Layout {
  readonly overlay = inject(LtOverlayService);
  readonly dialog = inject(Dialog);
}

describe('provideLtUiOverlayDefaults', () => {
  function routeInjector(): EnvironmentInjector {
    return createEnvironmentInjector([provideLtUiOverlayDefaults()], TestBed.inject(EnvironmentInjector));
  }

  it('gives the route its own dialog services that see the token', () => {
    const root = TestBed.inject(EnvironmentInjector);
    const route = routeInjector();
    for (const token of [Dialog, BrnDialogService, HlmDialogService, LtOverlayService]) {
      expect(route.get(token as never)).not.toBe(root.get(token as never));
    }
    expect(route.get(OVERLAY_DEFAULT_CONFIG)).toEqual({ usePopover: false });
    expect(root.get(OVERLAY_DEFAULT_CONFIG, null)).toBeNull();
  });

  it('works as component providers: the layout gets dialog services that see the token', () => {
    const fixture = TestBed.createComponent(Layout);
    const layout = fixture.componentInstance;
    expect(layout.overlay).not.toBe(TestBed.inject(LtOverlayService));
    const dialogInjector = (layout.dialog as unknown as { _injector: Injector })._injector;
    expect(dialogInjector.get(OVERLAY_DEFAULT_CONFIG, null)).toEqual({ usePopover: false });
  });

  it('opens dialogs of the route without the popover top layer', async () => {
    const route = routeInjector();
    const ref = route.get(LtOverlayService).open(DialogBody);
    await new Promise((resolve) => setTimeout(resolve));
    const hosts = Array.from(document.querySelectorAll('.cdk-overlay-pane')).map((pane) => pane.parentElement);
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      expect(host?.hasAttribute('popover')).toBe(false);
    }
    ref.close();
  });
});
