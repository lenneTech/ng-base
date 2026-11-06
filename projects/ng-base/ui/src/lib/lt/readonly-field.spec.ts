import { TestBed } from '@angular/core/testing';
import { LtI18nService } from '@lenne.tech/ng-base';

import { LtReadonlyField } from './readonly-field';

async function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(LtReadonlyField);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  return { dd: element.querySelector('dd') as HTMLElement, dt: element.querySelector('dt') as HTMLElement, element };
}

describe('LtReadonlyField', () => {
  it('renders a dl with label and value', async () => {
    const { dd, dt, element } = await render({ label: 'Auftrag', value: 'A-1001' });
    expect(element.querySelector('dl')).not.toBeNull();
    expect(dt.textContent?.trim()).toBe('Auftrag');
    expect(dd.textContent?.trim()).toBe('A-1001');
  });

  it('falls back to a dash for empty values and hides the unit then', async () => {
    for (const value of [null, undefined, '']) {
      const { dd } = await render({ label: 'Gewicht', unit: 'kg', value });
      expect(dd.textContent?.trim()).toBe('–');
    }
    const { dd } = await render({ label: 'Menge', value: 0 });
    expect(dd.textContent?.trim()).toBe('0');
  });

  it('shows the unit and formats numbers for the locale on request', async () => {
    TestBed.inject(LtI18nService).setLocale('de');
    const { dd } = await render({ label: 'Gewicht', numberFormat: { maximumFractionDigits: 1 }, unit: 'kg', value: 1234.56 });
    expect(dd.textContent?.replace(/\s+/g, ' ').trim()).toBe('1.234,6 kg');
  });
});
