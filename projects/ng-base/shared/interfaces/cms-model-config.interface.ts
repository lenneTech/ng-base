import { CMSTableField } from './cms-table-field.interface';

export interface CMSModelConfig {
  label: string;
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
