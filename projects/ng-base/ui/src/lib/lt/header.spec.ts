import { ApplicationRef, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LtI18nService } from '@lenne.tech/ng-base';

import { provideSpartanHlm } from '../helm/utils';
import { LtHeader, LtHeaderActions, LtHeaderLogo } from './header';
import type { LtNavigationItem } from './navigation-menu';

@Component({ template: '' })
class EmptyPage {}

@Component({
  imports: [LtHeader, LtHeaderActions, LtHeaderLogo],
  template: `
    <lt-header title="Lagerverwaltung" homeLink="/dashboard" [items]="items()" [(menuOpen)]="menuOpen">
      <img ltHeaderLogo src="logo.svg" alt="" width="24" height="24" />
      <button ltHeaderActions type="button" class="user">Konto</button>
    </lt-header>
  `,
})
class HeaderHost {
  readonly items = signal<LtNavigationItem[]>([
    { label: 'Aufträge', link: '/orders' },
    { label: 'Lager', link: '/stock' },
  ]);
  readonly menuOpen = signal(false);
}

async function settle(): Promise<void> {
  const appRef = TestBed.inject(ApplicationRef);
  for (let i = 0; i < 3; i++) {
    appRef.tick();
    await appRef.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
}

async function setup() {
  TestBed.configureTestingModule({
    providers: [provideSpartanHlm(), provideRouter([{ component: EmptyPage, path: '**' }])],
  });
  TestBed.inject(LtI18nService).setLocale('de');
  const fixture = TestBed.createComponent(HeaderHost);
  await settle();
  const element = fixture.nativeElement as HTMLElement;
  return { element, fixture, host: fixture.componentInstance, menuButton: element.querySelector('button[aria-controls]') as HTMLButtonElement };
}

describe('LtHeader', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((container) => (container.innerHTML = '')));

  it('renders a sticky banner with the home link, logo, navigation and actions', async () => {
    const { element } = await setup();
    const host = element.querySelector('lt-header') as HTMLElement;
    expect(host.classList.contains('sticky')).toBe(true);
    expect(host.querySelector('header')).not.toBeNull();
    const home = host.querySelector('header > a') as HTMLAnchorElement;
    expect(home.getAttribute('href')).toBe('/dashboard');
    expect(home.querySelector('img')).not.toBeNull();
    expect(home.textContent?.trim()).toBe('Lagerverwaltung');
    expect(host.querySelector('lt-navigation-menu nav')?.getAttribute('aria-label')).toBe('Hauptnavigation');
    expect(host.querySelector('button.user')?.textContent?.trim()).toBe('Konto');
  });

  it('names the home link by the title, otherwise by homeLabel / lt.ui.home', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(LtI18nService).setLocale('de');
    const fixture = TestBed.createComponent(LtHeader);
    await fixture.whenStable();
    const home = (fixture.nativeElement as HTMLElement).querySelector('header > a') as HTMLAnchorElement;
    expect(home.getAttribute('aria-label')).toBe('Startseite');
    fixture.componentRef.setInput('homeLabel', 'Zur Übersicht');
    await fixture.whenStable();
    expect(home.getAttribute('aria-label')).toBe('Zur Übersicht');
    fixture.componentRef.setInput('title', 'Lager');
    await fixture.whenStable();
    expect(home.hasAttribute('aria-label')).toBe(false);
  });

  it('has a mobile menu button with aria-expanded and aria-controls', async () => {
    const { fixture, host, menuButton } = await setup();
    expect(menuButton.getAttribute('aria-label')).toBe('Menü');
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
    expect(menuButton.getAttribute('aria-controls')).toMatch(/^lt-header-menu-\d+$/);
    expect(menuButton.classList.contains('md:hidden')).toBe(true);

    menuButton.click();
    await settle();
    await fixture.whenStable();
    expect(host.menuOpen()).toBe(true);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens a sheet with the vertical navigation and closes it on navigation', async () => {
    const { host, menuButton } = await setup();
    menuButton.click();
    await settle();
    const sheet = document.getElementById(menuButton.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(sheet).not.toBeNull();
    expect(sheet.querySelector('h2')?.textContent?.trim()).toBe('Lagerverwaltung');
    const nav = sheet.querySelector('nav') as HTMLElement;
    expect(nav.getAttribute('data-orientation')).toBe('vertical');
    expect(document.querySelector('cdk-dialog-container')?.getAttribute('aria-labelledby')).toBeTruthy();

    (nav.querySelectorAll('a')[1] as HTMLAnchorElement).click();
    await settle();
    expect(host.menuOpen()).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/stock');
    expect(document.getElementById(menuButton.getAttribute('aria-controls') ?? '')).toBeNull();
  });

  it('syncs menuOpen when the sheet is dismissed and hides the menu button without items', async () => {
    const { element, fixture, host, menuButton } = await setup();
    host.menuOpen.set(true);
    await settle();
    expect(document.getElementById(menuButton.getAttribute('aria-controls') ?? '')).not.toBeNull();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
    await settle();
    expect(host.menuOpen()).toBe(false);

    host.items.set([]);
    await fixture.whenStable();
    expect(element.querySelector('button[aria-controls]')).toBeNull();
    expect(element.querySelector('lt-navigation-menu')).toBeNull();
  });
});
