import { FocusKeyManager } from '@angular/cdk/a11y';
import { Directionality } from '@angular/cdk/bidi';
import { afterRenderEffect, computed, contentChildren, Directive, HostAttributeToken, inject, input, signal } from '@angular/core';

import { LtToolbarItem } from './toolbar-item';
import { injectLtUiI18n } from './i18n';

/**
 * Function bar (`role="toolbar"`) with roving tabindex: one tab stop, arrow keys move between the items, Home/End
 * jump. Mark items with `ltToolbarItem`. Spartan has no toolbar; built on `@angular/cdk/a11y`.
 *
 * - Horizontal: ←/→ (mirrored in RTL), vertical: ↑/↓; the focus wraps around; disabled items are skipped.
 * - Keys pressed inside text inputs, textareas and selects keep their native meaning.
 * - Accessible name: a static `aria-label`, the `label` input, or `aria-labelledby`; otherwise `lt.ui.toolbar`.
 *
 * @example <div ltToolbar aria-label="Aktionen"><button hlmBtn ltToolbarItem>Neu</button>…</div>
 */
@Directive({
  selector: '[ltToolbar]',
  host: {
    role: 'toolbar',
    '[attr.aria-orientation]': 'orientation()',
    '[attr.aria-label]': 'ariaLabel()',
    '(keydown)': 'onKeydown($event)',
    '(focusin)': 'onFocusIn($event)',
  },
})
export class LtToolbar {
  private readonly i18n = injectLtUiI18n();
  private readonly direction = inject(Directionality, { optional: true });
  private readonly staticLabel = inject(new HostAttributeToken('aria-label'), { optional: true });
  private readonly labelledBy = inject(new HostAttributeToken('aria-labelledby'), { optional: true });
  private readonly items = contentChildren(LtToolbarItem, { descendants: true });
  /** Index of the item that holds the tab stop. */
  private readonly activeIndex = signal(-1);

  /** Accessible name (alternative to a static `aria-label`). */
  readonly label = input<string>();
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');

  protected readonly ariaLabel = computed(() => this.label() || this.staticLabel || (this.labelledBy ? null : this.i18n.t('lt.ui.toolbar')));

  constructor() {
    // Roving tabindex, written after render: Spartan's button primitive writes `tabindex` itself when it is disabled.
    afterRenderEffect({
      write: () => {
        const items = this.items();
        const disabled = items.map((item) => item.isDisabled());
        let active = this.activeIndex();
        if (active < 0 || active >= items.length || disabled[active]) {
          active = disabled.findIndex((value) => !value);
        }
        items.forEach((item, index) => item.host.setAttribute('tabindex', index === active ? '0' : '-1'));
      },
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (isTextEntry(event.target)) {
      return;
    }
    const items = this.items();
    const index = this.indexOf(event.target);
    if (index < 0) {
      return;
    }
    const manager = new FocusKeyManager(items.map((item) => item.focusable))
      .withWrap()
      .withHomeAndEnd()
      .withVerticalOrientation(this.orientation() === 'vertical')
      .withHorizontalOrientation(this.orientation() === 'vertical' ? null : (this.direction?.value ?? 'ltr'));
    manager.updateActiveItem(index);
    manager.onKeydown(event);
    if (manager.activeItemIndex !== null && manager.activeItemIndex >= 0) {
      this.activeIndex.set(manager.activeItemIndex);
    }
    manager.destroy();
  }

  protected onFocusIn(event: FocusEvent): void {
    const index = this.indexOf(event.target);
    if (index >= 0 && !this.items()[index]?.isDisabled()) {
      this.activeIndex.set(index);
    }
  }

  private indexOf(target: EventTarget | null): number {
    return this.items().findIndex((item) => item.host === target || (target instanceof Node && item.host.contains(target)));
  }
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'].includes(target.type);
  }
  return false;
}
