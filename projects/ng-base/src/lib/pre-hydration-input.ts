import { isPlatformBrowser } from '@angular/common';
import { ApplicationRef, inject, PLATFORM_ID, provideAppInitializer, type EnvironmentProviders } from '@angular/core';

/** Options of the pre-hydration input preservation (`provideLtNgBase({ preHydrationInput })`). */
export interface LtPreHydrationInputOptions {
  /** Keep what users type before hydration (default `true`). */
  enabled?: boolean;
  /**
   * How long after hydration to keep restoring, in milliseconds (default `1500`; `0` restores once). Clamped to 30000.
   * When it elapses the snapshot is dropped, so preserved values (passwords included) are not kept for the session.
   */
  maxRestoreMs?: number;
}

type LtEditableField = HTMLInputElement | HTMLTextAreaElement;

/** Every `input`/`textarea` under `root` whose value differs from its server-rendered default, with that value. */
export function collectLtEditedFields(root: ParentNode): Map<LtEditableField, string> {
  const edited = new Map<LtEditableField, string>();
  for (const node of Array.from(root.querySelectorAll('input, textarea'))) {
    const field = node as LtEditableField;
    if (field.value !== field.defaultValue) {
      edited.set(field, field.value);
    }
  }
  return edited;
}

/**
 * Write `value` back into `field` and dispatch a bubbling `input` event, so `(input)` handlers, `model()` and Signal
 * Forms adopt it. Returns `false` when the field is detached or already holds the value.
 */
export function restoreLtField(field: LtEditableField, value: string): boolean {
  if (!field.isConnected || field.value === value) {
    return false;
  }
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/**
 * Pre-hydration input preservation (browser only).
 *
 * Text typed into a server-rendered field before hydration is in the DOM, but the first change detection after
 * hydration writes the component's (empty) value over it — `[value]` bindings and Signal Forms do — before the replayed
 * events run, so `withEventReplay()` alone loses it (measured in the ng-base playground E2E). The fields are snapshot
 * at app initialisation (the SSR DOM is reused by hydration, so the element references stay valid) and restored once
 * the app is stable, then every 250 ms for `maxRestoreMs` for fields hydrated late; fields stay ordinary editable
 * fields throughout (autofill and screen readers untouched).
 */
export function provideLtPreHydrationInput(options: LtPreHydrationInputOptions = {}): EnvironmentProviders {
  return provideAppInitializer(() => {
    if (options.enabled === false || !isPlatformBrowser(inject(PLATFORM_ID)) || typeof document === 'undefined') {
      return;
    }
    const edited = collectLtEditedFields(document);
    if (edited.size === 0) {
      return;
    }
    const configured = options.maxRestoreMs ?? 1500;
    const maxRestoreMs = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 30_000) : 0;
    const sweep = (): void => {
      for (const [field, value] of edited) {
        if (restoreLtField(field, value) || !field.isConnected) {
          edited.delete(field);
        }
      }
    };
    void inject(ApplicationRef)
      .whenStable()
      .then(() => {
        sweep();
        if (maxRestoreMs <= 0 || edited.size === 0) {
          edited.clear();
          return;
        }
        const interval = setInterval(sweep, 250);
        setTimeout(() => {
          clearInterval(interval);
          edited.clear();
        }, maxRestoreMs);
      });
  });
}

/**
 * Inline script (for `<head>`) that blocks the native submission of forms without `action` until the app handles them.
 * A server-rendered login form submitted before hydration would otherwise send a native GET with the password in the
 * URL. `ltAngularRequestHandler()` writes it into every SSR HTML response; add it to `index.html` yourself without SSR.
 */
export const LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT =
  "document.addEventListener('submit',function(e){var f=e.target;if(f instanceof HTMLFormElement&&!f.hasAttribute('action')){e.preventDefault();}},true);";
