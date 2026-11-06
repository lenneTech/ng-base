import { inject } from '@angular/core';
import { Router, type CanActivateChildFn, type CanActivateFn, type RouterStateSnapshot, type UrlTree } from '@angular/router';

import { LT_AUTH_OPTIONS } from './auth-options';
import { hasLtRole, LtAuthStore } from './auth-store';
import { ltPathOf } from './auth-urls';
import { LtSystemSetupService } from './system-setup';

/**
 * Requires a signed-in user (auth-state cookie; on the server the request cookie). Otherwise redirects to
 * `loginPath?redirect=<url>`. UI gating only: the backend authorises every request itself.
 */
export const ltAuthGuard: CanActivateFn & CanActivateChildFn = (_route, state) => (inject(LtAuthStore).isAuthenticated() ? true : loginTree(state));

/** Only for signed-out users (login, register…); a signed-in user is redirected to `redirectTo` (default `/app`). */
export function ltGuestGuard(redirectTo = '/app'): CanActivateFn & CanActivateChildFn {
  return () => (inject(LtAuthStore).isAuthenticated() ? inject(Router).parseUrl(redirectTo) : true);
}

/** Requires one of the roles (`role` or `roles`); signed-out → login, missing role → `redirectTo` (default `/`). */
export function ltRoleGuard(roles: string | string[], redirectTo = '/'): CanActivateFn & CanActivateChildFn {
  const wanted = Array.isArray(roles) ? roles : [roles];
  return (_route, state) => {
    const auth = inject(LtAuthStore);
    if (!auth.isAuthenticated()) {
      return loginTree(state);
    }
    const user = auth.user();
    return wanted.some((role) => hasLtRole(user, role)) ? true : inject(Router).parseUrl(redirectTo);
  };
}

/**
 * First-admin setup redirect (enable with `provideLtAuth({ systemSetup: { enabled: true } })`), put it on the root
 * route as `canActivateChild`. `needsSetup && httpInitEnabled !== false` → setup page; setup done but on the setup
 * page → login page; errors never redirect.
 */
export const ltSystemSetupGuard: CanActivateFn & CanActivateChildFn = async (_route, state) => {
  const options = inject(LT_AUTH_OPTIONS);
  if (!options.systemSetup.enabled) {
    return true;
  }
  const setup = inject(LtSystemSetupService);
  const router = inject(Router);
  try {
    if (setup.needsSetup() === null) {
      await setup.checkSetupStatus();
    }
    const path = ltPathOf(state.url);
    const setupPath = options.systemSetup.setupPath;
    // Only an explicit "HTTP init not released" suppresses the redirect (the page shows a notice instead).
    if (setup.needsSetup() === true && setup.httpInitEnabled() !== false && path !== setupPath) {
      return router.parseUrl(setupPath);
    }
    if (setup.needsSetup() === false && path === setupPath) {
      return router.parseUrl(options.loginPath);
    }
  } catch {
    // errors never redirect
  }
  return true;
};

function loginTree(state: RouterStateSnapshot): UrlTree {
  const options = inject(LT_AUTH_OPTIONS);
  return inject(Router).createUrlTree([options.loginPath], { queryParams: { redirect: state.url } });
}
