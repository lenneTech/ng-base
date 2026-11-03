import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, importProvidersFrom, Provider } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { BASE_CMS_MODULE_CONFIG, BaseCMSModuleConfig } from '@lenne.tech/ng-base/base-cms';
import { BASE_MODULE_CONFIG, BaseModuleConfig } from '@lenne.tech/ng-base/shared';
import { ApolloTestingModule } from 'apollo-angular/testing';

/**
 * Providers for the specs of ng-base (not part of the library): the module configurations as in an app, and HTTP,
 * router, Apollo and animations as test doubles, so components can be created without a backend
 */
export function provideBaseTesting(): (Provider | EnvironmentProviders)[] {
  const baseConfig: BaseModuleConfig = { apiUrl: 'http://localhost:3000/graphql', prefix: 'test' };
  const cmsConfig: BaseCMSModuleConfig = { modelConfig: {}, fieldConfig: {} };
  return [
    { provide: BASE_MODULE_CONFIG, useValue: baseConfig },
    { provide: BASE_CMS_MODULE_CONFIG, useValue: cmsConfig },
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter([]),
    provideNoopAnimations(),
    importProvidersFrom(ApolloTestingModule),
  ];
}
