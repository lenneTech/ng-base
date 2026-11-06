import { booleanAttribute, Component, computed, ElementRef, inject, input, model, output, signal, viewChild } from '@angular/core';
import { FORM_FIELD, type FormValueControl } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye, lucideEyeOff } from '@ng-icons/lucide';

import { HlmButton } from '../helm/button';
import { HlmInputGroup, HlmInputGroupAddon, HlmInputGroupInput } from '../helm/input-group';
import { LT_NO_NG_CONTROL, ltOptionalString, ltSyncAriaInvalid, nextLtId } from './control';
import { injectLtUiI18n } from './i18n';

/**
 * Password input with show/hide toggle (accessible label, `autocomplete` `current-password` / `new-password`).
 *
 * Label it with a wrapping `lt-form-field` (`for` = `id`), which also wires hint and error via `aria-describedby`.
 * The toggle button switches its label (`lt.ui.showPassword` / `lt.ui.hidePassword`) and controls the input.
 * Signal Forms: a `FormValueControl<string>` (`[formField]` on the element); `invalid` then shows once touched.
 */
@Component({
  selector: 'lt-password-input',
  imports: [HlmButton, HlmInputGroup, HlmInputGroupAddon, HlmInputGroupInput, NgIcon],
  providers: [provideIcons({ lucideEye, lucideEyeOff })],
  viewProviders: [LT_NO_NG_CONTROL],
  // The id belongs to the inner input: drop a static `id` attribute from the host (no duplicate ids).
  host: { class: 'block', '[attr.id]': 'null' },
  templateUrl: './password-input.html',
})
export class LtPasswordInput implements FormValueControl<string> {
  protected readonly i18n = injectLtUiI18n();
  private readonly formField = inject(FORM_FIELD, { optional: true, self: true });
  private readonly generatedId = nextLtId('password-input');
  private readonly control = viewChild<ElementRef<HTMLInputElement>>('control');
  private readonly blurred = signal(false);

  readonly autocomplete = input<'current-password' | 'new-password'>('current-password');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly id = input<string>();
  /** Marks the input invalid (`aria-invalid`). With Signal Forms it shows once the field was touched. */
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly name = input('password', { transform: ltOptionalString });
  readonly placeholder = input<string>('');
  readonly required = input(false, { transform: booleanAttribute });
  /** Touched state (bound by Signal Forms). */
  readonly touched = input(false, { transform: booleanAttribute });
  readonly value = model<string>('');
  /** The input lost focus (marks a Signal Forms field as touched). */
  readonly touch = output<void>();

  protected readonly inputId = computed(() => this.id() || this.generatedId);
  protected readonly visible = signal(false);
  protected readonly showInvalid = computed(() => this.invalid() && (!this.formField || this.touched() || this.blurred()));

  constructor() {
    ltSyncAriaInvalid(() => this.control()?.nativeElement, this.showInvalid);
  }

  /** Focus the input. */
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

  protected toggleVisibility(): void {
    this.visible.update((visible) => !visible);
  }
}
