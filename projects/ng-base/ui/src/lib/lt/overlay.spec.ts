import { Dialog } from '@angular/cdk/dialog';
import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LtI18nService } from '@lenne.tech/ng-base';

import { HlmDialogTitle } from '../helm/dialog';
import { provideSpartanHlm } from '../helm/utils';
import { LtOverlayService } from './overlay';
import { injectLtOverlayData, injectLtOverlayRef } from './overlay-ref';

@Component({
  imports: [HlmDialogTitle],
  template: `
    <h2 hlmDialogTitle>Artikel {{ data.id }}</h2>
    <button type="button" class="save" (click)="ref.close('saved-' + data.id)">Speichern</button>
  `,
})
class EditDialog {
  readonly data = injectLtOverlayData<{ id: string }>();
  readonly ref = injectLtOverlayRef<string>();
}

async function settle(): Promise<void> {
  const appRef = TestBed.inject(ApplicationRef);
  for (let i = 0; i < 3; i++) {
    appRef.tick();
    await appRef.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
}

function dialogElement(): HTMLElement {
  return document.querySelector('cdk-dialog-container') as HTMLElement;
}

function pressEscape(): void {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
}

describe('LtOverlayService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideSpartanHlm()] });
    TestBed.inject(LtI18nService).setLocale('de');
  });

  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('confirm() resolves true on confirm', async () => {
    const result = TestBed.inject(LtOverlayService).confirm({ title: 'Speichern?' });
    await settle();
    (document.querySelector('[data-lt-confirm="confirm"]') as HTMLButtonElement).click();
    await settle();
    await expect(result).resolves.toBe(true);
  });

  it('confirm() resolves false on cancel and on Escape', async () => {
    const overlay = TestBed.inject(LtOverlayService);
    const cancelled = overlay.confirm({ title: 'Verwerfen?' });
    await settle();
    (document.querySelector('[data-lt-confirm="cancel"]') as HTMLButtonElement).click();
    await settle();
    await expect(cancelled).resolves.toBe(false);

    const escaped = overlay.confirm({ title: 'Verwerfen?' });
    await settle();
    pressEscape();
    await settle();
    await expect(escaped).resolves.toBe(false);
  });

  it('renders an alertdialog labelled by the title and described by the description', async () => {
    void TestBed.inject(LtOverlayService).confirm({ description: 'Das kann nicht rückgängig gemacht werden.', title: 'Auftrag löschen?' });
    await settle();
    const dialog = dialogElement();
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');
    expect(title?.textContent?.trim()).toBe('Auftrag löschen?');
    const description = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent?.trim()).toBe('Das kann nicht rückgängig gemacht werden.');
    expect(document.querySelector('[data-slot="dialog-close"]')).toBeNull();
  });

  it('uses the i18n labels unless custom labels are given', async () => {
    const overlay = TestBed.inject(LtOverlayService);
    void overlay.confirm({ title: 'A' });
    await settle();
    expect(document.querySelector('[data-lt-confirm="cancel"]')?.textContent?.trim()).toBe('Abbrechen');
    expect(document.querySelector('[data-lt-confirm="confirm"]')?.textContent?.trim()).toBe('Bestätigen');
    TestBed.inject(Dialog).closeAll();
    await settle();

    void overlay.confirm({ cancelLabel: 'Behalten', confirmLabel: 'Löschen', title: 'B' });
    await settle();
    expect(document.querySelector('[data-lt-confirm="cancel"]')?.textContent?.trim()).toBe('Behalten');
    expect(document.querySelector('[data-lt-confirm="confirm"]')?.textContent?.trim()).toBe('Löschen');
  });

  it('styles destructive questions and starts on cancel', async () => {
    void TestBed.inject(LtOverlayService).confirm({ destructive: true, title: 'Alle Sitzungen beenden?' });
    await settle();
    const confirm = document.querySelector('[data-lt-confirm="confirm"]') as HTMLElement;
    expect(confirm.className).toContain('text-destructive');
    expect(document.activeElement).toBe(document.querySelector('[data-lt-confirm="cancel"]'));
  });

  it('starts on the confirm button for regular questions', async () => {
    void TestBed.inject(LtOverlayService).confirm({ title: 'Speichern?' });
    await settle();
    expect(document.activeElement).toBe(document.querySelector('[data-lt-confirm="confirm"]'));
  });

  it('open() passes data to the component and resolves with its result', async () => {
    const ref = TestBed.inject(LtOverlayService).open<string, { id: string }>(EditDialog, { contentClass: 'sm:max-w-lg', data: { id: '42' } });
    await settle();
    expect(document.querySelector('h2')?.textContent?.trim()).toBe('Artikel 42');
    const content = document.querySelector('hlm-dialog-content') as HTMLElement;
    expect(content.className).toContain('sm:max-w-lg');
    // A high dialog never exceeds the viewport and scrolls inside (its actions stay reachable).
    expect(content.classList).toContain('max-h-[calc(100dvh-2rem)]');
    expect(content.classList).toContain('overflow-y-auto');
    expect(document.querySelector('[data-slot="dialog-close"] .sr-only')?.textContent?.trim()).toBe('Schließen');
    (document.querySelector('button.save') as HTMLButtonElement).click();
    await settle();
    await expect(ref.closed).resolves.toBe('saved-42');
    expect(dialogElement()).toBeNull();
  });

  it('open() lets a contentClass replace the default height and overflow', async () => {
    TestBed.inject(LtOverlayService).open(EditDialog, { contentClass: 'max-h-[80vh] overflow-hidden', data: { id: '1' } });
    await settle();
    const content = document.querySelector('hlm-dialog-content') as HTMLElement;
    expect(content.classList).toContain('max-h-[80vh]');
    expect(content.classList).not.toContain('max-h-[calc(100dvh-2rem)]');
    expect(content.classList).not.toContain('overflow-y-auto');
  });

  it('open() resolves undefined when dismissed and close() closes from outside', async () => {
    const overlay = TestBed.inject(LtOverlayService);
    const dismissed = overlay.open(EditDialog, { data: { id: '1' } });
    await settle();
    pressEscape();
    await settle();
    await expect(dismissed.closed).resolves.toBeUndefined();

    const closed = overlay.open<string>(EditDialog, { data: { id: '2' } });
    await settle();
    closed.close('done');
    await settle();
    await expect(closed.closed).resolves.toBe('done');
  });

  it('keeps non-dismissible overlays open on Escape and hides the close button', async () => {
    const ref = TestBed.inject(LtOverlayService).open(EditDialog, { data: { id: '7' }, dismissible: false });
    await settle();
    expect(document.querySelector('[data-slot="dialog-close"]')).toBeNull();
    pressEscape();
    await settle();
    expect(dialogElement()).not.toBeNull();
    ref.close();
    await settle();
    expect(dialogElement()).toBeNull();
  });
});
