import { booleanAttribute, Component, computed, effect, inject, input } from '@angular/core';
import { BrnFieldA11yService } from '@spartan-ng/brain/field';

import { HlmField, HlmFieldDescription, HlmFieldError } from '../helm/field';
import { HlmLabel } from '../helm/label';

/**
 * Label, control, hint and error of one form field (on Spartan's `field`). Project the control; give it the `id`
 * passed as `for`. The error is announced (`role="alert"`) and wired via `aria-describedby` by `LtTextField`;
 * for own controls set `aria-describedby="<for>-hint <for>-error"` and `aria-invalid`.
 *
 * Projected Spartan controls (`hlmInput`, `hlm-select-trigger`, the date picker input, `lt-select`, `lt-date-picker`,
 * `lt-password-input` …) get `aria-describedby` automatically: the field registers `<for>-hint` and `<for>-error` with
 * Spartan's field a11y service. The label has the id `<for>-label`; the required asterisk is hidden from assistive
 * technology (set `required` on the control as well).
 *
 * @example
 * <lt-form-field for="email" label="E-Mail" [error]="emailError()">
 *   <input hlmInput id="email" type="email" autocomplete="email" [formField]="form.email" />
 * </lt-form-field>
 */
@Component({
  selector: 'lt-form-field',
  imports: [HlmFieldDescription, HlmFieldError, HlmLabel],
  hostDirectives: [{ directive: HlmField, inputs: ['orientation'] }],
  templateUrl: './form-field.html',
})
export class LtFormField {
  private readonly a11y = inject(BrnFieldA11yService);

  /**
   * Ids of further elements that describe the control (unit, prefix …); registered for `aria-describedby` together with
   * the hint (errors come last).
   */
  readonly describedBy = input<readonly string[]>([]);
  /** Error message (shown when set). */
  readonly error = input<string | null | undefined>();
  /** Id of the projected control. */
  readonly for = input.required<string>();
  readonly hint = input<string>();
  readonly label = input.required<string>();
  /** Marks the label as required (visual asterisk; set `required` on the control too). */
  readonly required = input(false, { transform: booleanAttribute });

  protected readonly labelId = computed(() => `${this.for()}-label`);
  protected readonly hintId = computed(() => `${this.for()}-hint`);
  protected readonly errorId = computed(() => `${this.for()}-error`);

  constructor() {
    effect((onCleanup) => {
      const ids = this.describedBy();
      ids.forEach((id) => this.a11y.registerDescription(id));
      onCleanup(() => ids.forEach((id) => this.a11y.unregisterDescription(id)));
    });
    effect((onCleanup) => {
      if (!this.hint()) {
        return;
      }
      const id = this.hintId();
      this.a11y.registerDescription(id);
      onCleanup(() => this.a11y.unregisterDescription(id));
    });
    effect((onCleanup) => {
      if (!this.error()) {
        return;
      }
      const id = this.errorId();
      this.a11y.registerError(id);
      onCleanup(() => this.a11y.unregisterError(id));
    });
  }
}
