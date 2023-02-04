import { OutputFormat } from 'ngx-image-cropper/lib/interfaces/cropper-options.interface';

export interface CroppingOptions {
  maintainAspectRatio?: boolean;
  onlyScaleDown?: boolean;
  aspectRatio?: number;
  imageQuality?: number;
  resizeToWidth?: number;
  resizeToHeight?: number;
  autoCrop?: boolean;
  alignImage?: 'left' | 'center';
  format?: OutputFormat;
}
