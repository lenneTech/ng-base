import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrnSonnerToaster, toastState } from '@spartan-ng/brain/sonner';

import { ltSonnerToastAdapter } from '@lenne.tech/ng-base/ui/provide';
import { HlmToaster } from '../helm/sonner';

/** Sonner and the adapter load lazily: let the dynamic import and the toast hand-off settle. */
const settle = async () => {
  for (let index = 0; index < 10; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const titles = () => toastState.toasts().map((toast) => toast.title);

/** The app shell of an app that follows the README: the toaster renders later (`@defer`), here behind a switch. */
@Component({
  imports: [HlmToaster],
  selector: 'lt-test-shell',
  template: `@if (toaster()) {
    <hlm-toaster />
  }`,
})
class Shell {
  readonly toaster = signal(false);
}

@Component({
  imports: [BrnSonnerToaster],
  selector: 'lt-test-brn-shell',
  template: `<brn-sonner-toaster />`,
})
class BrnShell {}

async function renderToaster(fixture: { componentInstance: Shell; whenStable: () => Promise<unknown> }, on = true): Promise<void> {
  fixture.componentInstance.toaster.set(on);
  await fixture.whenStable();
  await settle();
}

describe('ltSonnerToastAdapter and <hlm-toaster>', () => {
  beforeEach(() => toastState.reset());
  afterEach(async () => {
    TestBed.resetTestingModule();
    await settle();
    toastState.reset();
  });

  it('shows a toast raised before the toaster rendered once it has rendered, exactly once', async () => {
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();

    expect(ltSonnerToastAdapter.show({ color: 'warning', title: 'Registrierung nicht verfügbar' })).toBe(true);
    await settle();

    await renderToaster(fixture);
    expect(titles()).toEqual(['Registrierung nicht verfügbar']);
    expect(fixture.nativeElement.querySelectorAll('[data-sonner-toast]')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Registrierung nicht verfügbar');
  });

  it('keeps the order of several toasts raised before the toaster rendered', async () => {
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();

    ltSonnerToastAdapter.show({ title: 'Erster' });
    ltSonnerToastAdapter.show({ color: 'error', title: 'Zweiter' });
    await settle();
    await renderToaster(fixture);

    // Sonner lists the newest toast first.
    expect(titles()).toEqual(['Zweiter', 'Erster']);
  });

  it('hands a toast to the rendered toaster at once', async () => {
    const fixture = TestBed.createComponent(Shell);
    await renderToaster(fixture);

    ltSonnerToastAdapter.show({ color: 'success', description: 'Alles gut.', title: 'Gespeichert' });
    await settle();
    expect(titles()).toEqual(['Gespeichert']);
  });

  it('waits again for a toaster after the last one was destroyed', async () => {
    const fixture = TestBed.createComponent(Shell);
    await renderToaster(fixture);
    await renderToaster(fixture, false);

    ltSonnerToastAdapter.show({ title: 'Nach dem Abbau' });
    await settle();
    await renderToaster(fixture);
    expect(titles()).toEqual(['Nach dem Abbau']);
  });

  it('hands toasts to an app that renders <brn-sonner-toaster> itself, as before', async () => {
    const fixture = TestBed.createComponent(BrnShell);
    await fixture.whenStable();

    ltSonnerToastAdapter.show({ title: 'Eigener Toaster' });
    await settle();
    expect(titles()).toEqual(['Eigener Toaster']);
  });
});
