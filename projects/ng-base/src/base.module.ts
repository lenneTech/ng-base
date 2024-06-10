import { APOLLO_OPTIONS, ApolloModule } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { ModuleWithProviders, NgModule, Provider } from '@angular/core';

import { apolloOptionsFactory } from './factories/apollo-options.factory';
import { AuthService, BASE_MODULE_CONFIG, BaseModuleConfig, WsService } from '@lenne.tech/ng-base/shared';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

/**
 * Base module
 */
@NgModule({ exports: [ApolloModule], imports: [ApolloModule], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class BaseModule {
  /**
   * Set configuration of base module in root module of the app
   */
  static forRoot(baseModuleConfig: BaseModuleConfig = {}, AppAuthService?): ModuleWithProviders<BaseModule> {
    // Default config
    const config = {
      apiUrl: '',
      authGuardRedirectUrl: '/auth',
      logging: false,
      version: null,
      prefix: null,
      scrollDetectionOffset: 200,
      scrollOffset: 100,
      storageType: 'local',
      securePasswordTransfer: true,
      ...baseModuleConfig,
    };

    if (config.logging) {
      console.log('Config:', config);
    }

    // Prepare providers
    const providers: Provider[] = [
      {
        provide: BASE_MODULE_CONFIG,
        useValue: config,
      },
    ];

    // Add apollo features if API URL is set
    if (baseModuleConfig.apiUrl) {
      providers.push({
        provide: APOLLO_OPTIONS,
        useFactory: apolloOptionsFactory,
        deps: [BASE_MODULE_CONFIG, HttpLink, AppAuthService ? AppAuthService : AuthService, WsService],
      });
    } else if (config.logging) {
      console.log('apiUrl is missing, ApolloLink is not initialized');
    }

    // Return root module
    return {
      ngModule: BaseModule,
      providers,
    };
  }
}
