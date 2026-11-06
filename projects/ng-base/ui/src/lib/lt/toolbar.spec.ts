import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LtI18nService } from '@lenne.tech/ng-base';

import { HlmButton } from '../helm/button';
import { LtToolbar } from './toolbar';
import { LtToolbarItem } from './toolbar-item';

@Component({
  imports: [HlmButton, LtToolbar, LtToolbarItem],
  template: `
    <div ltToolbar [orientation]="orientation()" [label]="label()">
      <button hlmBtn ltToolbarItem type="button">Neu</button>
      <button hlmBtn ltToolbarItem type="button" [disabled]="disabled()">Bearbeiten</button>
      <button hlmBtn ltToolbarItem type="button">Löschen</button>
      <input ltToolbarItem aria-label="Suche" />
    </div>
  `,
})
class ToolbarHost {
  readonly disabled = signal(true);
  readonly label = signal<string | undefined>(undefined);
  readonly orientation = signal<'horizontal' | 'vertical'>('horizontal');
}

@Component({
  imports: [LtToolbar, LtToolbarItem],
  template: `<div ltToolbar aria-label="Aktionen"><button ltToolbarItem type="button">A</button></div>`,
})
class StaticLabelHost {}

async function setup() {
  TestBed.inject(LtI18nService).setLocale('de');
  const fixture = TestBed.createComponent(ToolbarHost);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const items = Array.from(element.querySelectorAll<HTMLElement>('[ltToolbarItem]'));
  return { fixture, items, toolbar: element.querySelector('[role="toolbar"]') as HTMLElement };
}

const KEY_CODES: Record<string, number> = { ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, End: 35, Home: 36 };

/** CDK key managers read `keyCode`, as real browsers still send it. */
function press(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, keyCode: KEY_CODES[key] });
  target.dispatchEvent(event);
  return event;
}

const tabIndexes = (items: HTMLElement[]) => items.map((item) => item.getAttribute('tabindex'));

describe('LtToolbar', () => {
  it('is a labelled toolbar with an orientation', async () => {
    const { fixture, toolbar } = await setup();
    expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal');
    expect(toolbar.getAttribute('aria-label')).toBe('Funktionsleiste');
    fixture.componentInstance.label.set('Auftragsaktionen');
    await fixture.whenStable();
    expect(toolbar.getAttribute('aria-label')).toBe('Auftragsaktionen');
  });

  it('keeps a static aria-label', async () => {
    const fixture = TestBed.createComponent(StaticLabelHost);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toBe('Aktionen');
  });

  it('has a single tab stop on the first enabled item', async () => {
    const { items } = await setup();
    expect(tabIndexes(items)).toEqual(['0', '-1', '-1', '-1']);
  });

  it('moves with the arrow keys, skips disabled items and wraps', async () => {
    const { fixture, items } = await setup();
    items[0]!.focus();
    const event = press(items[0]!, 'ArrowRight');
    await fixture.whenStable();
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[2]);
    expect(tabIndexes(items)).toEqual(['-1', '-1', '0', '-1']);

    press(items[2]!, 'ArrowLeft');
    expect(document.activeElement).toBe(items[0]);
    press(items[0]!, 'ArrowLeft');
    expect(document.activeElement).toBe(items[3]);
  });

  it('jumps with Home and End', async () => {
    const { items } = await setup();
    items[0]!.focus();
    press(items[0]!, 'End');
    expect(document.activeElement).toBe(items[3]);
    items[2]!.focus();
    press(items[2]!, 'Home');
    expect(document.activeElement).toBe(items[0]);
  });

  it('leaves the arrow keys to text inputs', async () => {
    const { items } = await setup();
    items[3]!.focus();
    const event = press(items[3]!, 'ArrowLeft');
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(items[3]);
  });

  it('uses the up/down keys when vertical', async () => {
    const { fixture, items, toolbar } = await setup();
    fixture.componentInstance.orientation.set('vertical');
    fixture.componentInstance.disabled.set(false);
    await fixture.whenStable();
    expect(toolbar.getAttribute('aria-orientation')).toBe('vertical');
    items[0]!.focus();
    press(items[0]!, 'ArrowRight');
    expect(document.activeElement).toBe(items[0]);
    press(items[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
  });

  it('keeps the tab stop on an enabled item when the active one gets disabled', async () => {
    const { fixture, items } = await setup();
    fixture.componentInstance.disabled.set(false);
    await fixture.whenStable();
    items[1]!.focus();
    await fixture.whenStable();
    expect(tabIndexes(items)).toEqual(['-1', '0', '-1', '-1']);
    fixture.componentInstance.disabled.set(true);
    await fixture.whenStable();
    expect(tabIndexes(items)).toEqual(['0', '-1', '-1', '-1']);
  });
});
