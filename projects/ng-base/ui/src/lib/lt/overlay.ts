import { inject, Service, type Type } from '@angular/core';
import type { BrnDialogOptions, BrnDialogRef } from '@spartan-ng/brain/dialog';

import { HlmDialogService } from '../helm/dialog';
import { hlm } from '../helm/utils';
import { LtConfirmDialog } from './confirm-dialog';
import { LT_OVERLAY_DATA, LT_OVERLAY_REF } from './overlay-ref';
import { injectLtUiI18n } from './i18n';

/**
 * Default classes of every overlay's content: never taller than the viewport, scrolls inside, so the actions of a long
 * form stay reachable on small screens. A `contentClass` with its own `max-h-*` / `overflow-*` replaces them.
 * (`scripts/generate-ui-sources.mjs` adds them to `components/dialog.css`.)
 */
export const LT_OVERLAY_CONTENT_CLASS = 'max-h-[calc(100dvh-2rem)] overflow-y-auto';

/** Options of {@link LtOverlayService.confirm}. */
export interface LtConfirmOptions {
  /** Cancel button label (default `lt.ui.cancel`). */
  cancelLabel?: string;
  /** Confirm button label (default `lt.ui.confirm`). */
  confirmLabel?: string;
  description?: string;
  /** Destructive styling of the confirm button (delete, sign out everywhere …). */
  destructive?: boolean;
  title: string;
}

/** Options of {@link LtOverlayService.open}. */
export interface LtOverlayOptions<D> {
  /** Data for the component (`injectLtOverlayData<D>()`). */
  data?: D;
  /** Close on backdrop click / Escape (default `true`). */
  dismissible?: boolean;
  /** Extra classes on the dialog content, merged over {@link LT_OVERLAY_CONTENT_CLASS}. */
  contentClass?: string;
}

/** Handle of an open overlay. */
export interface LtOverlayRef<R> {
  /** Close with a result. */
  close(result?: R): void;
  /** Resolves when the overlay closed (`undefined` when dismissed). */
  readonly closed: Promise<R | undefined>;
}

/** Extra dialog options used internally (confirm dialog). */
type LtDialogExtras = Partial<Pick<BrnDialogOptions, 'autoFocus' | 'role'>> & { showCloseButton?: boolean };

/**
 * Programmatic modals on Spartan's dialog (the counterpart of Nuxt UI's `useOverlay()`): open any component as a
 * dialog and await its result, or ask a confirmation question.
 *
 * The dialog is labelled by an element with `hlmDialogTitle` and described by `hlmDialogDescription` inside the
 * opened component; focus moves into the dialog, is trapped there and returns to the trigger when it closes.
 *
 * @example
 * const ref = this.overlay.open<boolean, { id: string }>(EditUserDialog, { data: { id } });
 * if (await ref.closed) { reload(); }
 */
@Service()
export class LtOverlayService {
  private readonly dialog = inject(HlmDialogService);
  private readonly i18n = injectLtUiI18n();

  /** Open `component` in a dialog. */
  open<R = unknown, D = unknown>(component: Type<unknown>, options: LtOverlayOptions<D> = {}): LtOverlayRef<R> {
    return this.openDialog<R, D>(component, options, {});
  }

  /** Confirmation dialog; resolves `true` on confirm. */
  async confirm(options: LtConfirmOptions): Promise<boolean> {
    const ref = this.openDialog<boolean, LtConfirmOptions>(
      LtConfirmDialog,
      { data: options },
      {
        // Destructive questions start on the safe answer.
        autoFocus: options.destructive ? '[data-lt-confirm="cancel"]' : '[data-lt-confirm="confirm"]',
        role: 'alertdialog',
        showCloseButton: false,
      },
    );
    return (await ref.closed) === true;
  }

  private openDialog<R, D>(component: Type<unknown>, options: LtOverlayOptions<D>, extras: LtDialogExtras): LtOverlayRef<R> {
    const dismissible = options.dismissible !== false;
    let dialogRef: BrnDialogRef<R> | undefined;
    let resolveClosed!: (result: R | undefined) => void;
    const ref: LtOverlayRef<R> = {
      close: (result?: R) => dialogRef?.close(result),
      closed: new Promise<R | undefined>((resolve) => (resolveClosed = resolve)),
    };
    dialogRef = this.dialog.open<R>(component, {
      closeLabel: this.i18n.t('lt.ui.close'),
      closeOnOutsidePointerEvents: dismissible,
      contentClass: hlm(LT_OVERLAY_CONTENT_CLASS, options.contentClass),
      disableClose: !dismissible,
      providers: [
        { provide: LT_OVERLAY_DATA, useValue: options.data },
        { provide: LT_OVERLAY_REF, useValue: ref },
      ],
      showCloseButton: extras.showCloseButton ?? dismissible,
      ...(extras.autoFocus ? { autoFocus: extras.autoFocus } : {}),
      ...(extras.role ? { role: extras.role } : {}),
    });
    dialogRef.closed$.subscribe((result) => resolveClosed(result));
    return ref;
  }
}
