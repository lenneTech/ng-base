import { Inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, CanActivateChild, Router, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService, BASE_MODULE_CONFIG, BaseModuleConfig } from '@lenne.tech/ng-base/shared';

/**
 * Authentication guard
 */
@Injectable()
export class AuthGuard implements CanActivate, CanActivateChild {
  /**
   * Imports
   */
  constructor(
    private router: Router,
    private authService: AuthService,
    @Inject(BASE_MODULE_CONFIG) private moduleConfig: BaseModuleConfig
  ) {}

  /**
   * Can activate main route
   */
  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return new Observable((subscriber) => {
      let allowed = false;
      let redirected = false;
      /* If the user is logged in and the route is not marked as opposite, then the user is allowed to access the route. */
      const opposite = route?.data?.opposite ? route?.data?.opposite : false;
      const redirectAuthUrl = route?.data?.redirectAuthUrl
        ? route.data.redirectAuthUrl
        : this.moduleConfig.authGuardRedirectUrl;
      const redirectRoleUrl = route?.data?.redirectRoleUrl
        ? route.data.redirectRoleUrl
        : this.moduleConfig.authGuardRedirectUrl;

      if (this.authService.token && !opposite) {
        if (route.data?.roles) {
          const user = this.authService.currentUser;
          allowed = !!route.data.roles.find((role) => user.roles?.includes(role));

          if (!allowed && redirectRoleUrl) {
            this.router.navigate([redirectRoleUrl]);
            redirected = true;
          }
        } else {
          allowed = true;
        }
      } else if (!this.authService.token && opposite) {
        allowed = true;
      }

      if (!allowed && redirectAuthUrl && !redirected) {
        this.router.navigate([redirectAuthUrl]);
      }

      subscriber.next(allowed);
      subscriber.complete();
    });
  }

  /**
   * Can activate child route
   */
  canActivateChild(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return this.canActivate(route, state);
  }
}
