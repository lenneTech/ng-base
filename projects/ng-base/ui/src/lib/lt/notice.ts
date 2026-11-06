import { Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideCircleCheck, lucideInfo, lucideTriangleAlert } from '@ng-icons/lucide';

import { HlmAlert, HlmAlertTitle } from '../helm/alert';

/** Notice variants. */
export type LtNoticeVariant = 'error' | 'info' | 'neutral' | 'success' | 'warning';

const ICONS: Record<LtNoticeVariant, string> = {
  error: 'lucideCircleAlert',
  info: 'lucideInfo',
  neutral: 'lucideInfo',
  success: 'lucideCircleCheck',
  warning: 'lucideTriangleAlert',
};

/**
 * Notice/alert box (Spartan alert, icon per variant, `role="alert"` for errors and warnings, `status` otherwise).
 * Colors come from the semantic tokens (`error`, `warning`, `success`, `info`; `neutral` uses the card colors).
 * Project the message as content.
 */
@Component({
  selector: 'lt-notice',
  imports: [HlmAlert, HlmAlertTitle, NgIcon],
  providers: [provideIcons({ lucideCircleAlert, lucideCircleCheck, lucideInfo, lucideTriangleAlert })],
  host: { class: 'block' },
  templateUrl: './notice.html',
})
export class LtNotice {
  readonly title = input<string>();
  readonly variant = input<LtNoticeVariant>('info');

  protected readonly icon = computed(() => ICONS[this.variant()]);
  protected readonly role = computed(() => (this.variant() === 'error' || this.variant() === 'warning' ? 'alert' : 'status'));
}
