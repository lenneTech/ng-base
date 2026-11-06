import { Component, computed } from '@angular/core';

import { HlmButton } from '../helm/button';
import { HlmDialogDescription, HlmDialogFooter, HlmDialogHeader, HlmDialogTitle } from '../helm/dialog';
import type { LtConfirmOptions } from './overlay';
import { injectLtOverlayData, injectLtOverlayRef } from './overlay-ref';
import { injectLtUiI18n } from './i18n';

/**
 * Content of `LtOverlayService.confirm()` (`role="alertdialog"`, labelled by the title, described by the
 * description). Cancel resolves `false`, confirm `true`; destructive questions start with focus on cancel.
 */
@Component({
  selector: 'lt-confirm-dialog',
  imports: [HlmButton, HlmDialogDescription, HlmDialogFooter, HlmDialogHeader, HlmDialogTitle],
  host: { class: 'grid gap-6' },
  templateUrl: './confirm-dialog.html',
})
export class LtConfirmDialog {
  protected readonly options = injectLtOverlayData<LtConfirmOptions>();
  protected readonly ref = injectLtOverlayRef<boolean>();
  private readonly i18n = injectLtUiI18n();

  protected readonly cancelLabel = computed(() => this.options.cancelLabel ?? this.i18n.t('lt.ui.cancel'));
  protected readonly confirmLabel = computed(() => this.options.confirmLabel ?? this.i18n.t('lt.ui.confirm'));
}
