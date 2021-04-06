import { APOLLO_OPTIONS } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { ModuleWithProviders, NgModule } from '@angular/core';
import { AuthService } from './services/auth.service';
import { BASE_MODULE_CONFIG, BaseModuleConfig } from './interfaces/base-module-config.interface';
import { apolloOptionsFactory } from './factories/apollo-options.factory';
import { ContextMenuDirective } from './directives/context-menu.directive';
import { LazyLoadDirective } from './directives/lazy-load.directive';
import { MatchHeightDirective } from './directives/match-height.directive';
import { ResizableDirective } from './directives/resizable.directive';
import { EllipsesPipe } from './pipes/ellipses.pipe';
import { SafeHtmlPipe } from './pipes/safe-html.pipe';

// Imported and exported elements
const elements = [
  // Directives
  ContextMenuDirective,
  LazyLoadDirective,
  MatchHeightDirective,
  ResizableDirective,

  // Pipes
  EllipsesPipe,
  SafeHtmlPipe
];

/**
 * Base module
 */
@NgModule({
  declarations: elements,
  exports: elements
})
export class BaseModule {

  /**
   * Set configuration of base module in root module of the app
   */
  static forRoot(baseModuleConfig: BaseModuleConfig = {}): ModuleWithProviders<BaseModule> {

    // Default config
    const config = {
      apiUrl: 'localhost:300',
      authGuardRedirectUrl: '/auth',
      version: null,
      prefix: null,
      scrollDetectionOffset: 200,
      scrollOffset: 100,
      storageType: 'local',
      ...baseModuleConfig
    };

    return {
      ngModule: BaseModule,
      providers: [
        {
          provide: BASE_MODULE_CONFIG,
          useValue: baseModuleConfig
        },
        {
          provide: APOLLO_OPTIONS,
          useFactory: apolloOptionsFactory,
          deps: [BASE_MODULE_CONFIG, HttpLink, AuthService],
        }
      ]
    };
  }
}
