import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LtI18nService } from '@lenne.tech/ng-base';

import { LtDataView, LtDataViewCell, LtDataViewTile, type LtDataViewColumn, type LtDataViewMode } from './data-view';

interface Order {
  id: string;
  customer: string;
  quantity: number;
  note?: string;
}

const ORDERS: Order[] = [
  { customer: 'Müller GmbH', id: 'A-1', quantity: 12 },
  { customer: 'Schmidt AG', id: 'A-2', note: 'Eilig', quantity: 3 },
];

@Component({
  imports: [LtDataView, LtDataViewCell, LtDataViewTile],
  template: `
    <lt-data-view label="Aufträge" trackBy="id" [columns]="columns" [items]="items()" [(mode)]="mode" [emptyText]="emptyText()">
      @if (withTemplates()) {
        <ng-template ltDataViewTile let-item let-index="index">
          <article class="tile">{{ index }}: {{ item.customer }}</article>
        </ng-template>
        <ng-template ltDataViewCell="customer" let-value="value"
          ><strong>{{ value }}</strong></ng-template
        >
      }
    </lt-data-view>
  `,
})
class DataViewHost {
  readonly columns: LtDataViewColumn<Order>[] = [
    { header: 'Nr.', key: 'id' },
    { header: 'Kunde', key: 'customer' },
    { header: 'Menge', key: 'quantity', numeric: true },
    { header: 'Hinweis', key: (order) => order.note },
  ];
  readonly emptyText = signal<string | undefined>(undefined);
  readonly items = signal<Order[]>(ORDERS);
  readonly mode = signal<LtDataViewMode>('table');
  readonly withTemplates = signal(false);
}

async function setup() {
  TestBed.inject(LtI18nService).setLocale('de');
  const fixture = TestBed.createComponent(DataViewHost);
  await fixture.whenStable();
  return { element: fixture.nativeElement as HTMLElement, fixture, host: fixture.componentInstance };
}

describe('LtDataView', () => {
  it('renders an accessible table with a hidden caption and column headers', async () => {
    const { element } = await setup();
    const caption = element.querySelector('caption') as HTMLElement;
    expect(caption.textContent?.trim()).toBe('Aufträge');
    expect(caption.classList.contains('sr-only')).toBe(true);
    const headers = Array.from(element.querySelectorAll('th'));
    expect(headers.map((th) => th.textContent?.trim())).toEqual(['Nr.', 'Kunde', 'Menge', 'Hinweis']);
    headers.forEach((th) => expect(th.getAttribute('scope')).toBe('col'));
    const rows = Array.from(element.querySelectorAll('tbody tr'));
    expect(rows.map((row) => Array.from(row.querySelectorAll('td')).map((td) => td.textContent?.trim()))).toEqual([
      ['A-1', 'Müller GmbH', '12', '–'],
      ['A-2', 'Schmidt AG', '3', 'Eilig'],
    ]);
  });

  it('right-aligns numeric columns', async () => {
    const { element } = await setup();
    expect(element.querySelectorAll('th')[2]?.classList.contains('text-end')).toBe(true);
    expect(element.querySelectorAll('th')[1]?.classList.contains('text-end')).toBe(false);
    const cell = element.querySelectorAll('tbody tr')[0]?.querySelectorAll('td')[2] as HTMLElement;
    expect(cell.classList.contains('text-end')).toBe(true);
    expect(cell.classList.contains('tabular-nums')).toBe(true);
  });

  it('switches to tiles with the labelled toggle group', async () => {
    const { element, fixture, host } = await setup();
    const group = element.querySelector('[data-slot="toggle-group"]') as HTMLElement;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Ansicht');
    const [table, tiles] = Array.from(group.querySelectorAll('button'));
    expect(table?.getAttribute('aria-label')).toBe('Tabellenansicht');
    expect(tiles?.getAttribute('aria-label')).toBe('Kachelansicht');
    expect(table?.getAttribute('aria-pressed')).toBe('true');

    tiles?.click();
    await fixture.whenStable();
    expect(host.mode()).toBe('tiles');
    expect(tiles?.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('table')).toBeNull();
    const list = element.querySelector('ul') as HTMLElement;
    expect(list.getAttribute('aria-label')).toBe('Aufträge');
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(list.querySelector('dt')?.textContent?.trim()).toBe('Nr.');

    tiles?.click();
    await fixture.whenStable();
    expect(host.mode()).toBe('tiles');
  });

  it('renders the tile and cell templates', async () => {
    const { element, fixture, host } = await setup();
    host.withTemplates.set(true);
    await fixture.whenStable();
    expect(element.querySelector('tbody td strong')?.textContent?.trim()).toBe('Müller GmbH');
    expect(element.querySelectorAll('tbody td strong')).toHaveLength(2);
    host.mode.set('tiles');
    await fixture.whenStable();
    expect(Array.from(element.querySelectorAll('article.tile')).map((tile) => tile.textContent?.trim())).toEqual(['0: Müller GmbH', '1: Schmidt AG']);
  });

  it('shows the empty state', async () => {
    const { element, fixture, host } = await setup();
    host.items.set([]);
    await fixture.whenStable();
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent?.trim()).toBe('Keine Einträge');
    host.emptyText.set('Noch keine Aufträge');
    await fixture.whenStable();
    expect(element.querySelector('[role="status"]')?.textContent?.trim()).toBe('Noch keine Aufträge');
  });
});
