import type { Routes } from '@angular/router';
import { ltAuthGuard, ltGuestGuard, ltRoleGuard, ltSystemSetupGuard } from '@lenne.tech/ng-base/auth/provide';

/**
 * Every page is lazy, so the initial bundle holds only the root shell and the router. Everything runs below
 * `ltSystemSetupGuard` (all routes → `/auth/setup` while the API has no admin, `/auth/setup` → login afterwards).
 * The guards read the client-writable `lt-auth-state` cookie: they gate the UI, the API authorizes.
 */
export const routes: Routes = [
  {
    path: '',
    canActivateChild: [ltSystemSetupGuard],
    children: [
      { path: '', loadComponent: () => import('./home-page').then((module) => module.HomePage), title: 'ng-base Playground' },
      { path: 'demo', loadChildren: () => import('./demo/demo.routes').then((module) => module.demoRoutes) },
      {
        path: 'auth',
        children: [
          { path: 'setup', loadComponent: () => import('./auth/setup-page').then((module) => module.SetupPage), title: 'Ersteinrichtung' },
          {
            path: 'login',
            canActivate: [ltGuestGuard('/app')],
            loadComponent: () => import('./auth/login-page').then((module) => module.LoginPage),
            title: 'Anmelden',
          },
          {
            path: 'register',
            canActivate: [ltGuestGuard('/app')],
            loadComponent: () => import('./auth/register-page').then((module) => module.RegisterPage),
            title: 'Registrieren',
          },
          {
            path: '2fa',
            canActivate: [ltGuestGuard('/app')],
            loadComponent: () => import('./auth/two-factor-page').then((module) => module.TwoFactorPage),
            title: 'Zwei-Faktor-Bestätigung',
          },
        ],
      },
      {
        path: 'app',
        canActivate: [ltAuthGuard],
        canActivateChild: [ltAuthGuard],
        loadComponent: () => import('./area/app-shell').then((module) => module.AppShell),
        children: [
          { path: '', loadComponent: () => import('./area/dashboard-page').then((module) => module.DashboardPage), title: 'Übersicht' },
          { path: 'upload', loadComponent: () => import('./area/upload-page').then((module) => module.UploadPage), title: 'Upload' },
          {
            path: 'admin',
            canActivate: [ltRoleGuard('admin')],
            loadComponent: () => import('./area/admin-page').then((module) => module.AdminPage),
            title: 'Administration',
          },
        ],
      },
    ],
  },
];
