import { Directive, HostListener } from '@angular/core';

/**
 * Stops propagation of click events
 * Inspired by https://stackoverflow.com/a/41001184
 */
@Directive({
  selector: '[baseStopPropagation]',
  standalone: true,
})
export class StopPropagationDirective {
  @HostListener('click', ['$event'])
  public onClick(event: any): void {
    event.stopPropagation();
  }
}
