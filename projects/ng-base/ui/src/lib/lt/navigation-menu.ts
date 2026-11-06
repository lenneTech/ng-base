import { Component, computed, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

import { HlmNavigationMenu, HlmNavigationMenuItem, HlmNavigationMenuLink, HlmNavigationMenuList } from '../helm/navigation-menu';
import { injectLtUiI18n } from './i18n';

/**
 * Navigation entry of {@link LtNavigationMenu} / `LtHeader`.
 *
 * `icon` is a Lucide icon name (e.g. `lucideHouse`) rendered with `ng-icon`; register the icons you use in the app
 * (`provideIcons({ lucideHouse })` in `app.config.ts` or the component providers).
 */
export interface LtNavigationItem {
  /** Lucide icon name (e.g. `lucideHouse`), optional. */
  icon?: string;
  label: string;
  /** Router link (internal). Either `link` or `href` is required. */
  link?: string;
  /** External URL; rendered as `<a href target="_blank" rel="noopener noreferrer">` with a screen-reader hint. */
  href?: string;
  /** Match the link exactly for the active state (default `false`). */
  exact?: boolean;
}

/**
 * Horizontal navigation (`nav` with `aria-current="page"`), collapses into the header's mobile menu.
 *
 * On Spartan's navigation menu with `RouterLink` + `RouterLinkActive` (`ariaCurrentWhenActive="page"`): the active
 * route is highlighted and announced, the arrow keys move between the links, Home/End jump.
 */
@Component({
  selector: 'lt-navigation-menu',
  imports: [HlmNavigationMenu, HlmNavigationMenuItem, HlmNavigationMenuLink, HlmNavigationMenuList, NgIcon, RouterLink, RouterLinkActive],
  host: { class: 'block' },
  templateUrl: './navigation-menu.html',
})
export class LtNavigationMenu {
  private readonly i18n = injectLtUiI18n();

  readonly items = input.required<readonly LtNavigationItem[]>();
  /** Accessible name of the `nav` (default `Hauptnavigation`, i18n `lt.ui.mainNavigation`). */
  readonly label = input<string>();
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  /** A link was activated (the header closes its mobile menu). */
  readonly navigate = output<LtNavigationItem>();

  protected readonly navLabel = computed(() => this.label() || this.i18n.t('lt.ui.mainNavigation'));
  /** Screen-reader hint for external links. */
  protected readonly newTabHint = computed(() => this.i18n.t('lt.ui.opensInNewTab'));
}
