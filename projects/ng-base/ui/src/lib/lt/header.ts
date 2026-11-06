import { Component, computed, Directive, input, model } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMenu } from '@ng-icons/lucide';

import { HlmButton } from '../helm/button';
import { HlmSheetImports } from '../helm/sheet';
import { nextLtId } from './control';
import { LtNavigationMenu, type LtNavigationItem } from './navigation-menu';
import { injectLtUiI18n } from './i18n';

/** Marks the logo of an {@link LtHeader} (inside the home link). */
@Directive({
  selector: '[ltHeaderLogo]',
})
export class LtHeaderLogo {}

/** Marks the actions of an {@link LtHeader} (color mode, user menu …), shown on all screen sizes. */
@Directive({
  selector: '[ltHeaderActions]',
})
export class LtHeaderActions {}

/**
 * Sticky app header: logo/title (`[ltHeaderLogo]`), navigation, actions (`[ltHeaderActions]`), and a mobile menu
 * (sheet) below `md`. `[(menuOpen)]` controls the mobile menu.
 *
 * - The logo and the title form one link to `homeLink`. Without `title` the link is named by `homeLabel` (default
 *   `lt.ui.home`), so an image logo can use `alt=""`.
 * - Below `md` the navigation moves into a sheet opened by a menu button (`aria-expanded`, `aria-controls`); the sheet
 *   traps the focus, closes on ESC, the backdrop or a navigation, and returns the focus to the button.
 * - The skip link and the `main` landmark are the app's job.
 */
@Component({
  selector: 'lt-header',
  imports: [HlmButton, HlmSheetImports, LtNavigationMenu, NgIcon, RouterLink],
  providers: [provideIcons({ lucideMenu })],
  host: { class: 'bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-40 block w-full border-b backdrop-blur' },
  templateUrl: './header.html',
})
export class LtHeader {
  protected readonly i18n = injectLtUiI18n();

  readonly items = input<readonly LtNavigationItem[]>([]);
  readonly menuOpen = model(false);
  /** Title next to the logo, links to `homeLink`. */
  readonly title = input<string>();
  readonly homeLink = input<string>('/');
  /** Accessible name of the home link when no `title` is shown (default `lt.ui.home`). */
  readonly homeLabel = input<string>();
  /** Accessible name of the navigation (default `lt.ui.mainNavigation`). */
  readonly navigationLabel = input<string>();

  protected readonly menuId = nextLtId('header-menu');
  protected readonly menuTitle = computed(() => this.title() || this.i18n.t('lt.ui.menu'));
  protected readonly homeAriaLabel = computed(() => (this.title() ? null : this.homeLabel() || this.i18n.t('lt.ui.home')));

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected onSheetState(state: string): void {
    if (state === 'closed' && this.menuOpen()) {
      this.menuOpen.set(false);
    }
  }
}
