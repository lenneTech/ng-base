import { CMSEnumValues } from './cms-enum-values.interface';

export interface CMSTableField {
  [key: string]: {
    label: string;
    dateFormat?: string;
    enumValues?: { [key: string]: CMSEnumValues };
  };
}
