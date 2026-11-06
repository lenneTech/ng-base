import { afterRenderEffect, booleanAttribute, Component, computed, ElementRef, inject, input, model, output, signal } from '@angular/core';
import { FORM_FIELD, type FormValueControl } from '@angular/forms/signals';

import { HlmDatePicker, HlmDatePickerInput } from '../helm/date-picker';
import { LT_NO_NG_CONTROL, nextLtId } from './control';
import { ltFormatDate, ltIsDayInRange, ltParseDate, ltStartOfDay, provideLtCalendarI18n } from './date-utils';
import { injectLtUiI18n } from './i18n';

/**
 * Date picker (Spartan date picker, German format by default, min/max). Value is a `Date` (local midnight) or `null`.
 *
 * - Type the date (`dd.MM.yyyy`, also `d.M.yy`, `ddMMyyyy` or ISO `yyyy-MM-dd`; ENTER or leaving the field commits),
 *   or open the calendar with the calendar button / ↓. Dates outside `min`/`max` are rejected (the value becomes
 *   `null`, the text stays for correction) and disabled in the calendar.
 * - Label: wrap it in `lt-form-field` (`for` = `id`), which also wires hint/error via `aria-describedby`; `label` sets
 *   an accessible label without a visible one.
 * - Signal Forms: a `FormValueControl<Date | null>` (`[formField]`; `min`/`max`/`disabled`/`required` follow the field,
 *   `invalid` shows once touched).
 * - The calendar follows the active `LtI18nService` locale (month/weekday names, Monday first except for English).
 */
@Component({
  selector: 'lt-date-picker',
  imports: [HlmDatePicker, HlmDatePickerInput],
  viewProviders: [LT_NO_NG_CONTROL, provideLtCalendarI18n()],
  // The id belongs to the inner input: drop a static `id` attribute from the host (no duplicate ids).
  host: { class: 'block', '[attr.id]': 'null', '(focusout)': 'onFocusOut($event)' },
  templateUrl: './date-picker.html',
})
export class LtDatePicker implements FormValueControl<Date | null> {
  protected readonly i18n = injectLtUiI18n();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly formField = inject(FORM_FIELD, { optional: true, self: true });
  private readonly generatedId = nextLtId('date-picker');
  private readonly blurred = signal(false);

  readonly disabled = input(false, { transform: booleanAttribute });
  /** Display format (default `dd.MM.yyyy`). */
  readonly formatDate = input<(date: Date) => string>(ltFormatDate);
  readonly id = input<string>();
  /** Marks the date invalid (`aria-invalid`); with Signal Forms it shows once touched. */
  readonly invalid = input(false, { transform: booleanAttribute });
  /** Accessible label when no visible label (`lt-form-field`) is linked. */
  readonly label = input<string>();
  readonly max = input<Date>();
  readonly min = input<Date>();
  /** Parser of typed text (default: German formats and ISO, see above). */
  readonly parseDate = input<(value: string) => Date | null>(ltParseDate);
  /** Placeholder (default `lt.ui.dateFormat`, e.g. `TT.MM.JJJJ`). */
  readonly placeholder = input<string>();
  readonly required = input(false, { transform: booleanAttribute });
  /** Touched state (bound by Signal Forms). */
  readonly touched = input(false, { transform: booleanAttribute });
  readonly value = model<Date | null>(null);
  /** Focus left the picker (marks a Signal Forms field as touched). */
  readonly touch = output<void>();

  protected readonly inputId = computed(() => this.id() || this.generatedId);
  protected readonly placeholderText = computed(() => this.placeholder() ?? this.i18n.t('lt.ui.dateFormat'));
  protected readonly showInvalid = computed(() => this.invalid() && (!this.formField || this.touched() || this.blurred()));
  protected readonly startOfDay = ltStartOfDay;
  /** Parser that also rejects dates outside min/max. */
  protected readonly parse = computed(() => {
    const parseDate = this.parseDate();
    const min = this.min();
    const max = this.max();
    return (text: string): Date | null => {
      const date = parseDate(text);
      return date && ltIsDayInRange(date, min, max) ? ltStartOfDay(date) : null;
    };
  });

  constructor() {
    // The text input lives inside Spartan's date picker input; its own `aria-invalid` binding only knows NgControl.
    afterRenderEffect({
      write: () => {
        const element = this.inputElement();
        if (!element) {
          return;
        }
        toggleAttribute(element, 'aria-invalid', this.showInvalid() ? 'true' : null);
        toggleAttribute(element, 'aria-required', this.required() ? 'true' : null);
      },
    });
  }

  /** Focus the text input. */
  focus(options?: FocusOptions): void {
    this.inputElement()?.focus(options);
  }

  protected onDateChange(date: Date | null): void {
    this.value.set(date ? ltStartOfDay(date) : null);
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.nativeElement.contains(next)) {
      return;
    }
    this.blurred.set(true);
    this.touch.emit();
  }

  private inputElement(): HTMLInputElement | null {
    return this.host.nativeElement.querySelector<HTMLInputElement>(`input[id="${this.inputId()}"]`);
  }
}

function toggleAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}
