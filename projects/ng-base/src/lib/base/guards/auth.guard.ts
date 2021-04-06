import { Inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, CanActivateChild, Router, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { BASE_MODULE_CONFIG, BaseModuleConfig } from '../interfaces/base-module-config.interface';

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
      const opposite = route?.data?.opposite ? route?.data?.opposite : false;
      const redirectUrl = route?.data?.redirectUrl ? route.data.redirectUrl : this.moduleConfig.authGuardRedirectUrl;

      if (this.authService.token && !opposite) {
        if (route.data.allowedRole) {
          const user = this.authService.currentUser;
          allowed = user?.roles?.includes(route.data.allowedRole);
        } else {
          allowed = true;
        }
      } else if (!this.authService.token && opposite) {
        allowed = true;
      }

      if (!allowed) {
        this.router.navigate([redirectUrl]);
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
