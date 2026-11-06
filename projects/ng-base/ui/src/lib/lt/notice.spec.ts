import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LtNotice, type LtNoticeVariant } from './notice';

@Component({
  imports: [LtNotice],
  template: `<lt-notice [variant]="variant()" [title]="title()">Bitte prüfen Sie die Eingaben.</lt-notice>`,
})
class NoticeHost {
  readonly title = signal<string | undefined>('Hinweis');
  readonly variant = signal<LtNoticeVariant>('info');
}

describe('LtNotice', () => {
  it('uses role="alert" for errors and warnings and role="status" otherwise', async () => {
    const fixture = TestBed.createComponent(NoticeHost);
    const roles: Record<string, string | null> = {};
    for (const variant of ['error', 'warning', 'info', 'success', 'neutral'] as const) {
      fixture.componentInstance.variant.set(variant);
      await fixture.whenStable();
      const alert = (fixture.nativeElement as HTMLElement).querySelector('[data-slot="alert"]') as HTMLElement;
      roles[variant] = alert.getAttribute('role');
      expect(alert.getAttribute('data-variant')).toBe(variant);
    }
    expect(roles).toEqual({ error: 'alert', info: 'status', neutral: 'status', success: 'status', warning: 'alert' });
  });

  it('renders the title, the projected message and a decorative icon', async () => {
    const fixture = TestBed.createComponent(NoticeHost);
    fixture.componentInstance.variant.set('success');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-slot="alert-title"]')?.textContent?.trim()).toBe('Hinweis');
    expect(element.querySelector('[data-slot="alert-description"]')?.textContent?.trim()).toBe('Bitte prüfen Sie die Eingaben.');
    const icon = element.querySelector('ng-icon') as HTMLElement;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.innerHTML).toContain('<svg');

    fixture.componentInstance.title.set(undefined);
    await fixture.whenStable();
    expect(element.querySelector('[data-slot="alert-title"]')).toBeNull();
  });
});
