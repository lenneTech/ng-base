/*
 * Public API of `@lenne.tech/ng-base/files/ui`: the upload component `<lt-tus-upload>` (drop zone, list with progress,
 * pause/resume/cancel/retry). Kept apart from `@lenne.tech/ng-base/files` so `provideLtFiles()` and the upload services
 * do not pull the ui layer into the initial bundle.
 */
export { LtTusUploadComponent, matchesLtAccept } from './lib/tus-upload-component';
