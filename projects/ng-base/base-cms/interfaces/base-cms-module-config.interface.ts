import { InjectionToken } from '@angular/core';

export interface BaseCMSModuleConfig {
  tableFields?: string[];
  excludedModels?: string[];
  restrictedModels?: [{ model: string; roles: string[] }];
  logging?: boolean;
  branding?: boolean;
}

export const BASE_CMS_MODULE_CONFIG = new InjectionToken('BASE_CMS_MODULE_CONFIG');
