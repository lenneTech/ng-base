import { ApplicationRef, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LtI18nService } from '@lenne.tech/ng-base';

import { provideSpartanHlm } from '../helm/utils';
import { LtDateTimePicker } from './date-time-picker';
import { LtFormField } from './form-field';

@Component({
  imports: [LtDateTimePicker, LtFormField],
  template: `
    <lt-form-field for="start" label="Schichtbeginn" hint="Lokale Zeit">
      <lt-date-time-picker id="start" [(value)]="value" [minuteStep]="15" [min]="min()" [max]="max()" [invalid]="invalid()" />
    </lt-form-field>
  `,
})
class DateTimeHost {
  readonly invalid = signal(false);
  readonly max = signal<Date | undefined>(undefined);
  readonly min = signal<Date | undefined>(undefined);
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
  const fixture = TestBed.createComponent(DateTimeHost);
  await settle();
  const element = fixture.nativeElement as HTMLElement;
  return {
    date: element.querySelector('input#start') as HTMLInputElement,
    element,
    host: fixture.componentInstance,
    time: element.querySelector('input#start-time') as HTMLInputElement,
  };
}

function commitDate(input: HTMLInputElement, text: string): void {
  input.dispatchEvent(new Event('focus'));
  input.value = text;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
}

function changeTime(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event('change'));
}

describe('LtDateTimePicker', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((container) => (container.innerHTML = '')));

  it('renders a date input and a labelled time input with the minute step', async () => {
    const { date, element, time } = await setup();
    expect(element.querySelector('label[for="start"]')?.textContent?.trim()).toBe('Schichtbeginn');
    expect(time.type).toBe('time');
    expect(time.getAttribute('step')).toBe('900');
    expect(element.querySelector('label[for="start-time"]')?.textContent?.trim()).toBe('Schichtbeginn – Uhrzeit');
    expect(date.getAttribute('aria-describedby')).toBe('start-hint');
    expect(time.getAttribute('aria-describedby')).toBe('start-hint');
  });

  it('combines date and time into one local Date', async () => {
    const { date, host, time } = await setup();
    commitDate(date, '12.03.2026');
    await settle();
    expect(host.value()).toEqual(new Date(2026, 2, 12, 0, 0));
    changeTime(time, '06:30');
    await settle();
    expect(host.value()).toEqual(new Date(2026, 2, 12, 6, 30));
    commitDate(date, '13.03.2026');
    await settle();
    expect(host.value()).toEqual(new Date(2026, 2, 13, 6, 30));
  });

  it('keeps a time typed before the date and snaps to the minute step', async () => {
    const { date, host, time } = await setup();
    changeTime(time, '14:08');
    await settle();
    expect(host.value()).toBeNull();
    commitDate(date, '01.04.2026');
    await settle();
    expect(host.value()).toEqual(new Date(2026, 3, 1, 14, 15));
    expect(time.value).toBe('14:15');
  });

  it('shows an existing value and clears it with the date', async () => {
    const { date, element, host, time } = await setup();
    host.value.set(new Date(2026, 6, 1, 22, 45));
    await settle();
    expect(date.value).toBe('01.07.2026');
    expect(time.value).toBe('22:45');
    (element.querySelector('button[aria-label="Datum entfernen"]') as HTMLButtonElement).click();
    await settle();
    expect(host.value()).toBeNull();
  });

  it('clamps into min/max and limits the time input on those days', async () => {
    const { date, host, time } = await setup();
    host.min.set(new Date(2026, 4, 4, 8, 0));
    host.max.set(new Date(2026, 4, 8, 17, 0));
    await settle();
    commitDate(date, '04.05.2026');
    await settle();
    expect(host.value()).toEqual(new Date(2026, 4, 4, 8, 0));
    expect(time.getAttribute('min')).toBe('08:00');
    changeTime(time, '23:00');
    await settle();
    expect(host.value()).toEqual(new Date(2026, 4, 4, 23, 0));
    commitDate(date, '08.05.2026');
    await settle();
    expect(host.value()).toEqual(new Date(2026, 4, 8, 17, 0));
    expect(time.getAttribute('max')).toBe('17:00');
  });

  it('marks both inputs invalid', async () => {
    const { date, host, time } = await setup();
    host.invalid.set(true);
    await settle();
    expect(date.getAttribute('aria-invalid')).toBe('true');
    expect(time.getAttribute('aria-invalid')).toBe('true');
  });
});
