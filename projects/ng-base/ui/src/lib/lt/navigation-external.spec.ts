import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LtFooter } from './footer';
import { LtNavigationMenu, type LtNavigationItem } from './navigation-menu';

@Component({
  imports: [LtNavigationMenu, LtFooter],
  template: `<lt-navigation-menu [items]="items" /><lt-footer [links]="items" />`,
})
class Host {
  readonly items: LtNavigationItem[] = [
    { label: 'Start', link: '/' },
    { href: 'https://docs.example.com', label: 'Docs' },
  ];
}

describe('LtNavigationMenu / LtFooter external links', () => {
  it('renders href items as external links in a new tab with a screen-reader hint', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const external = Array.from(fixture.nativeElement.querySelectorAll('a[href="https://docs.example.com"]')) as HTMLAnchorElement[];
    expect(external).toHaveLength(2);
    for (const link of external) {
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
      expect(link.querySelector('.sr-only')?.textContent).toContain('(');
      expect(link.hasAttribute('aria-current')).toBe(false);
    }
    expect(fixture.nativeElement.querySelectorAll('a[href="/"]').length).toBe(2);
  });
});
