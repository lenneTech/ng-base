import type { FocusableOption } from '@angular/cdk/a11y';
import { booleanAttribute, Directive, ElementRef, inject, input } from '@angular/core';

/** Adapter of a toolbar item for the CDK `FocusKeyManager` (the item's `disabled` is a signal input). */
class LtToolbarItemFocusable implements FocusableOption {
  constructor(private readonly item: LtToolbarItem) {}

  get disabled(): boolean {
    return this.item.isDisabled();
  }

  focus(): void {
    this.item.host.focus();
  }

  getLabel(): string {
    return this.item.host.textContent?.trim() ?? '';
  }
}

/**
 * Item of an {@link LtToolbar}. Disabled items (`disabled` input, native `disabled` or `aria-disabled="true"`) are
 * skipped by the arrow keys.
 */
@Directive({
  selector: '[ltToolbarItem]',
})
export class LtToolbarItem {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly disabled = input(false, { transform: booleanAttribute });

  /** @internal Adapter for the CDK `FocusKeyManager`. */
  readonly focusable: FocusableOption = new LtToolbarItemFocusable(this);

  /** @internal The host element. */
  get host(): HTMLElement {
    return this.element.nativeElement;
  }

  /** Whether the arrow keys skip the item. */
  isDisabled(): boolean {
    const element = this.element.nativeElement as HTMLElement & { disabled?: boolean };
    return this.disabled() || element.disabled === true || element.getAttribute('aria-disabled') === 'true';
  }
}
