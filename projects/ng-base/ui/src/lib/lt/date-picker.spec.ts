import { ApplicationRef, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LtI18nService } from '@lenne.tech/ng-base';

import { provideSpartanHlm } from '../helm/utils';
import { LtDatePicker } from './date-picker';
import { ltCalendarI18n, ltFormatDate, ltParseDate } from './date-utils';
import { LtFormField } from './form-field';

@Component({
  imports: [LtDatePicker, LtFormField],
  template: `
    <lt-form-field for="delivery" label="Liefertermin" hint="Werktage">
      <lt-date-picker id="delivery" [(value)]="value" [min]="min()" [max]="max()" [invalid]="invalid()" [required]="true" />
    </lt-form-field>
  `,
})
class DatePickerHost {
  readonly invalid = signal(false);
  readonly max = signal<Date | undefined>(new Date(2026, 11, 31));
  readonly min = signal<Date | undefined>(new Date(2026, 0, 1));
  readonly value = signal<Date | null>(null);
}

async function settle(): Promise<void> {
  const appRef = TestBed.inject(ApplicationRef);
  for (let i = 0; i < 3; i++) {
    appRef.tick();
    await appRef.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
}

async function setup() {
  TestBed.configureTestingModule({ providers: [provideSpartanHlm()] });
  TestBed.inject(LtI18nService).setLocale('de');
  const fixture = TestBed.createComponent(DatePickerHost);
  await settle();
  const element = fixture.nativeElement as HTMLElement;
  return { element, fixture, host: fixture.componentInstance, input: element.querySelector('input#delivery') as HTMLInputElement };
}

function commit(input: HTMLInputElement, text: string): void {
  input.dispatchEvent(new Event('focus'));
  input.value = text;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
}

describe('date utils', () => {
  it('parses German, compact and ISO dates and rejects impossible ones', () => {
    expect(ltParseDate('24.12.2026')).toEqual(new Date(2026, 11, 24));
    expect(ltParseDate('1.2.26')).toEqual(new Date(2026, 1, 1));
    expect(ltParseDate('24122026')).toEqual(new Date(2026, 11, 24));
    expect(ltParseDate('2026-12-24')).toEqual(new Date(2026, 11, 24));
    expect(ltParseDate('31.02.2026')).toBeNull();
    expect(ltParseDate('Weihnachten')).toBeNull();
  });

  it('formats as dd.MM.yyyy', () => {
    expect(ltFormatDate(new Date(2026, 0, 5))).toBe('05.01.2026');
  });

  it('builds German calendar texts with Monday first', () => {
    const i18n = ltCalendarI18n('de', (key) => key);
    expect(i18n.months?.()[0]).toBe('Januar');
    expect(i18n.firstDayOfWeek?.()).toBe(1);
    expect(i18n.labelWeekday?.(1)).toBe('Montag');
    expect(i18n.labelNext?.()).toBe('lt.ui.nextMonth');
    expect(ltCalendarI18n('en', (key) => key).firstDayOfWeek?.()).toBe(0);
  });
});

describe('LtDatePicker', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((container) => (container.innerHTML = '')));

  it('renders a labelled text input with the format as placeholder and wired hint', async () => {
    const { element, input } = await setup();
    expect(element.querySelector('label[for="delivery"]')?.textContent?.trim()).toBe('Liefertermin');
    expect(input.placeholder).toBe('TT.MM.JJJJ');
    expect(input.getAttribute('aria-describedby')).toBe('delivery-hint');
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(element.querySelector('button[aria-label="Kalender öffnen"]')).not.toBeNull();
  });

  it('shows the value in German format', async () => {
    const { fixture, host, input } = await setup();
    host.value.set(new Date(2026, 4, 7, 15, 30));
    await settle();
    await fixture.whenStable();
    expect(input.value).toBe('07.05.2026');
  });

  it('commits typed dates as local midnight', async () => {
    const { host, input } = await setup();
    commit(input, '3.6.2026');
    await settle();
    expect(host.value()).toEqual(new Date(2026, 5, 3));
  });

  it('rejects dates outside min/max', async () => {
    const { host, input } = await setup();
    commit(input, '01.01.2027');
    await settle();
    expect(host.value()).toBeNull();
    expect(input.value).toBe('01.01.2027');
  });

  it('clears the value with the clear button', async () => {
    const { element, host } = await setup();
    host.value.set(new Date(2026, 1, 2));
    await settle();
    (element.querySelector('button[aria-label="Datum entfernen"]') as HTMLButtonElement).click();
    await settle();
    expect(host.value()).toBeNull();
  });

  it('sets aria-invalid on the text input', async () => {
    const { host, input } = await setup();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    host.invalid.set(true);
    await settle();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('opens a German calendar from the calendar button', async () => {
    const { element, host } = await setup();
    host.value.set(new Date(2026, 2, 10));
    await settle();
    (element.querySelector('button[aria-label="Kalender öffnen"]') as HTMLButtonElement).click();
    await settle();
    const calendar = document.querySelector('hlm-calendar') as HTMLElement;
    expect(calendar).not.toBeNull();
    expect(calendar.textContent).toContain('März 2026');
    expect(document.querySelector('button[aria-label="Nächster Monat"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Vorheriger Monat"]')).not.toBeNull();
  });
});
