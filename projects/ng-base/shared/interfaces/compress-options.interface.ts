export interface CompressOptions {
  strict?: boolean;
  checkOrientation?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  minWidth?: number;
  minHeight?: number;
  width?: number;
  height?: number;
  resize?: 'contain' | 'cover' | 'none';
  quality?: number;
  mimeType?: string;
  convertTypes?: string | string[];
  convertSize?: number;
}
