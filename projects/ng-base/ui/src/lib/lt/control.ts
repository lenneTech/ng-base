import { afterRenderEffect, type Provider } from '@angular/core';
import { NgControl } from '@angular/forms';

/*
 * Internal helpers of the lt form controls (not part of the public API).
 */

const idCounters = new Map<string, number>();

/** Next unique element id `lt-<name>-<n>` (one counter per name). */
export function nextLtId(name: string): string {
  const next = (idCounters.get(name) ?? 0) + 1;
  idCounters.set(name, next);
  return `lt-${name}-${next}`;
}

/**
 * View provider that hides a Signal Forms `[formField]` on the lt control's host from the Spartan primitives inside
 * the control. Without it the inner `hlmInput` / select / date picker would pick up the `NgControl` of the host and
 * write their own `aria-invalid` (validity without the touched state), competing with the control's own state.
 */
export const LT_NO_NG_CONTROL: Provider = { provide: NgControl, useValue: null };

/**
 * Keeps `aria-invalid` on an inner element in sync with `invalid`.
 *
 * Spartan's input primitives own `aria-invalid` through a host binding that writes `null` on its first pass, which wipes
 * a template binding on the same element. Writing after render makes the lt control the only writer.
 */
export function ltSyncAriaInvalid(target: () => Element | null | undefined, invalid: () => boolean): void {
  afterRenderEffect({
    write: () => {
      const element = target();
      if (!element) {
        return;
      }
      if (invalid()) {
        element.setAttribute('aria-invalid', 'true');
      } else {
        element.removeAttribute('aria-invalid');
      }
    },
  });
}

/** First human readable message of a Signal Forms error list, or `null`. */
export function ltFirstErrorMessage(errors: readonly { message?: string }[] | null | undefined): string | null {
  return errors?.find((error) => !!error.message)?.message ?? null;
}

/** Transform of string inputs that Signal Forms may bind (`undefined` / `null` become `''`). */
export function ltOptionalString(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}
