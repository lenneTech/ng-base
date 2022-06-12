import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { BaseCmsComponent } from './pages/base-cms/base-cms.component';
import { BaseCMSRoutingModule } from './base-cms-routing.module';
import { BaseComponentsModule } from '@lenne.tech/ng-base/base-components';
import { BASE_CMS_MODULE_CONFIG, BaseCMSModuleConfig } from './interfaces/base-cms-module-config.interface';

export function CMSConfigFactory() {
  return {
    tableFields: ['id', 'name', 'title', 'description', 'email', 'createdAt', 'updatedAt'],
    excludedModels: [],
    restrictedModels: [],
    branding: true,
    logging: false,
    ...BaseCMSModule.config,
  };
}

@NgModule({
  imports: [
    // Modules
    CommonModule,
    ReactiveFormsModule,
    BaseCMSRoutingModule,
    BaseComponentsModule,
  ],
  declarations: [BaseCmsComponent],
  exports: [],
  providers: [
    {
      provide: BASE_CMS_MODULE_CONFIG,
      useFactory: CMSConfigFactory,
    },
  ],
})
export class BaseCMSModule {
  static config: BaseCMSModuleConfig;
}
