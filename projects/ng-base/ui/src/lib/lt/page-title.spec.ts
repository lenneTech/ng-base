import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LtPageTitle, LtPageTitleActions } from './page-title';

@Component({
  imports: [LtPageTitle, LtPageTitleActions],
  template: `
    <lt-page-title title="Aufträge" [level]="level()" description="Alle offenen Aufträge">
      <button ltPageTitleActions type="button">Neu</button>
    </lt-page-title>
  `,
})
class PageTitleHost {
  readonly level = signal<1 | 2 | 3>(1);
}

describe('LtPageTitle', () => {
  it('renders an h1 with the description by default', async () => {
    const fixture = TestBed.createComponent(LtPageTitle);
    fixture.componentRef.setInput('title', 'Dashboard');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Dashboard');
    expect(element.querySelector('p')).toBeNull();
    expect((element.querySelector('[hidden]') as HTMLElement | null)?.hidden).toBe(true);
  });

  it('follows the heading level and projects the actions', async () => {
    const fixture = TestBed.createComponent(PageTitleHost);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('p')?.textContent?.trim()).toBe('Alle offenen Aufträge');
    expect(element.querySelector('button')?.textContent?.trim()).toBe('Neu');
    expect(element.querySelector('[hidden]')).toBeNull();

    fixture.componentInstance.level.set(2);
    await fixture.whenStable();
    expect(element.querySelector('h1')).toBeNull();
    expect(element.querySelector('h2')?.textContent?.trim()).toBe('Aufträge');
    fixture.componentInstance.level.set(3);
    await fixture.whenStable();
    expect(element.querySelector('h3')?.textContent?.trim()).toBe('Aufträge');
  });
});
