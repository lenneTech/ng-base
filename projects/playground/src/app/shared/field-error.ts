import type { FieldTree } from '@angular/forms/signals';

/** First message of a Signal Forms field once it was touched (for `lt-form-field [error]`), else `null`. */
export function fieldError<T>(field: FieldTree<T>): string | null {
  const state = field();
  if (!state.touched() || !state.invalid()) {
    return null;
  }
  return state.errors().find((error) => !!error.message)?.message ?? null;
}
