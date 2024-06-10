import { Directive, HostListener } from '@angular/core';
import { NavigationService } from '@lenne.tech/ng-base/shared';

@Directive({
  selector: '[baseBackButton]',
  standalone: true,
})
export class BackButtonDirective {
  constructor(private navigation: NavigationService) {}

  @HostListener('click')
  onClick(): void {
    this.navigation.back();
  }
}
