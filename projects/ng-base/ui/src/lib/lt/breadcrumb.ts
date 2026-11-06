import { Component, computed, input } from '@angular/core';

import { HlmBreadcrumb, HlmBreadcrumbItem, HlmBreadcrumbLink, HlmBreadcrumbList, HlmBreadcrumbPage, HlmBreadcrumbSeparator } from '../helm/breadcrumb';
import { injectLtUiI18n } from './i18n';

/** One breadcrumb entry; the last one is the current page (no link). */
export interface LtBreadcrumbItem {
  label: string;
  /** Router link (string or commands). */
  link?: string | unknown[];
}

/**
 * Breadcrumb trail on Spartan's breadcrumb (`nav[aria-label]`, `aria-current="page"` on the last item).
 * The separators sit inside the list items and are hidden from assistive technology. Needs the router (`RouterLink`).
 */
@Component({
  selector: 'lt-breadcrumb',
  imports: [HlmBreadcrumb, HlmBreadcrumbItem, HlmBreadcrumbLink, HlmBreadcrumbList, HlmBreadcrumbPage, HlmBreadcrumbSeparator],
  templateUrl: './breadcrumb.html',
})
export class LtBreadcrumb {
  private readonly i18n = injectLtUiI18n();

  /** Entries from the root to the current page. */
  readonly items = input.required<LtBreadcrumbItem[]>();
  /** Accessible name of the `nav` (default `lt.ui.breadcrumb`). */
  readonly label = input<string>();

  protected readonly navLabel = computed(() => this.label() || this.i18n.t('lt.ui.breadcrumb'));
}
