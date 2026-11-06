import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LtI18nService } from '@lenne.tech/ng-base';

import { LtFormField } from './form-field';
import { LtPasswordInput } from './password-input';

@Component({
  imports: [LtFormField, LtPasswordInput],
  template: `
    <lt-form-field for="password" label="Passwort" hint="Mindestens 12 Zeichen">
      <lt-password-input id="password" autocomplete="new-password" [(value)]="value" [invalid]="invalid()" [disabled]="disabled()" />
    </lt-form-field>
  `,
})
class PasswordHost {
  readonly disabled = signal(false);
  readonly invalid = signal(false);
  readonly value = signal('');
}

async function setup() {
  TestBed.inject(LtI18nService).setLocale('de');
  const fixture = TestBed.createComponent(PasswordHost);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  return {
    button: element.querySelector('button') as HTMLButtonElement,
    fixture,
    host: fixture.componentInstance,
    input: element.querySelector('input') as HTMLInputElement,
  };
}

describe('LtPasswordInput', () => {
  it('renders a password input with autocomplete and the wrapping label', async () => {
    const { input } = await setup();
    expect(input.type).toBe('password');
    expect(input.id).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
    expect(input.getAttribute('name')).toBe('password');
    expect(input.getAttribute('aria-describedby')).toBe('password-hint');
  });

  it('toggles the visibility with an accessible button', async () => {
    const { button, fixture, input } = await setup();
    expect(button.getAttribute('aria-label')).toBe('Passwort anzeigen');
    expect(button.getAttribute('aria-controls')).toBe('password');
    expect(button.type).toBe('button');
    button.click();
    await fixture.whenStable();
    expect(input.type).toBe('text');
    expect(button.getAttribute('aria-label')).toBe('Passwort verbergen');
    button.click();
    await fixture.whenStable();
    expect(input.type).toBe('password');
  });

  it('binds the value two-way', async () => {
    const { fixture, host, input } = await setup();
    input.value = 'geheim';
    input.dispatchEvent(new Event('input'));
    expect(host.value()).toBe('geheim');
    host.value.set('neu');
    await fixture.whenStable();
    expect(input.value).toBe('neu');
  });

  it('marks the input invalid', async () => {
    const { fixture, host, input } = await setup();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    host.invalid.set(true);
    await fixture.whenStable();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('disables the input and the toggle', async () => {
    const { button, fixture, host, input } = await setup();
    host.disabled.set(true);
    await fixture.whenStable();
    expect(input.disabled).toBe(true);
    expect(button.disabled).toBe(true);
  });
});
