import { Component, computed, input } from '@angular/core';
import { injectLtUiI18n } from './i18n';

/**
 * Read-only label/value pair (`dl`-based; value falls back to `–`).
 * Numbers are shown as given; pass `numberFormat` to format them for the active locale (e.g. `1.234,5` in German).
 */
@Component({
  selector: 'lt-readonly-field',
  host: { class: 'block' },
  templateUrl: './readonly-field.html',
})
export class LtReadonlyField {
  private readonly i18n = injectLtUiI18n();

  readonly label = input.required<string>();
  /** `Intl.NumberFormat` options; when set, numeric values are formatted for the active locale. */
  readonly numberFormat = input<Intl.NumberFormatOptions>();
  /** Unit after the value. */
  readonly unit = input<string>();
  readonly value = input<number | string | null | undefined>();

  protected readonly hasValue = computed(() => {
    const value = this.value();
    return value !== null && value !== undefined && value !== '' && !(typeof value === 'number' && Number.isNaN(value));
  });

  protected readonly display = computed(() => {
    const value = this.value();
    if (!this.hasValue()) {
      return '–';
    }
    const format = this.numberFormat();
    if (typeof value === 'number' && format) {
      return new Intl.NumberFormat(this.i18n.locale(), format).format(value);
    }
    return String(value);
  });
}
