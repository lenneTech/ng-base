/**
 * Form helpers that work with Signal Forms, Reactive Forms and plain HTML alike: they look at the rendered DOM
 * (`aria-invalid="true"`, `:invalid`) instead of a form model.
 */

/** The first invalid control inside `root` (default `document`), in DOM order. */
export function ltFirstInvalidControl(root: ParentNode | null | undefined = globalThis.document): HTMLElement | null {
  return root?.querySelector<HTMLElement>('[aria-invalid="true"], input:invalid, select:invalid, textarea:invalid') ?? null;
}

/**
 * Scroll to and focus the first invalid control (call it after a failed submit). Returns whether one was found.
 * `offset` keeps it clear of a sticky header.
 */
export function ltFocusFirstInvalid(root?: ParentNode | null, options: { offset?: number } = {}): boolean {
  const control = ltFirstInvalidControl(root);
  if (!control) {
    return false;
  }
  const view = control.ownerDocument.defaultView;
  const top = control.getBoundingClientRect().top + (view?.scrollY ?? 0) - (options.offset ?? 96);
  view?.scrollTo({ behavior: view.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', top: Math.max(0, top) });
  control.focus({ preventScroll: true });
  return true;
}
