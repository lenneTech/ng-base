import { Component, computed, inject, input, signal } from '@angular/core';
import { LtI18nService } from '@lenne.tech/ng-base';
import { HlmBadgeImports, HlmNativeSelectImports } from '@lenne.tech/ng-base/ui';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAppWindow,
  lucideArrowUpDown,
  lucideCircleAlert,
  lucideCircleArrowRight,
  lucideClock,
  lucideFileText,
  lucideHand,
  lucideInfo,
  lucideKeyboard,
  lucideMousePointerClick,
  lucidePencil,
  lucideSend,
  lucideX,
} from '@ng-icons/lucide';

import type { LtUserInteractionEvent } from '../bug-types';

let nextId = 0;

const ICONS: Record<string, string> = {
  click: 'lucideMousePointerClick',
  error: 'lucideCircleAlert',
  form_change: 'lucideFileText',
  form_submit: 'lucideSend',
  hover: 'lucideHand',
  input_change: 'lucidePencil',
  keyboard: 'lucideKeyboard',
  modal_close: 'lucideX',
  modal_open: 'lucideAppWindow',
  navigation: 'lucideCircleArrowRight',
  scroll: 'lucideArrowUpDown',
};

const COLORS: Record<string, string> = {
  error: 'text-error',
  form_change: 'text-success',
  form_submit: 'text-success',
  input_change: 'text-warning',
  keyboard: 'text-info',
  modal_close: 'text-error',
  modal_open: 'text-info',
  navigation: 'text-info',
};

/**
 * User journey timeline (the counterpart of `UserJourneyTimeline.vue`): filter by event type, one row per event with
 * icon, type, time, target and details (text, value, URL, scroll position, key, error).
 */
@Component({
  selector: 'lt-bug-journey-timeline',
  imports: [HlmBadgeImports, HlmNativeSelectImports, NgIcon],
  providers: [
    provideIcons({
      lucideAppWindow,
      lucideArrowUpDown,
      lucideCircleAlert,
      lucideCircleArrowRight,
      lucideClock,
      lucideFileText,
      lucideHand,
      lucideInfo,
      lucideKeyboard,
      lucideMousePointerClick,
      lucidePencil,
      lucideSend,
      lucideX,
    }),
  ],
  templateUrl: './bug-journey-timeline.html',
  host: { class: 'flex flex-col gap-3' },
})
export class LtBugJourneyTimeline {
  readonly events = input.required<readonly LtUserInteractionEvent[]>();

  protected readonly i18n = inject(LtI18nService);
  protected readonly filterId = `lt-bug-journey-${nextId++}-filter`;
  protected readonly filter = signal('all');
  protected readonly types = computed(() => ['all', ...new Set(this.events().map((event) => event.type))]);
  protected readonly filtered = computed(() => {
    const filter = this.filter();
    return filter === 'all' ? this.events() : this.events().filter((event) => event.type === filter);
  });

  protected typeLabel(type: string): string {
    if (type === 'all') {
      return this.i18n.t('lt.bug.allEventTypes');
    }
    const key = `lt.bug.events.${type}`;
    const label = this.i18n.t(key);
    return label === key ? type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : label;
  }

  protected icon(type: string): string {
    return ICONS[type] ?? 'lucideInfo';
  }

  protected color(type: string): string {
    return COLORS[type] ?? 'text-primary';
  }

  protected time(timestamp: string): string {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(this.i18n.locale() === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /** Details line (same order as `@lenne.tech/bug.lt`). */
  protected details(event: LtUserInteractionEvent): string {
    const metadata = event.metadata;
    if (!metadata) {
      return '';
    }
    const parts: string[] = [];
    if (metadata.text) {
      parts.push(`${this.i18n.t('lt.bug.metaText')}: ${metadata.text.length > 30 ? `${metadata.text.slice(0, 30)}…` : metadata.text}`);
    }
    if (metadata.value) {
      parts.push(`${this.i18n.t('lt.bug.metaValue')}: ${metadata.value}`);
    }
    if (metadata.url && metadata.url !== metadata.toUrl) {
      parts.push(`${this.i18n.t('lt.bug.metaUrl')}: ${metadata.url}`);
    }
    if (metadata.toUrl) {
      parts.push(`→ ${metadata.toUrl}`);
    }
    if (metadata.scrollPosition !== undefined) {
      parts.push(`${this.i18n.t('lt.bug.metaPosition')}: ${metadata.scrollPosition}px`);
    }
    if (metadata.key) {
      parts.push(`${this.i18n.t('lt.bug.metaKey')}: ${metadata.key}`);
    }
    if (metadata.errorMessage) {
      parts.push(`${this.i18n.t('lt.bug.metaError')}: ${metadata.errorMessage}`);
    }
    return parts.join(' | ');
  }
}
