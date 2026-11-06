import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideBrowserGlobalErrorListeners, type ApplicationConfig } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideLtNgBase } from '@lenne.tech/ng-base';
import { provideLtAi } from '@lenne.tech/ng-base/ai';
import { ltAuthInterceptor, provideLtAuth } from '@lenne.tech/ng-base/auth/provide';
import { provideLtBug } from '@lenne.tech/ng-base/bug/provide';
import { provideLtFiles } from '@lenne.tech/ng-base/files';
import { provideLtSync } from '@lenne.tech/ng-base/sync';
import { provideLtUi } from '@lenne.tech/ng-base/ui/provide';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withInterceptors([ltAuthInterceptor])),
    provideLtNgBase(),
    provideLtAuth({ systemSetup: { enabled: true } }),
    provideLtFiles(),
    provideLtAi(),
    provideLtSync(),
    provideLtUi(),
    // Bug reporter: on in every stage but production (NG_PUBLIC_APP_ENV), fails closed without it.
    provideLtBug(),
  ],
};
