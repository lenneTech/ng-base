import type { Routes } from '@angular/router';
import { provideLtUiOverlayDefaults } from '@lenne.tech/ng-base/ui';

/** Lazy routes of the overlay demo; the CDK overlay defaults (toasts above dialogs) stay out of the initial bundle. */
export const demoRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./overlay-demo-page').then((module) => module.OverlayDemoPage),
    providers: [provideLtUiOverlayDefaults()],
    title: 'Toast und Dialog',
  },
  {
    path: 'file-links',
    loadComponent: () => import('./file-links-demo-page').then((module) => module.FileLinksDemoPage),
    title: 'Datei-Links',
  },
];
