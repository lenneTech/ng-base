import { afterNextRender, Component, computed, ElementRef, inject, Injector, signal } from '@angular/core';
import { disabled, form, FormField, maxLength, required, submit, type FieldTree } from '@angular/forms/signals';
import { LT_I18N_OPTIONS, LtI18nService } from '@lenne.tech/ng-base';
import {
  HlmButtonImports,
  HlmCollapsibleImports,
  HlmDialogImports,
  HlmSpinnerImports,
  HlmSwitchImports,
  HlmTextareaImports,
  injectLtOverlayRef,
  LtFormField,
  LtNotice,
  LtOverlayService,
  LtSelect,
  LtTextField,
  type LtOverlayRef,
  type LtSelectOption,
} from '@lenne.tech/ng-base/ui';
import { ltFocusFirstInvalid } from '@lenne.tech/ng-base/utils';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideX } from '@ng-icons/lucide';

import { LtBugReportService } from '../bug-report-service';
import type { LtBugAttachment, LtBugReportType, LtUserInteractionEvent } from '../bug-types';
import { registerLtBugMessages } from '../i18n/messages';
import { emptyLtBugReportForm, ltBugPrefillFromError, ltDataUrlSize, type LtBugReportFormValue, type LtBugReportIncludes } from '../report';
import { LtBugAttachments } from './bug-attachments';
import { LtBugJourneyTimeline } from './bug-journey-timeline';

const TYPES: readonly LtBugReportType[] = ['bug', 'feature', 'enhancement', 'other'];

/**
 * Content of the bug report dialog (opened by `<lt-bug-report>` through {@link openLtBugReportDialog}): title, type,
 * description, expected behavior, steps, attachments with the screenshot, switches for the collected data and the user
 * journey preview. Signal Forms validation; a failed submit focuses the first invalid field. Loaded on first use.
 */
@Component({
  selector: 'lt-bug-report-dialog',
  imports: [
    FormField,
    HlmButtonImports,
    HlmCollapsibleImports,
    HlmDialogImports,
    HlmSpinnerImports,
    HlmSwitchImports,
    HlmTextareaImports,
    LtBugAttachments,
    LtBugJourneyTimeline,
    LtFormField,
    LtNotice,
    LtSelect,
    LtTextField,
    NgIcon,
  ],
  providers: [provideIcons({ lucideChevronDown, lucideX })],
  templateUrl: './bug-report-dialog.html',
  host: { 'data-lt-bug-ui': '', class: 'grid min-w-0 gap-6' },
})
export class LtBugReportDialog {
  protected readonly bug = inject(LtBugReportService);
  protected readonly i18n = registered(inject(LtI18nService), inject(LT_I18N_OPTIONS).messages);
  private readonly ref = injectLtOverlayRef<boolean>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly model = signal<LtBugReportFormValue>(initialForm(this.bug.lastError()));
  protected readonly reportForm = form(this.model, (path) => {
    required(path.title, { message: this.i18n.t('lt.bug.titleRequired') });
    maxLength(path.title, 255);
    required(path.type, { message: this.i18n.t('lt.bug.typeRequired') });
    required(path.description, { message: this.i18n.t('lt.bug.descriptionRequired') });
    disabled(path, () => this.bug.isSubmitting());
  });

  protected readonly attachments = signal<LtBugAttachment[]>(initialAttachments(this.bug.screenshot()));
  protected readonly includes = signal<LtBugReportIncludes>({ browserInfo: true, consoleLogs: true, networkRequests: true, userJourney: true });
  protected readonly showAdditional = signal(false);
  protected readonly showJourney = signal(false);

  /** Snapshot of the collected data at opening time. */
  protected readonly journey: LtUserInteractionEvent[] = this.bug.getUserJourney();
  protected readonly consoleCount = this.bug.getConsoleLogs().length;
  protected readonly networkCount = this.bug.getNetworkRequests().length;

  protected readonly options = this.bug.options;
  protected readonly journeyEnabled = this.options.enableUserJourney && this.options.userJourney.enabled;
  protected readonly hasScreenshot = computed(() => this.attachments().some((attachment) => attachment.isScreenshot));
  protected readonly typeOptions = computed<LtSelectOption<LtBugReportType>[]>(() => TYPES.map((type) => ({ label: this.i18n.t(`lt.bug.types.${type}`), value: type })));
  protected readonly typeError = computed(() => fieldError(this.reportForm.type));
  protected readonly descriptionError = computed(() => fieldError(this.reportForm.description));

  protected setInclude(key: keyof LtBugReportIncludes, value: boolean): void {
    this.includes.update((current) => ({ ...current, [key]: value }));
  }

  protected addAttachments(added: LtBugAttachment[]): void {
    this.attachments.update((current) => [...current, ...added]);
  }

  protected removeAttachment(id: string): void {
    this.attachments.update((current) => current.filter((attachment) => attachment.id !== id));
  }

  protected cancel(): void {
    if (!this.bug.isSubmitting()) {
      this.ref.close(false);
    }
  }

  protected async onSubmit(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.bug.isSubmitting()) {
      return;
    }
    await submit(this.reportForm, {
      action: async () => {
        try {
          await this.bug.submit(await this.bug.buildReport(this.model(), this.attachments(), this.includes()));
          this.bug.reset();
          this.ref.close(true);
        } catch {
          // The error is shown in the dialog (and as a toast); the user can retry.
        }
        return undefined;
      },
      onInvalid: () => afterNextRender(() => ltFocusFirstInvalid(this.host.nativeElement, { offset: 0 }), { injector: this.injector }),
    });
  }
}

/**
 * Open the bug report dialog through `LtOverlayService` (focus trapped, Escape and backdrop close, focus returns to the
 * trigger). Resolves `true` after a sent report.
 */
export function openLtBugReportDialog(injector: Injector): LtOverlayRef<boolean> {
  return injector.get(LtOverlayService).open<boolean>(LtBugReportDialog, { contentClass: 'sm:max-w-2xl' });
}

/** Register the `lt.bug.*` texts (part of this lazy chunk) before the form schema reads its messages. */
function registered(i18n: LtI18nService, appMessages: Parameters<typeof registerLtBugMessages>[1]): LtI18nService {
  registerLtBugMessages(i18n, appMessages);
  return i18n;
}

function initialForm(error: ReturnType<LtBugReportService['lastError']>): LtBugReportFormValue {
  return error ? { ...emptyLtBugReportForm(), ...ltBugPrefillFromError(error) } : emptyLtBugReportForm();
}

function initialAttachments(screenshot: string | null): LtBugAttachment[] {
  if (!screenshot) {
    return [];
  }
  return [
    { data: screenshot, id: `screenshot-${Date.now()}`, isScreenshot: true, name: 'screenshot.png', preview: screenshot, size: ltDataUrlSize(screenshot), type: 'image/png' },
  ];
}

/** First error message of a touched, invalid field. */
function fieldError(field: FieldTree<unknown>): string | null {
  const state = field();
  return state.invalid() && state.touched() ? (state.errors().find((error) => !!error.message)?.message ?? null) : null;
}
