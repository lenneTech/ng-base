import { booleanAttribute, Component, computed, ElementRef, inject, input, linkedSignal, model, numberAttribute, output, signal, viewChild } from '@angular/core';
import { FORM_FIELD, type FormValueControl } from '@angular/forms/signals';

import { HlmInput } from '../helm/input';
import { LT_NO_NG_CONTROL, ltSyncAriaInvalid, nextLtId } from './control';
import { LtDatePicker } from './date-picker';
import { ltFormatTime, ltIsSameDay, ltParseTime, ltStartOfDay } from './date-utils';
import { LtFormField } from './form-field';
import { injectLtUiI18n } from './i18n';

const MINUTES_PER_DAY = 24 * 60;

/**
 * Date and time picker (own, Spartan has none): the date picker plus a time input (`HH:mm`, step in minutes).
 * Value is a `Date` with the chosen time (local) or `null`.
 *
 * - The date part is an {@link LtDatePicker} with the given `id` (so a wrapping `lt-form-field` labels it); the time is
 *   a native `<input type="time">` (keyboard and scanner friendly) labelled "<label> – Uhrzeit".
 * - The time snaps to `minuteStep`; the combined value is clamped into `min`/`max` (the time input gets `min`/`max`
 *   on those days). Without a time, a picked date starts at 00:00; a time without a date keeps the value `null`.
 * - Signal Forms: a `FormValueControl<Date | null>` (`[formField]`).
 */
@Component({
  selector: 'lt-date-time-picker',
  imports: [HlmInput, LtDatePicker],
  viewProviders: [LT_NO_NG_CONTROL],
  // The id belongs to the inner date input: drop a static `id` attribute from the host (no duplicate ids).
  host: { class: 'block', '[attr.id]': 'null', '(focusout)': 'onFocusOut($event)' },
  templateUrl: './date-time-picker.html',
})
export class LtDateTimePicker implements FormValueControl<Date | null> {
  private readonly i18n = injectLtUiI18n();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly formField = inject(FORM_FIELD, { optional: true, self: true });
  private readonly parentField = inject(LtFormField, { optional: true });
  private readonly generatedId = nextLtId('date-time-picker');
  private readonly timeInput = viewChild<ElementRef<HTMLInputElement>>('time');
  private readonly blurred = signal(false);

  readonly disabled = input(false, { transform: booleanAttribute });
  readonly id = input<string>();
  /** Marks the value invalid (`aria-invalid`); with Signal Forms it shows once touched. */
  readonly invalid = input(false, { transform: booleanAttribute });
  /** Accessible label when no visible label (`lt-form-field`) is linked. */
  readonly label = input<string>();
  readonly max = input<Date>();
  readonly min = input<Date>();
  /** Minute step of the time input (default 1). */
  readonly minuteStep = input(1, { transform: numberAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  /** Touched state (bound by Signal Forms). */
  readonly touched = input(false, { transform: booleanAttribute });
  readonly value = model<Date | null>(null);
  /** Focus left the picker (marks a Signal Forms field as touched). */
  readonly touch = output<void>();

  protected readonly dateId = computed(() => this.id() || this.generatedId);
  protected readonly timeId = computed(() => `${this.dateId()}-time`);
  protected readonly timeLabel = computed(() => {
    const base = this.label() || this.parentField?.label();
    return base ? `${base} – ${this.i18n.t('lt.ui.time')}` : this.i18n.t('lt.ui.time');
  });
  protected readonly showInvalid = computed(() => this.invalid() && (!this.formField || this.touched() || this.blurred()));
  protected readonly step = computed(() => Math.max(1, Math.floor(this.minuteStep() || 1)));
  protected readonly datePart = computed(() => {
    const value = this.value();
    return value ? ltStartOfDay(value) : null;
  });
  protected readonly minDay = computed(() => {
    const min = this.min();
    return min ? ltStartOfDay(min) : undefined;
  });
  protected readonly maxDay = computed(() => {
    const max = this.max();
    return max ? ltStartOfDay(max) : undefined;
  });
  /** Time text; follows the value and keeps a time typed before a date was picked. */
  protected readonly timeText = linkedSignal(() => {
    const value = this.value();
    return value ? ltFormatTime(value) : '';
  });
  protected readonly timeMin = computed(() => {
    const min = this.min();
    return min && ltIsSameDay(this.datePart(), min) ? ltFormatTime(min) : null;
  });
  protected readonly timeMax = computed(() => {
    const max = this.max();
    return max && ltIsSameDay(this.datePart(), max) ? ltFormatTime(max) : null;
  });

  constructor() {
    ltSyncAriaInvalid(() => this.timeInput()?.nativeElement, this.showInvalid);
  }

  /** Focus the date input. */
  focus(options?: FocusOptions): void {
    this.host.nativeElement.querySelector<HTMLInputElement>(`input[id="${this.dateId()}"]`)?.focus(options);
  }

  protected onDateChange(date: Date | null): void {
    if (!date) {
      this.value.set(null);
      return;
    }
    this.commit(date, this.timeText());
  }

  protected onTimeChange(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.timeText.set(text);
    const date = this.datePart();
    if (date) {
      this.commit(date, text);
    }
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.nativeElement.contains(next)) {
      return;
    }
    this.blurred.set(true);
    this.touch.emit();
  }

  /** Combine day and time, snap to the minute step and clamp into min/max. */
  private commit(day: Date, time: string): void {
    const parsed = ltParseTime(time) ?? { hours: 0, minutes: 0 };
    const step = this.step();
    let minutes = Math.round((parsed.hours * 60 + parsed.minutes) / step) * step;
    if (minutes >= MINUTES_PER_DAY) {
      minutes = Math.floor((MINUTES_PER_DAY - 1) / step) * step;
    }
    let result = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
    const min = this.min();
    const max = this.max();
    if (min && result.getTime() < min.getTime()) {
      result = withoutSeconds(min);
    }
    if (max && result.getTime() > max.getTime()) {
      result = withoutSeconds(max);
    }
    this.value.set(result);
    this.timeText.set(ltFormatTime(result));
  }
}

function withoutSeconds(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes());
}
