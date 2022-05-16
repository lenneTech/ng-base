import { Injectable } from '@angular/core';
import { CanDeactivate } from '@angular/router';
import { ICanComponentDeactivate } from '@lenne.tech/ng-base/shared';

/**
 * Guard to check if a component can be deactivated
 */
@Injectable()
export class CanDeactivateGuard implements CanDeactivate<ICanComponentDeactivate> {
  canDeactivate(component: ICanComponentDeactivate) {
    return component.canDeactivate ? component.canDeactivate() : true;
  }
}
