import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, required } from '@angular/forms/signals';

import { LtTextField } from './text-field';

@Component({
  imports: [LtTextField],
  template: `
    <form>
      <lt-text-field
        label="Artikelnummer"
        [id]="id()"
        [(value)]="value"
        [hint]="hint()"
        [error]="error()"
        [unit]="unit()"
        [prefix]="prefix()"
        [required]="required()"
        [disabled]="disabled()"
        [readonly]="readonly()"
        autocomplete="off"
        name="article"
        [maxLength]="12"
        (enter)="scanned.push($event)"
      />
    </form>
  `,
})
class TextFieldHost {
  readonly disabled = signal(false);
  readonly error = signal<string | null>(null);
  readonly hint = signal<string | undefined>(undefined);
  readonly id = signal<string | undefined>(undefined);
  readonly prefix = signal<string | undefined>(undefined);
  readonly readonly = signal(false);
  readonly required = signal(false);
  readonly scanned: string[] = [];
  readonly unit = signal<string | undefined>(undefined);
  readonly value = signal('');
}

@Component({
  imports: [LtTextField],
  template: `<form><lt-text-field label="Suche" /></form>`,
})
class PlainTextFieldHost {}

@Component({
  imports: [FormField, LtTextField],
  template: `<lt-text-field label="Name" [formField]="userForm.name" />`,
})
class SignalFormHost {
  readonly model = signal({ name: '' });
  readonly userForm = form(this.model, (path) => required(path.name, { message: 'Bitte einen Namen eingeben' }));
}

async function setup() {
  const fixture = TestBed.createComponent(TextFieldHost);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  return { element, fixture, host: fixture.componentInstance, input: () => element.querySelector('input') as HTMLInputElement };
}

function typeInto(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

function pressEnter(input: HTMLInputElement): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' });
  input.dispatchEvent(event);
  return event;
}

describe('LtTextField', () => {
  it('links the visible label to a generated or given id', async () => {
    const { element, fixture, input } = await setup();
    const label = element.querySelector('label') as HTMLLabelElement;
    expect(input().id).toMatch(/^lt-text-field-\d+$/);
    expect(label.getAttribute('for')).toBe(input().id);
    expect(label.textContent?.trim()).toBe('Artikelnummer');

    fixture.componentInstance.id.set('article');
    await fixture.whenStable();
    expect(input().id).toBe('article');
    expect(label.getAttribute('for')).toBe('article');
  });

  it('binds the value two-way', async () => {
    const { fixture, host, input } = await setup();
    typeInto(input(), '4711');
    expect(host.value()).toBe('4711');
    host.value.set('0815');
    await fixture.whenStable();
    expect(input().value).toBe('0815');
  });

  it('wires hint and error via aria-describedby and sets aria-invalid', async () => {
    const { element, fixture, host, input } = await setup();
    host.hint.set('Steht auf dem Etikett');
    await fixture.whenStable();
    expect(input().getAttribute('aria-describedby')).toBe(`${input().id}-hint`);
    expect(input().hasAttribute('aria-invalid')).toBe(false);

    host.error.set('Unbekannte Artikelnummer');
    await fixture.whenStable();
    expect(input().getAttribute('aria-describedby')).toBe(`${input().id}-hint ${input().id}-error`);
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Unbekannte Artikelnummer');
  });

  it('sets aria-invalid on the first render when an error is given initially', async () => {
    const fixture = TestBed.createComponent(TextFieldHost);
    fixture.componentInstance.error.set('Pflichtfeld');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('renders unit and prefix as input group addons that describe the input', async () => {
    const { element, fixture, host, input } = await setup();
    host.unit.set('kg');
    host.prefix.set('ca.');
    await fixture.whenStable();
    const group = element.querySelector('[data-slot="input-group"]') as HTMLElement;
    expect(group).not.toBeNull();
    const id = input().id;
    expect(element.querySelector(`#${id}-unit`)?.textContent?.trim()).toBe('kg');
    expect(element.querySelector(`#${id}-prefix`)?.textContent?.trim()).toBe('ca.');
    expect(input().getAttribute('aria-describedby')).toBe(`${id}-prefix ${id}-unit`);
  });

  it('marks required fields on the label and the input', async () => {
    const { element, fixture, host, input } = await setup();
    host.required.set(true);
    await fixture.whenStable();
    expect(input().required).toBe(true);
    expect(element.querySelector('label [aria-hidden="true"]')?.textContent).toBe('*');
  });

  it('passes the native attributes through', async () => {
    const { fixture, host, input } = await setup();
    expect(input().getAttribute('name')).toBe('article');
    expect(input().getAttribute('autocomplete')).toBe('off');
    expect(input().getAttribute('maxlength')).toBe('12');
    expect(input().type).toBe('text');
    host.disabled.set(true);
    host.readonly.set(true);
    await fixture.whenStable();
    expect(input().disabled).toBe(true);
    expect(input().readOnly).toBe(true);
  });

  it('emits ENTER with the value and blocks the implicit submit while handled', async () => {
    const { host, input } = await setup();
    typeInto(input(), 'SCAN-123');
    const event = pressEnter(input());
    expect(host.scanned).toEqual(['SCAN-123']);
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps the implicit submit without an (enter) handler', async () => {
    const fixture = TestBed.createComponent(PlainTextFieldHost);
    await fixture.whenStable();
    const event = pressEnter((fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement);
    expect(event.defaultPrevented).toBe(false);
  });

  it('works as a Signal Forms control and shows the error once touched', async () => {
    const fixture = TestBed.createComponent(SignalFormHost);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector('input') as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(element.querySelector('label [aria-hidden="true"]')).not.toBeNull();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(input.hasAttribute('aria-invalid')).toBe(false);

    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(fixture.componentInstance.userForm.name().touched()).toBe(true);
    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Bitte einen Namen eingeben');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    typeInto(input, 'Ada');
    await fixture.whenStable();
    expect(fixture.componentInstance.model().name).toBe('Ada');
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });
});
