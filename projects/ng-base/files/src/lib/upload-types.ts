import type { Signal } from '@angular/core';

// =============================================================================
// Upload Types
// =============================================================================

/**
 * Status of an upload item
 */
export type LtUploadStatus = 'completed' | 'error' | 'idle' | 'paused' | 'uploading';

/**
 * Progress information for an upload
 */
export interface LtUploadProgress {
  /** Total bytes to upload */
  bytesTotal: number;
  /** Bytes already uploaded */
  bytesUploaded: number;
  /** Percentage complete (0-100) */
  percentage: number;
  /** Estimated remaining time in seconds */
  remainingTime: number;
  /** Current upload speed in bytes/second */
  speed: number;
}

/**
 * Individual upload item with progress tracking
 */
export interface LtUploadItem {
  /** Timestamp when upload completed */
  completedAt?: Date;
  /** Error message if upload failed */
  error?: string;
  /** The file being uploaded */
  file: File;
  /**
   * Id of the stored file, from the `X-File-Id` header of the response that completed the upload
   * (nest-server 11.42.13+). Use it for file links and references — not the last segment of `url`,
   * which is the TUS upload id. Undefined when the backend sends no such header: an older
   * nest-server, or an `onUploadComplete()` override that never calls `super.onUploadComplete()`.
   */
  fileId?: string;
  /** Unique identifier for this upload */
  id: string;
  /** Custom metadata to include with the upload */
  metadata?: Record<string, string>;
  /** Current progress information */
  progress: LtUploadProgress;
  /** Timestamp when upload started */
  startedAt?: Date;
  /** Current status of the upload */
  status: LtUploadStatus;
  /** URL of the TUS upload resource (available after completion) — not a file URL; see `fileId` */
  url?: string;
}

/**
 * Configuration options for TUS uploads
 */
export interface LtUploadOptions {
  /** Automatically start uploads when files are added (default: true) */
  autoStart?: boolean;
  /** Chunk size in bytes (default: 5MB) */
  chunkSize?: number;
  /** TUS upload endpoint URL; a relative path is resolved against the API (see `tus.resolveAgainstApi`) */
  endpoint?: string;
  /** Additional headers to include with requests */
  headers?: Record<string, string>;
  /** Default metadata to include with all uploads */
  metadata?: Record<string, string>;
  /** Callback when an upload fails */
  onError?: (item: LtUploadItem, error: Error) => void;
  /** Callback when upload progress updates */
  onProgress?: (item: LtUploadItem) => void;
  /** Callback when an upload completes successfully */
  onSuccess?: (item: LtUploadItem) => void;
  /** Maximum number of concurrent uploads (default: 3) */
  parallelUploads?: number;
  /** Retry delays in milliseconds (default: [0, 1000, 3000, 5000, 10000]) */
  retryDelays?: number[];
}

/**
 * Return type for injectLtTusUpload()
 */
export interface LtTusUploadState {
  // Actions
  /** Add files to the upload queue, returns array of upload IDs */
  addFiles: (files: File | File[]) => Promise<string[]>;
  /** Cancel all uploads */
  cancelAll: () => void;
  /** Cancel a specific upload by ID */
  cancelUpload: (id: string) => void;
  /** Remove all completed uploads from the list */
  clearCompleted: () => void;
  /** Get an upload item by ID */
  getUpload: (id: string) => LtUploadItem | undefined;
  /** Pause all active uploads */
  pauseAll: () => void;
  /** Pause a specific upload by ID */
  pauseUpload: (id: string) => void;
  /** Remove an upload from the list (also cancels if active) */
  removeUpload: (id: string) => void;
  /** Resume all paused uploads */
  resumeAll: () => void;
  /** Resume a specific upload by ID */
  resumeUpload: (id: string) => void;
  /** Retry a failed upload by ID */
  retryUpload: (id: string) => void;
  /** Start all idle uploads */
  startAll: () => void;
  /** Start a specific upload by ID */
  startUpload: (id: string) => void;

  // State
  /** Whether any uploads are currently in progress */
  isUploading: Signal<boolean>;
  /** Aggregated progress of all uploads */
  totalProgress: Signal<LtUploadProgress>;
  /** List of all upload items */
  uploads: Signal<LtUploadItem[]>;
}

/**
 * File info returned from the server
 */
export interface LtFileInfo {
  [key: string]: unknown;
  filename: string;
  id: string;
  mimetype: string;
  size: number;
  url?: string;
}

/**
 * Return type for LtFileService
 */
export interface LtFileState {
  /** Format duration in seconds to human readable string */
  formatDuration: (seconds: number) => string;
  /** Format bytes to human readable string (e.g., "1.5 MB") */
  formatFileSize: (bytes: number) => string;
  /** Get download URL for a file by ID */
  getDownloadUrl: (id: string, filename?: string) => string;
  /** Get file info from the server by ID */
  getFileInfo: (id: string | undefined) => Promise<LtFileInfo | null | string>;
  /** Get direct file URL by ID */
  getFileUrl: (id: string) => string;
  /** Check if a string is a valid MongoDB ObjectId */
  isValidMongoID: (id: string) => boolean;
}
