import { CMSTableField } from './cms-table-field.interface';
import { Component } from '@angular/core';

export interface CMSModelConfig {
  label: string;
  customTemplateComponent?: Component;
  plural?: string;
  export?: boolean;
  import?: boolean;
  queryName?: string;
  tableFields?: CMSTableField;
  restricted?: boolean;
  exclude?: boolean;
  roles?: string[];
  order?: number;
}
