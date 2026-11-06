import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LtI18nService } from '@lenne.tech/ng-base';
import { provideIcons } from '@ng-icons/core';
import { lucideHouse } from '@ng-icons/lucide';

import { LtNavigationMenu, type LtNavigationItem } from './navigation-menu';

@Component({ template: '' })
class EmptyPage {}

const ITEMS: LtNavigationItem[] = [
  { exact: true, icon: 'lucideHouse', label: 'Start', link: '/' },
  { label: 'Aufträge', link: '/orders' },
  { label: 'Lager', link: '/stock' },
];

async function setup(path = '/orders/42') {
  TestBed.configureTestingModule({
    providers: [
      provideIcons({ lucideHouse }),
      provideRouter([
        { component: EmptyPage, path: '' },
        { component: EmptyPage, path: 'orders/:id' },
        { component: EmptyPage, path: 'orders' },
        { component: EmptyPage, path: 'stock' },
      ]),
    ],
  });
  TestBed.inject(LtI18nService).setLocale('de');
  const fixture = TestBed.createComponent(LtNavigationMenu);
  fixture.componentRef.setInput('items', ITEMS);
  await TestBed.inject(Router).navigateByUrl(path);
  await fixture.whenStable();
  return { element: fixture.nativeElement as HTMLElement, fixture };
}

describe('LtNavigationMenu', () => {
  it('is a labelled nav with router links', async () => {
    const { element, fixture } = await setup();
    const nav = element.querySelector('nav') as HTMLElement;
    expect(nav.getAttribute('aria-label')).toBe('Hauptnavigation');
    expect(Array.from(element.querySelectorAll('a')).map((link) => link.getAttribute('href'))).toEqual(['/', '/orders', '/stock']);
    fixture.componentRef.setInput('label', 'Bereiche');
    await fixture.whenStable();
    expect(nav.getAttribute('aria-label')).toBe('Bereiche');
  });

  it('marks the active route with aria-current="page"', async () => {
    const { element, fixture } = await setup();
    const links = Array.from(element.querySelectorAll('a'));
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([null, 'page', null]);

    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual(['page', null, null]);
  });

  it('renders item icons and follows the orientation', async () => {
    const { element, fixture } = await setup();
    expect(element.querySelector('a ng-icon')?.innerHTML).toContain('<svg');
    fixture.componentRef.setInput('orientation', 'vertical');
    await fixture.whenStable();
    expect(element.querySelector('nav')?.getAttribute('data-orientation')).toBe('vertical');
    expect(element.querySelector('ul')?.getAttribute('data-orientation')).toBe('vertical');
  });

  it('emits navigate when a link is clicked', async () => {
    const { element, fixture } = await setup();
    const clicked: LtNavigationItem[] = [];
    fixture.componentInstance.navigate.subscribe((item) => clicked.push(item));
    (element.querySelectorAll('a')[2] as HTMLAnchorElement).click();
    await fixture.whenStable();
    expect(clicked.map((item) => item.label)).toEqual(['Lager']);
    expect(TestBed.inject(Router).url).toBe('/stock');
  });
});
