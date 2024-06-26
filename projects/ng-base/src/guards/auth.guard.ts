import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService, BASE_MODULE_CONFIG, BaseModuleConfig } from '@lenne.tech/ng-base/shared';
import { isPlatformBrowser } from '@angular/common';

/**
 * Authentication guard
 */
@Injectable()
export class AuthGuard {
  /**
   * Imports
   */
  constructor(
    private router: Router,
    private authService: AuthService,
    @Inject(BASE_MODULE_CONFIG) private moduleConfig: BaseModuleConfig,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  /**
   * Can activate main route
   */
  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    if (isPlatformBrowser(this.platformId)) {
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
        const disableQueryParams = route?.data?.disableQueryParams ?? false;
        const queryParams = disableQueryParams
          ? {}
          : {
              queryParams: {
                redirectUrl: route['_routerState'].url,
              },
            };

        if (this.authService.token && !opposite) {
          if (route.data?.roles) {
            const user = this.authService.currentUser;
            allowed = !!route.data.roles.find((role) => user.roles?.includes(role));

            if (!allowed && redirectRoleUrl) {
              this.router.navigate([redirectRoleUrl], queryParams);
              redirected = true;
            }
          } else {
            allowed = true;
          }
        } else if (!this.authService.token && opposite) {
          allowed = true;
        }

        if (!allowed && redirectAuthUrl && !redirected) {
          this.router.navigate([redirectAuthUrl], queryParams);
        }

        subscriber.next(allowed);
        subscriber.complete();
      });
    }
  }

  /**
   * Can activate child route
   */
  canActivateChild(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return this.canActivate(route, state);
  }
}
