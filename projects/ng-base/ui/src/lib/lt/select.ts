import { booleanAttribute, Component, computed, ElementRef, inject, input, model, output, signal } from '@angular/core';
import { FORM_FIELD, type FormValueControl } from '@angular/forms/signals';

import { HlmComboboxImports } from '../helm/combobox';
import { HlmSelectImports } from '../helm/select';
import { LT_NO_NG_CONTROL, nextLtId } from './control';
import { injectLtUiI18n } from './i18n';

/** Option of {@link LtSelect}. */
export interface LtSelectOption<V = string> {
  disabled?: boolean;
  label: string;
  value: V;
}

/**
 * Select on Spartan (native-feeling single select), with `searchable` switching to a combobox (filter as you type).
 * Two-way `[(value)]`.
 *
 * - Keyboard: the select opens with ENTER/SPACE/↑/↓, moves with the arrow keys, Home/End and type-ahead; the combobox
 *   filters while typing, ENTER picks the highlighted option, ESC clears an unfinished search.
 * - Label: wrap it in `lt-form-field` (`for` = `id`; hint and error get wired via `aria-describedby`), or set `label`
 *   for an accessible label without a visible one.
 * - Values are compared with `compareWith` (default `Object.is`); the shown text is the option's `label`.
 * - Signal Forms: a `FormValueControl<V | null>` (`[formField]`); `invalid` shows once touched.
 */
@Component({
  selector: 'lt-select',
  imports: [HlmComboboxImports, HlmSelectImports],
  viewProviders: [LT_NO_NG_CONTROL],
  // The id belongs to the inner trigger: drop a static `id` attribute from the host (no duplicate ids).
  host: { class: 'block', '[attr.id]': 'null', '(focusout)': 'onFocusOut($event)' },
  templateUrl: './select.html',
})
export class LtSelect<V = string> implements FormValueControl<V | null> {
  protected readonly i18n = injectLtUiI18n();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly formField = inject(FORM_FIELD, { optional: true, self: true });
  private readonly generatedId = nextLtId('select');
  private readonly blurred = signal(false);

  /** Compares an option value with the selected value (default `Object.is`). */
  readonly compareWith = input<(optionValue: V, selected: V) => boolean>(Object.is);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly id = input<string>();
  /** Marks the select invalid (`aria-invalid`); with Signal Forms it shows once touched. */
  readonly invalid = input(false, { transform: booleanAttribute });
  /** Accessible label (required when no visible label is linked). */
  readonly label = input<string>();
  readonly options = input.required<readonly LtSelectOption<V>[]>();
  readonly placeholder = input<string>();
  /** Filter options by typing (combobox). */
  readonly searchable = input(false, { transform: booleanAttribute });
  /** Touched state (bound by Signal Forms). */
  readonly touched = input(false, { transform: booleanAttribute });
  readonly value = model<V | null>(null);
  /** Focus left the select (marks a Signal Forms field as touched). */
  readonly touch = output<void>();

  protected readonly controlId = computed(() => this.id() || this.generatedId);
  protected readonly showInvalid = computed(() => this.invalid() && (!this.formField || this.touched() || this.blurred()));
  protected readonly selectPlaceholder = computed(() => this.placeholder() ?? this.i18n.t('lt.ui.selectPlaceholder'));
  protected readonly searchPlaceholder = computed(() => this.placeholder() ?? this.i18n.t('lt.ui.searchPlaceholder'));
  /** Option label of a value (display text and combobox filter). */
  protected readonly itemToString = computed(() => {
    const options = this.options();
    const compare = this.compareWith();
    return (value: V): string => options.find((option) => compare(option.value, value))?.label ?? '';
  });
  protected readonly isEqual = computed(() => {
    const compare = this.compareWith();
    return (optionValue: V, selected: V | null | undefined): boolean => selected !== null && selected !== undefined && compare(optionValue, selected);
  });

  /** Focus the trigger / search input. */
  focus(options?: FocusOptions): void {
    this.host.nativeElement.querySelector<HTMLElement>(`[id="${this.controlId()}"]`)?.focus(options);
  }

  protected onValueChange(value: unknown): void {
    this.value.set((value ?? null) as V | null);
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.nativeElement.contains(next)) {
      return;
    }
    this.blurred.set(true);
    this.touch.emit();
  }
}
