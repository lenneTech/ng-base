import { APOLLO_OPTIONS } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { ModuleWithProviders, NgModule, Provider } from '@angular/core';

import { BASE_MODULE_CONFIG, BaseModuleConfig } from './interfaces/base-module-config.interface';
import { AuthService } from './services/auth.service';
import { WsService } from './services/ws.service';
import { apolloOptionsFactory } from './factories/apollo-options.factory';
import { ContextMenuDirective } from './directives/context-menu.directive';
import { LazyLoadDirective } from './directives/lazy-load.directive';
import { MatchHeightDirective } from './directives/match-height.directive';
import { ResizableDirective } from './directives/resizable.directive';
import { EllipsesPipe } from './pipes/ellipses.pipe';
import { SafeHtmlPipe } from './pipes/safe-html.pipe';
import { DateAgoPipe } from './pipes/date-ago.pipe';

// Imported and exported elements
const elements = [
  // Directives
  ContextMenuDirective,
  LazyLoadDirective,
  MatchHeightDirective,
  ResizableDirective,

  // Pipes
  EllipsesPipe,
  SafeHtmlPipe,
  DateAgoPipe,
];

/**
 * Base module
 */
@NgModule({
  declarations: elements,
  exports: elements,
})
export class BaseModule {
  /**
   * Set configuration of base module in root module of the app
   */
  static forRoot(baseModuleConfig: BaseModuleConfig = {}, AppAuthService?): ModuleWithProviders<BaseModule> {
    // Default config
    const config = {
      apiUrl: 'localhost:3000',
      authGuardRedirectUrl: '/auth',
      logging: false,
      version: null,
      prefix: null,
      scrollDetectionOffset: 200,
      scrollOffset: 100,
      storageType: 'local',
      ...baseModuleConfig,
    };

    // Prepare providers
    const providers: Provider[] = [
      {
        provide: BASE_MODULE_CONFIG,
        useValue: baseModuleConfig,
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