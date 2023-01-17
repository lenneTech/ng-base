import { ValidatorFn } from '@angular/forms';
import { CMSEnumValues } from './cms-enum-values.interface';
import { CompressOptions } from './compress-options.interface';
import { CroppingOptions } from './cropping-options.interface';

export interface CMSFieldConfig {
  label: string;
  required?: boolean;
  exclude?: boolean;
  restricted?: boolean;
  enumValues?: { [key: string]: CMSEnumValues };
  order?: number;
  type?: string;
  roles?: string[];
  placeholder?: string;
  fields?: { [key: string]: CMSFieldConfig };

  // Reference
  method?: string;
  patchField?: string;
  useParamAsArg?: boolean;
  searchable?: boolean;
  creationLink?: string;
  valueField?: string;
  nameField?: string[] | string;
  requestFields?: string[];

  // Image
  url?: string;
  path?: string;
  uploadPath?: string;
  deletePath?: string;
  dragText?: string;
  validExtensions?: string[];
  preButtonText?: string;
  buttonText?: string;
  supportText?: string;
  releaseText?: string;
  maxSize?: number;
  croppingImage?: boolean;
  croppingOptions?: CroppingOptions;
  compressOptions?: CompressOptions;
  imageMode?: 'base64' | 'file';

  // Tags
  validators?: ValidatorFn[];
}
