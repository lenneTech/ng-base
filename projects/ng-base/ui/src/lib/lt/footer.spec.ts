import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LtI18nService } from '@lenne.tech/ng-base';

import { LtFooter } from './footer';

@Component({ template: '' })
class EmptyPage {}

@Component({
  imports: [LtFooter],
  template: `<lt-footer [links]="links">© 2026 Beispiel GmbH</lt-footer>`,
})
class FooterHost {
  readonly links = [
    { label: 'Impressum', link: '/imprint' },
    { label: 'Datenschutz', link: '/privacy' },
  ];
}

describe('LtFooter', () => {
  it('renders a footer with the projected content and a labelled link row', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ component: EmptyPage, path: '**' }])] });
    TestBed.inject(LtI18nService).setLocale('de');
    const fixture = TestBed.createComponent(FooterHost);
    await TestBed.inject(Router).navigateByUrl('/privacy');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const footer = element.querySelector('footer') as HTMLElement;
    expect(footer.textContent).toContain('© 2026 Beispiel GmbH');
    expect(footer.querySelector('nav')?.getAttribute('aria-label')).toBe('Fußzeilennavigation');
    const links = Array.from(footer.querySelectorAll('a'));
    expect(links.map((link) => [link.textContent?.trim(), link.getAttribute('href'), link.getAttribute('aria-current')])).toEqual([
      ['Impressum', '/imprint', null],
      ['Datenschutz', '/privacy', 'page'],
    ]);
  });

  it('renders no nav without links', async () => {
    const fixture = TestBed.createComponent(LtFooter);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('footer')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('nav')).toBeNull();
  });
});
