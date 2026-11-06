import { booleanAttribute, Component, computed, ElementRef, inject, input, model, output, signal, viewChild } from '@angular/core';
import { FORM_FIELD, type FormValueControl, type ValidationError } from '@angular/forms/signals';

import { HlmInput } from '../helm/input';
import { HlmInputGroup, HlmInputGroupAddon, HlmInputGroupInput } from '../helm/input-group';
import { LT_NO_NG_CONTROL, ltFirstErrorMessage, ltOptionalString, ltSyncAriaInvalid, nextLtId } from './control';
import { LtFormField } from './form-field';

/**
 * Text input with label, hint, error, unit/prefix (Spartan input group) and optional ENTER action (barcode scanners).
 * Two-way `[(value)]`, or bind a Signal Forms field via `[formField]` on an own `hlmInput` inside `lt-form-field`.
 *
 * Signal Forms: the component is a `FormValueControl<string>`, so `<lt-text-field [formField]="form.name" />` works as
 * well: `disabled`, `readonly`, `required`, `name`, `invalid`, `touched`, `errors`, `minLength` and `maxLength` follow
 * the field, and the first error message is shown once the field was touched.
 *
 * Accessibility: the label is linked via `for`; hint, unit/prefix and error are wired via `aria-describedby`; the error
 * is announced (`role="alert"`) and sets `aria-invalid`.
 *
 * ENTER: `(enter)` emits the current value. While a handler is bound, ENTER does not submit a surrounding form (a
 * scanner sends ENTER after each code); without a handler the browser's implicit submit stays intact.
 */
@Component({
  selector: 'lt-text-field',
  imports: [HlmInput, HlmInputGroup, HlmInputGroupAddon, HlmInputGroupInput, LtFormField],
  viewProviders: [LT_NO_NG_CONTROL],
  // The id belongs to the inner input: drop a static `id` attribute from the host (no duplicate ids).
  host: { class: 'block', '[attr.id]': 'null' },
  templateUrl: './text-field.html',
})
export class LtTextField implements FormValueControl<string> {
  /** Set when a Signal Forms `[formField]` is bound on this element (errors then wait for the touched state). */
  private readonly formField = inject(FORM_FIELD, { optional: true, self: true });
  private readonly generatedId = nextLtId('text-field');
  private readonly control = viewChild<ElementRef<HTMLInputElement>>('control');
  private readonly blurred = signal(false);
  private enterListeners = 0;

  /** `autocomplete` attribute (always set it for personal data, e.g. `email`, `name`). */
  readonly autocomplete = input<string>('off');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly error = input<string | null | undefined>();
  /** Validation errors (bound by Signal Forms); the first message is shown once the field was touched. */
  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);
  readonly hint = input<string>();
  /** Input id (default generated). */
  readonly id = input<string>();
  /** Marks the input invalid (bound by Signal Forms; shown once the field was touched). */
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly label = input.required<string>();
  /** `maxlength` attribute. */
  readonly maxLength = input<number>();
  /** `minlength` attribute. */
  readonly minLength = input<number>();
  /** `name` attribute. */
  readonly name = input('', { transform: ltOptionalString });
  readonly placeholder = input<string>('');
  /** Text in front of the value (e.g. `€`). */
  readonly prefix = input<string>();
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  /** Touched state (bound by Signal Forms). */
  readonly touched = input(false, { transform: booleanAttribute });
  /** Input type. */
  readonly type = input<'email' | 'number' | 'search' | 'tel' | 'text' | 'url'>('text');
  /** Unit after the value (e.g. `kg`, `mm`). */
  readonly unit = input<string>();
  /** The value. */
  readonly value = model<string>('');
  /** ENTER pressed (scanner input): emits the current value. */
  readonly enter = output<string>();
  /** The input lost focus (marks a Signal Forms field as touched). */
  readonly touch = output<void>();

  protected readonly inputId = computed(() => this.id() || this.generatedId);
  protected readonly prefixId = computed(() => `${this.inputId()}-prefix`);
  protected readonly unitId = computed(() => `${this.inputId()}-unit`);
  protected readonly describedBy = computed(() => [...(this.prefix() ? [this.prefixId()] : []), ...(this.unit() ? [this.unitId()] : [])]);

  /** Signal Forms state is shown once the field was touched; a plain `[invalid]` binding immediately. */
  private readonly showState = computed(() => !this.formField || this.touched() || this.blurred());
  protected readonly displayError = computed(() => this.error() || (this.invalid() && this.showState() ? ltFirstErrorMessage(this.errors()) : null));
  protected readonly showInvalid = computed(() => !!this.displayError() || (this.invalid() && this.showState()));

  constructor() {
    ltSyncAriaInvalid(() => this.control()?.nativeElement, this.showInvalid);
    // Count `(enter)` listeners: ENTER only cancels the implicit form submit while someone handles it.
    const subscribe = this.enter.subscribe.bind(this.enter);
    this.enter.subscribe = (callback) => {
      this.enterListeners++;
      const subscription = subscribe(callback);
      return {
        unsubscribe: () => {
          this.enterListeners--;
          subscription.unsubscribe();
        },
      };
    };
  }

  /** Focus the input (used by Signal Forms to focus the first invalid field). */
  focus(options?: FocusOptions): void {
    this.control()?.nativeElement.focus(options);
  }

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  protected onBlur(): void {
    this.blurred.set(true);
    this.touch.emit();
  }

  protected onEnter(event: Event): void {
    if ((event as KeyboardEvent).isComposing) {
      return;
    }
    if (this.enterListeners > 0) {
      event.preventDefault();
    }
    this.enter.emit((event.target as HTMLInputElement).value);
  }
}
