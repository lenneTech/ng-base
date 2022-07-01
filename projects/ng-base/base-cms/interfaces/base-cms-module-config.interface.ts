import { InjectionToken } from '@angular/core';

export interface BaseCMSModuleConfig {
  modelConfig?: { [key: string]: any };
  fieldConfig?: { [key: string]: any };
  logging?: boolean;
  logoUrl?: string;
  branding?: boolean;
}

export const BASE_CMS_MODULE_CONFIG = new InjectionToken('BASE_CMS_MODULE_CONFIG');
