import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LtI18nService } from '@lenne.tech/ng-base';

import { LtBreadcrumb } from './breadcrumb';

async function render(label?: string) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  TestBed.inject(LtI18nService).setLocale('de');
  const fixture = TestBed.createComponent(LtBreadcrumb);
  fixture.componentRef.setInput('items', [{ label: 'Start', link: '/' }, { label: 'Aufträge', link: ['/orders'] }, { label: 'Gruppe' }, { label: 'A-1001', link: '/orders/1' }]);
  if (label) {
    fixture.componentRef.setInput('label', label);
  }
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('LtBreadcrumb', () => {
  it('is a labelled nav with an ordered list', async () => {
    const element = await render();
    const nav = element.querySelector('nav') as HTMLElement;
    expect(nav.getAttribute('aria-label')).toBe('Brotkrumennavigation');
    expect(nav.querySelectorAll('ol > li')).toHaveLength(4);
  });

  it('takes a custom accessible name', async () => {
    expect((await render('Pfad')).querySelector('nav')?.getAttribute('aria-label')).toBe('Pfad');
  });

  it('links all but the last item and marks the last as the current page', async () => {
    const element = await render();
    const links = Array.from(element.querySelectorAll('a'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/', '/orders']);
    const current = element.querySelector('[aria-current="page"]') as HTMLElement;
    expect(current.textContent?.trim()).toBe('A-1001');
    expect(current.tagName).toBe('SPAN');
  });

  it('keeps the separators inside the list items and hidden', async () => {
    const element = await render();
    const separators = element.querySelectorAll('li > [data-slot="breadcrumb-separator"]');
    expect(separators).toHaveLength(3);
    separators.forEach((separator) => expect(separator.getAttribute('aria-hidden')).toBe('true'));
  });
});
