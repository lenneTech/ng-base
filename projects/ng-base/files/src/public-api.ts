/*
 * Public API of `@lenne.tech/ng-base/files`: TUS uploads (signals) against nest-server `/tus`, file info/download URLs
 * and the upload component.
 */
export { formatLtDuration, formatLtFileSize, isLtMongoId, LtFileService } from './lib/file-service';
export { LT_FILES_DEFAULTS, LT_FILES_OPTIONS, provideLtFiles } from './lib/files-options';
export type { LtFilesOptions, LtResolvedFilesOptions, LtTusOptions } from './lib/files-options';
export { LT_TUS_CLIENT_LOADER, LT_TUS_CLIENT_MISSING_MESSAGE, loadLtTusClient } from './lib/tus-client';
export type { LtTusClient, LtTusClientUpload, LtTusClientUploadOptions, LtTusHttpRequest, LtTusHttpResponse, LtTusPreviousUpload } from './lib/tus-client';
export { injectLtTusUpload, LT_TUS_FILE_ID_HEADER, LT_TUS_RETRY_DELAYS } from './lib/tus-upload';
export type { LtTusUpload } from './lib/tus-upload';
export type { LtFileInfo, LtFileState, LtTusUploadState, LtUploadItem, LtUploadOptions, LtUploadProgress, LtUploadStatus } from './lib/upload-types';
