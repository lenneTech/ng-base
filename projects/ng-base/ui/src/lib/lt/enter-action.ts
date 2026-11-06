import { Directive, ElementRef, inject, output } from '@angular/core';

/**
 * Emits on ENTER in an input (barcode/RFID scanners send ENTER after the code) and prevents the implicit form
 * submit. `ltEnterAction` emits the input's value. ENTER during an IME composition is ignored.
 *
 * @example <input hlmInput (ltEnterAction)="lookup($event)" />
 */
@Directive({
  selector: '[ltEnterAction]',
  host: { '(keydown.enter)': 'onEnter($event)' },
})
export class LtEnterAction {
  private readonly element = inject<ElementRef<HTMLInputElement | HTMLTextAreaElement>>(ElementRef);

  readonly ltEnterAction = output<string>();

  protected onEnter(event: Event): void {
    if ((event as KeyboardEvent).isComposing) {
      return;
    }
    event.preventDefault();
    this.ltEnterAction.emit(this.element.nativeElement.value ?? '');
  }
}
