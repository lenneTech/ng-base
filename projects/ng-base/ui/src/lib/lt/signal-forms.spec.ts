import { ApplicationRef, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { disabled, form, FormField, required } from '@angular/forms/signals';
import { LtI18nService } from '@lenne.tech/ng-base';

import { provideSpartanHlm } from '../helm/utils';
import { LtDatePicker } from './date-picker';
import { LtDateTimePicker } from './date-time-picker';
import { LtFormField } from './form-field';
import { LtPasswordInput } from './password-input';
import { LtSelect, type LtSelectOption } from './select';

interface Shift {
  due: Date | null;
  hall: number | null;
  password: string;
  start: Date | null;
}

@Component({
  imports: [FormField, LtDatePicker, LtDateTimePicker, LtFormField, LtPasswordInput, LtSelect],
  template: `
    <lt-form-field for="hall" label="Halle"><lt-select id="hall" [options]="halls" [formField]="shiftForm.hall" /></lt-form-field>
    <lt-form-field for="due" label="Fällig am"><lt-date-picker id="due" [formField]="shiftForm.due" /></lt-form-field>
    <lt-form-field for="start" label="Beginn"><lt-date-time-picker id="start" [formField]="shiftForm.start" /></lt-form-field>
    <lt-form-field for="password" label="Passwort"><lt-password-input id="password" [formField]="shiftForm.password" /></lt-form-field>
  `,
})
class SignalFormsHost {
  readonly halls: LtSelectOption<number>[] = [
    { label: 'Halle 1', value: 1 },
    { label: 'Halle 2', value: 2 },
  ];
  readonly locked = signal(false);
  readonly model = signal<Shift>({ due: null, hall: null, password: '', start: null });
  readonly shiftForm = form(this.model, (path) => {
    required(path.hall);
    required(path.due);
    required(path.password);
    disabled(path.hall, () => this.locked());
    disabled(path.start, () => this.locked());
    disabled(path.password, () => this.locked());
  });
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
  const fixture = TestBed.createComponent(SignalFormsHost);
  await settle();
  return { element: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

describe('lt controls with Signal Forms', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((container) => (container.innerHTML = '')));

  it('keep every id unique (the host drops a static id)', async () => {
    const { element } = await setup();
    for (const id of ['hall', 'due', 'start', 'start-time', 'password']) {
      expect(element.querySelectorAll(`[id="${id}"]`), id).toHaveLength(1);
    }
  });

  it('write values back into the form model', async () => {
    const { element, host } = await setup();
    (element.querySelector('#hall') as HTMLButtonElement).click();
    await settle();
    (document.querySelectorAll<HTMLElement>('[role="option"]')[1] as HTMLElement).click();
    await settle();
    expect(host.model().hall).toBe(2);

    const due = element.querySelector('#due') as HTMLInputElement;
    due.dispatchEvent(new Event('focus'));
    due.value = '15.08.2026';
    due.dispatchEvent(new Event('input'));
    due.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
    await settle();
    expect(host.model().due).toEqual(new Date(2026, 7, 15));

    const password = element.querySelector('#password') as HTMLInputElement;
    password.value = 'sehr-geheim';
    password.dispatchEvent(new Event('input'));
    await settle();
    expect(host.model().password).toBe('sehr-geheim');
  });

  it('show the invalid state only after the field was touched', async () => {
    const { element, host } = await setup();
    const password = element.querySelector('#password') as HTMLInputElement;
    const due = element.querySelector('#due') as HTMLInputElement;
    expect(password.hasAttribute('aria-invalid')).toBe(false);
    expect(due.hasAttribute('aria-invalid')).toBe(false);
    expect(due.getAttribute('aria-required')).toBe('true');

    password.dispatchEvent(new Event('blur'));
    due.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await settle();
    expect(host.shiftForm.password().touched()).toBe(true);
    expect(host.shiftForm.due().touched()).toBe(true);
    expect(password.getAttribute('aria-invalid')).toBe('true');
    expect(due.getAttribute('aria-invalid')).toBe('true');
  });

  it('show model values and follow the disabled state of the field', async () => {
    const { element, host } = await setup();
    host.model.update((model) => ({ ...model, hall: 1, start: new Date(2026, 8, 1, 7, 15) }));
    await settle();
    expect((element.querySelector('#hall') as HTMLButtonElement).textContent?.trim()).toBe('Halle 1');
    expect((element.querySelector('#start-time') as HTMLInputElement).value).toBe('07:15');
    expect((element.querySelector('#password') as HTMLInputElement).disabled).toBe(false);

    host.locked.set(true);
    await settle();
    expect((element.querySelector('#hall') as HTMLButtonElement).disabled).toBe(true);
    expect((element.querySelector('#start') as HTMLInputElement).disabled).toBe(true);
    expect((element.querySelector('#start-time') as HTMLInputElement).disabled).toBe(true);
    expect((element.querySelector('#password') as HTMLInputElement).disabled).toBe(true);
  });
});
