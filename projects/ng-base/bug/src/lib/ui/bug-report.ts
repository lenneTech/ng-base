import { booleanAttribute, Component, computed, effect, inject, Injector, input, signal, untracked } from '@angular/core';
import { LT_I18N_OPTIONS, LtI18nService } from '@lenne.tech/ng-base';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBug, lucideLoaderCircle } from '@ng-icons/lucide';

import { LtBugReportService } from '../bug-report-service';
import type { LtBugPosition } from '../bug-types';
import { registerLtBugEagerMessages } from '../i18n/load';

const POSITION_CLASSES: Record<LtBugPosition, string> = {
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
};

/**
 * Floating bug report button (the counterpart of `<BugReportButton>` of `@lenne.tech/bug.lt`). A click takes a
 * screenshot of the current page and opens the report dialog; the dialog (form, attachments, user journey) is loaded
 * on first use, so this component stays small. Creating it starts the capture (`LtBugReportService.start()`), it
 * serves `LtBugReportService.open()` requests, e.g. from `autoOpenOnError`, and renders nothing while the reporter is
 * inactive (production, or without `provideLtBug()`).
 *
 * Inputs override the `provideLtBug()` options for this instance. Render it once in the app shell, deferred and only
 * while the reporter is active (`LT_BUG_ACTIVE` from `@lenne.tech/ng-base/bug/provide`):
 *
 * @example
 * @if (bugActive) { @defer (on immediate) { <lt-bug-report /> } }
 */
@Component({
  selector: 'lt-bug-report',
  imports: [NgIcon],
  providers: [provideIcons({ lucideBug, lucideLoaderCircle })],
  templateUrl: './bug-report.html',
  host: { 'data-lt-bug-ui': '' },
})
export class LtBugReport {
  /** Button background (default option `buttonColor`). */
  readonly color = input<string>();
  /** ng-icons name of the icon (default option `buttonIcon`, else the Lucide bug); register custom icons yourself. */
  readonly icon = input<string>();
  /** Corner (default option `position`). */
  readonly position = input<LtBugPosition>();
  /** Show the floating button (default option `autoShow`). */
  readonly show = input<boolean | undefined, unknown>(undefined, { transform: (value: unknown) => (value === undefined ? undefined : booleanAttribute(value)) });
  /** Text next to the icon (default option `buttonText`). */
  readonly text = input<string>();

  protected readonly bug = inject(LtBugReportService);
  protected readonly i18n = inject(LtI18nService);
  private readonly injector = inject(Injector);

  /** Polite announcement after a sent report. */
  protected readonly announcement = signal('');
  protected readonly visible = computed(() => this.bug.active && (this.show() ?? this.bug.options.autoShow));
  protected readonly positionClass = computed(() => POSITION_CLASSES[this.position() ?? this.bug.options.position] ?? POSITION_CLASSES['bottom-right']);
  protected readonly buttonColor = computed(() => this.color() || this.bug.options.buttonColor);
  protected readonly buttonText = computed(() => this.text() ?? this.bug.options.buttonText ?? '');
  protected readonly buttonIcon = computed(() => this.icon() || this.bug.options.buttonIcon || 'lucideBug');

  constructor() {
    // The capture starts with the first instance (idempotent; a no-op while inactive and on the server).
    this.bug.start();
    // Only the button texts are needed up front; the dialog chunk registers the rest.
    registerLtBugEagerMessages(this.i18n, inject(LT_I18N_OPTIONS).messages);
    effect(() => {
      if (this.bug.openRequested() && this.bug.active) {
        untracked(() => {
          this.bug.openRequested.set(false);
          void this.openDialog();
        });
      }
    });
  }

  /** Take the screenshot, then open the dialog; resolves `true` when a report was sent. */
  async openDialog(): Promise<boolean> {
    if (!this.bug.active || this.bug.isOpen()) {
      return false;
    }
    this.bug.isOpen.set(true);
    this.announcement.set('');
    try {
      // Before the dialog exists, so the screenshot shows the page as the user saw it.
      await this.bug.captureScreenshot();
      const { openLtBugReportDialog } = await import('./bug-report-dialog');
      const sent = (await openLtBugReportDialog(this.injector).closed) === true;
      if (sent) {
        this.announcement.set(this.i18n.t('lt.bug.successTitle'));
      }
      return sent;
    } catch (error) {
      console.error('[@lenne.tech/ng-base/bug] Could not open the bug report dialog', error);
      return false;
    } finally {
      this.bug.isOpen.set(false);
    }
  }
}
