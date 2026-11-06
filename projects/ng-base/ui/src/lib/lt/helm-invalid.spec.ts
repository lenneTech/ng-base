import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, required } from '@angular/forms/signals';

import { HlmInput } from '../helm/input';
import { HlmTextarea } from '../helm/textarea';
import { provideSpartanHlm } from '../helm/utils';
import { LtTextField } from './text-field';

@Component({
  imports: [FormField, HlmInput, HlmTextarea, LtTextField],
  template: `
    <input id="native" hlmInput [formField]="f.a" />
    <textarea id="area" hlmTextarea [formField]="f.b"></textarea>
    <lt-text-field id="lt" label="C" [formField]="f.c" />
    <input id="forced" hlmInput [forceInvalid]="true" />
    <input id="forced-field" hlmInput [forceInvalid]="true" [formField]="f.d" />
  `,
})
class Fields {
  readonly model = signal({ a: '', b: '', c: '', d: '' });
  readonly f = form(this.model, (path) => {
    required(path.a);
    required(path.b);
    required(path.c);
    required(path.d);
  });
}

describe('helm controls with Signal Forms (lenne.Tech patch of generate-helm.mjs)', () => {
  async function render() {
    TestBed.configureTestingModule({ providers: [provideSpartanHlm()] });
    const fixture = TestBed.createComponent(Fields);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const element = (selector: string) => root.querySelector(selector) as HTMLElement;
    return { element, fixture };
  }

  it('an untouched empty required field is not announced as invalid (aria-invalid and data-invalid follow the error state)', async () => {
    const { element } = await render();
    for (const selector of ['#native', '#area', 'lt-text-field input']) {
      expect(element(selector).getAttribute('aria-invalid'), selector).toBeNull();
      expect(element(selector).getAttribute('data-invalid'), selector).toBeNull();
    }
    expect(element('#forced').getAttribute('aria-invalid')).toBe('true');
  });

  it('stays unannounced while typing and clearing without leaving the field (the Spartan binding must not win)', async () => {
    const { element, fixture } = await render();
    for (const value of ['x', '']) {
      for (const selector of ['#native', '#area']) {
        const field = element(selector) as HTMLInputElement | HTMLTextAreaElement;
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      fixture.detectChanges();
      await fixture.whenStable();
      for (const selector of ['#native', '#area']) {
        expect(element(selector).getAttribute('aria-invalid'), `${selector} after "${value}"`).toBeNull();
        expect(element(selector).getAttribute('data-invalid'), `${selector} after "${value}"`).toBeNull();
      }
    }
  });

  it('keeps a forced invalid state when the value becomes valid', async () => {
    const { element, fixture } = await render();
    const field = element('#forced-field') as HTMLInputElement;
    expect(field.getAttribute('aria-invalid')).toBe('true');
    field.value = 'valid';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(field.getAttribute('aria-invalid')).toBe('true');
  });

  it('is invalid once touched, like the red border', async () => {
    const { element, fixture } = await render();
    for (const selector of ['#native', '#area']) {
      element(selector).dispatchEvent(new Event('blur'));
    }
    fixture.detectChanges();
    await fixture.whenStable();
    for (const selector of ['#native', '#area']) {
      expect(element(selector).getAttribute('aria-invalid'), selector).toBe('true');
      expect(element(selector).getAttribute('data-matches-spartan-invalid'), selector).toBe('true');
    }
  });
});
