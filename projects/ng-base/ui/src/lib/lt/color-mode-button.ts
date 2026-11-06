import { Component, computed, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMoon, lucideSun } from '@ng-icons/lucide';

import { HlmButton } from '../helm/button';
import { LtColorModeService } from '@lenne.tech/ng-base/ui/provide';
import { injectLtUiI18n } from './i18n';

/**
 * Icon button that toggles light/dark (Lucide sun/moon, ghost `hlmBtn`).
 *
 * Accessibility: a toggle button with a constant label (`lt.ui.darkMode`) and `aria-pressed` for the dark state, as the
 * WAI-ARIA toggle button pattern recommends. The label is also the tooltip (`title`).
 */
@Component({
  selector: 'lt-color-mode-button',
  imports: [HlmButton, NgIcon],
  providers: [provideIcons({ lucideMoon, lucideSun })],
  templateUrl: './color-mode-button.html',
})
export class LtColorModeButton {
  protected readonly colorMode = inject(LtColorModeService);
  protected readonly i18n = injectLtUiI18n();

  /** Button size (`icon`, `icon-sm`, `icon-lg`). */
  readonly size = input<'icon' | 'icon-lg' | 'icon-sm'>('icon');

  protected readonly dark = computed(() => this.colorMode.resolved() === 'dark');
}
