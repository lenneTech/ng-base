import { InjectionToken } from '@angular/core';
import { CMSFieldConfig, CMSModelConfig } from '@lenne.tech/ng-base/shared';

export interface BaseCMSModuleConfig {
  modelConfig?: { [key: string]: CMSModelConfig | any };
  fieldConfig?: { [key: string]: { [key: string]: CMSFieldConfig | any } };
  logging?: boolean;
  logoUrl?: string;
  branding?: boolean;
}

export const BASE_CMS_MODULE_CONFIG = new InjectionToken('BASE_CMS_MODULE_CONFIG');
