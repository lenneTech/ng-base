import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideIcons } from '@ng-icons/core';
import { lucideLock } from '@ng-icons/lucide';

import { LtPageCard, LtPageCardFooter } from './page-card';

@Component({
  imports: [LtPageCard, LtPageCardFooter],
  providers: [provideIcons({ lucideLock })],
  template: `
    <lt-page-card icon="lucideLock" title="Anmelden" description="Mit Ihrem Firmenkonto" [level]="level()">
      <form class="login"></form>
      @if (withFooter()) {
        <a ltPageCardFooter href="/forgot">Passwort vergessen?</a>
      }
    </lt-page-card>
  `,
})
class PageCardHost {
  readonly level = signal<1 | 2>(1);
  readonly withFooter = signal(true);
}

async function setup() {
  const fixture = TestBed.createComponent(PageCardHost);
  await fixture.whenStable();
  return { element: fixture.nativeElement as HTMLElement, fixture, host: fixture.componentInstance };
}

describe('LtPageCard', () => {
  it('renders a centered, max-w-md card section labelled by its heading', async () => {
    const { element } = await setup();
    const host = element.querySelector('lt-page-card') as HTMLElement;
    expect(host.classList.contains('justify-center')).toBe(true);
    const section = host.querySelector('section') as HTMLElement;
    expect(section.classList.contains('max-w-md')).toBe(true);
    const heading = section.querySelector('h1') as HTMLElement;
    expect(heading.textContent?.trim()).toBe('Anmelden');
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(section.querySelector('[data-slot="card-description"]')?.textContent?.trim()).toBe('Mit Ihrem Firmenkonto');
    expect(section.querySelector('form.login')).not.toBeNull();
  });

  it('shows the icon and the footer slot', async () => {
    const { element, fixture, host } = await setup();
    expect(element.querySelector('ng-icon')?.innerHTML).toContain('<svg');
    const footer = element.querySelector('[data-slot="card-footer"]') as HTMLElement;
    expect(footer.hidden).toBe(false);
    expect(footer.querySelector('a')?.textContent?.trim()).toBe('Passwort vergessen?');
    host.withFooter.set(false);
    await fixture.whenStable();
    expect(footer.hidden).toBe(true);
  });

  it('supports an h2 title', async () => {
    const { element, fixture, host } = await setup();
    host.level.set(2);
    await fixture.whenStable();
    expect(element.querySelector('h1')).toBeNull();
    expect(element.querySelector('h2')?.textContent?.trim()).toBe('Anmelden');
  });
});
