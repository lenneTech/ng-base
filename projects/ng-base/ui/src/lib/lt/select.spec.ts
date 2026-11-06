import { ApplicationRef, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LtI18nService } from '@lenne.tech/ng-base';

import { provideSpartanHlm } from '../helm/utils';
import { LtFormField } from './form-field';
import { LtSelect, type LtSelectOption } from './select';

const OPTIONS: LtSelectOption<number>[] = [
  { label: 'Halle 1', value: 1 },
  { label: 'Halle 2', value: 2 },
  { disabled: true, label: 'Halle 3 (gesperrt)', value: 3 },
];

@Component({
  imports: [LtFormField, LtSelect],
  template: `
    <lt-form-field for="hall" label="Halle" hint="Lagerort">
      <lt-select id="hall" [options]="options" [(value)]="value" [searchable]="searchable()" [invalid]="invalid()" [disabled]="disabled()" />
    </lt-form-field>
    <lt-select label="Schicht" [options]="options" />
  `,
})
class SelectHost {
  readonly disabled = signal(false);
  readonly invalid = signal(false);
  readonly options = OPTIONS;
  readonly searchable = signal(false);
  readonly value = signal<number | null>(null);
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
  const fixture = TestBed.createComponent(SelectHost);
  await settle();
  return { element: fixture.nativeElement as HTMLElement, fixture, host: fixture.componentInstance };
}

describe('LtSelect', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((container) => (container.innerHTML = '')));

  it('renders a labelled combobox trigger with a placeholder and the field hint', async () => {
    const { element } = await setup();
    expect(element.querySelector('lt-select')?.hasAttribute('id')).toBe(false);
    const trigger = element.querySelector('#hall') as HTMLButtonElement;
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('role')).toBe('combobox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('label[for="hall"]')?.textContent?.trim()).toBe('Halle');
    expect(trigger.getAttribute('aria-describedby')).toBe('hall-hint');
    expect(trigger.textContent?.trim()).toBe('Bitte auswählen');
  });

  it('adds a visually hidden label when no visible one is linked', async () => {
    const { element } = await setup();
    const triggers = element.querySelectorAll<HTMLButtonElement>('button[role="combobox"]');
    const second = triggers[1] as HTMLButtonElement;
    expect(second.id).toMatch(/^lt-select-\d+$/);
    const label = element.querySelector(`label[for="${second.id}"]`) as HTMLLabelElement;
    expect(label.textContent?.trim()).toBe('Schicht');
    expect(label.classList.contains('sr-only')).toBe(true);
  });

  it('shows the label of the value and selects an option', async () => {
    const { element, fixture, host } = await setup();
    host.value.set(2);
    await settle();
    const trigger = element.querySelector('#hall') as HTMLButtonElement;
    expect(trigger.textContent?.trim()).toBe('Halle 2');

    trigger.click();
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Halle 1', 'Halle 2', 'Halle 3 (gesperrt)']);
    expect(options[2]?.getAttribute('aria-disabled')).toBe('true');
    options[0]?.click();
    await settle();
    expect(host.value()).toBe(1);
    await fixture.whenStable();
    expect(trigger.textContent?.trim()).toBe('Halle 1');
  });

  it('sets aria-invalid and disables the trigger', async () => {
    const { element, host } = await setup();
    host.invalid.set(true);
    host.disabled.set(true);
    await settle();
    const trigger = element.querySelector('#hall') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.disabled).toBe(true);
  });

  it('switches to a filterable combobox when searchable', async () => {
    const { element, host } = await setup();
    host.value.set(1);
    host.searchable.set(true);
    await settle();
    const input = element.querySelector('input#hall') as HTMLInputElement;
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.value).toBe('Halle 1');
    expect(input.getAttribute('aria-describedby')).toBe('hall-hint');
    expect(element.querySelector('button[aria-label="Optionen anzeigen"]')).not.toBeNull();

    input.value = '2';
    input.dispatchEvent(new Event('input'));
    await settle();
    const visible = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).filter((option) => !option.hasAttribute('data-hidden'));
    expect(visible.map((option) => option.textContent?.trim())).toEqual(['Halle 2']);
    visible[0]?.click();
    await settle();
    expect(host.value()).toBe(2);
  });
});
