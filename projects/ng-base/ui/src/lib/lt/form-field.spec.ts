import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { HlmInput } from '../helm/input';
import { LtFormField } from './form-field';

@Component({
  imports: [HlmInput, LtFormField],
  template: `
    <lt-form-field for="email" label="E-Mail" [hint]="hint()" [error]="error()" [required]="required()" [describedBy]="extra()">
      <input hlmInput id="email" />
    </lt-form-field>
  `,
})
class FormFieldHost {
  readonly error = signal<string | null>(null);
  readonly extra = signal<string[]>([]);
  readonly hint = signal<string | undefined>('Geschäftliche Adresse');
  readonly required = signal(false);
}

async function setup() {
  const fixture = TestBed.createComponent(FormFieldHost);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  return { element, fixture, input: element.querySelector('input') as HTMLInputElement, label: element.querySelector('label') as HTMLLabelElement };
}

describe('LtFormField', () => {
  it('links the label to the control and gives it a predictable id', async () => {
    const { label } = await setup();
    expect(label.getAttribute('for')).toBe('email');
    expect(label.id).toBe('email-label');
    expect(label.textContent?.trim()).toBe('E-Mail');
  });

  it('shows a required asterisk hidden from assistive technology', async () => {
    const { fixture, label } = await setup();
    expect(label.querySelector('[aria-hidden="true"]')).toBeNull();
    fixture.componentInstance.required.set(true);
    await fixture.whenStable();
    const asterisk = label.querySelector('[aria-hidden="true"]');
    expect(asterisk?.textContent).toBe('*');
  });

  it('describes a projected hlmInput with the hint', async () => {
    const { element, input } = await setup();
    expect(element.querySelector('#email-hint')?.textContent?.trim()).toBe('Geschäftliche Adresse');
    expect(input.getAttribute('aria-describedby')).toBe('email-hint');
  });

  it('announces the error and adds it to aria-describedby', async () => {
    const { element, fixture, input, label } = await setup();
    fixture.componentInstance.error.set('Bitte eine gültige Adresse eingeben');
    await fixture.whenStable();
    const error = element.querySelector('#email-error') as HTMLElement;
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent?.trim()).toBe('Bitte eine gültige Adresse eingeben');
    expect(input.getAttribute('aria-describedby')).toBe('email-hint email-error');
    expect(label.classList.contains('text-destructive')).toBe(true);

    fixture.componentInstance.error.set(null);
    fixture.componentInstance.hint.set(undefined);
    await fixture.whenStable();
    expect(element.querySelector('#email-error')).toBeNull();
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('registers extra description ids before hint and error', async () => {
    const { fixture, input } = await setup();
    fixture.componentInstance.extra.set(['email-unit']);
    await fixture.whenStable();
    expect(input.getAttribute('aria-describedby')).toBe('email-hint email-unit');
  });
});
