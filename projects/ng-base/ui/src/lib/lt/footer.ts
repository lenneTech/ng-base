import { Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import type { LtNavigationItem } from './navigation-menu';
import { injectLtUiI18n } from './i18n';

/** Page footer (`footer`): project content; `links` render as a link row (`nav`, `lt.ui.footerNavigation`). */
@Component({
  selector: 'lt-footer',
  imports: [RouterLink, RouterLinkActive],
  host: { class: 'block border-t' },
  templateUrl: './footer.html',
})
export class LtFooter {
  private readonly i18n = injectLtUiI18n();

  readonly links = input<readonly LtNavigationItem[]>([]);
  /** Accessible name of the link row (default `lt.ui.footerNavigation`). */
  readonly label = input<string>();

  protected readonly navLabel = computed(() => this.label() || this.i18n.t('lt.ui.footerNavigation'));
  /** Screen-reader hint for external links. */
  protected readonly newTabHint = computed(() => this.i18n.t('lt.ui.opensInNewTab'));
}
