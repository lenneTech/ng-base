import { inject, isDevMode, Service } from '@angular/core';
import { LT_FETCH, LtApiUrlService } from '@lenne.tech/ng-base';

import { LT_FILES_OPTIONS } from './files-options';
import type { LtFileInfo, LtFileState } from './upload-types';

/**
 * nest-server file helpers (counterpart of `useLtFile()`). URLs are resolved against the API base URL (fix: the Nuxt
 * version built them relative to the app origin), under `filesBasePath` of `provideLtFiles()` (default `/files`).
 */
@Service()
export class LtFileService implements LtFileState {
  private readonly api = inject(LtApiUrlService);
  private readonly fetch = inject(LT_FETCH);
  private readonly options = inject(LT_FILES_OPTIONS);

  /** `GET <api>/files/info/:id` with credentials; `null` for empty ids or on error, a non-ObjectId string is returned as is. */
  async getFileInfo(id: string | undefined): Promise<LtFileInfo | null | string> {
    if (!id) {
      return null;
    }
    if (!isLtMongoId(id)) {
      return id;
    }
    try {
      const response = await this.fetch(`${this.baseUrl()}/info/${encodeURIComponent(id)}`, {
        credentials: 'include',
        headers: { accept: 'application/json' },
        method: 'GET',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const info = (await response.json()) as LtFileInfo | null;
      return info && typeof info === 'object' ? info : null;
    } catch (error) {
      if (isDevMode()) {
        console.error('[@lenne.tech/ng-base] Error fetching file info:', error);
      }
      return null;
    }
  }

  /**
   * `<api>/files/id/:id` — nest-server's `GET files/id/:id` (CoreFileController), which streams the file (or redirects
   * to a presigned S3 URL) after the rights check (`file.downloadRoles`, default admin).
   */
  getFileUrl(id: string): string {
    return `${this.baseUrl()}/id/${encodeURIComponent(id)}`;
  }

  /**
   * Download URL. nest-server sets `Content-Disposition` from the stored filename on `GET files/id/:id`, so this is the
   * same URL as {@link getFileUrl}; `filename` is accepted for API compatibility with nuxt-extensions and ignored (the
   * server has no rename parameter — nuxt-extensions' `/files/download/:id` does not exist in nest-server 12.5).
   */
  getDownloadUrl(id: string, _filename?: string): string {
    return this.getFileUrl(id);
  }

  /** 1024-based `B`/`KB`/`MB`/`GB`/`TB` with two decimals. */
  formatFileSize(bytes: number): string {
    return formatLtFileSize(bytes);
  }

  /** `Ns`, `Nm Ns`, `Nh Nm`. */
  formatDuration(seconds: number): string {
    return formatLtDuration(seconds);
  }

  /** `/^[a-f\d]{24}$/i`. */
  isValidMongoID(id: string): boolean {
    return isLtMongoId(id);
  }

  /** `<api><filesBasePath>` without a trailing slash; an absolute `filesBasePath` is used as is. */
  private baseUrl(): string {
    const basePath = this.options.filesBasePath || '/files';
    return this.api.buildUrl(basePath).replace(/\/+$/, '');
  }
}

/** 1024-based file size with two decimals (`0 B` for non-positive input). */
export function formatLtFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / 1024 ** exponent).toFixed(2))} ${units[exponent]}`;
}

/** Human readable duration (`45s`, `2m 5s`, `1h 3m`). */
export function formatLtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) {
    return `${Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0))}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  }
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/** Whether `id` is a MongoDB ObjectId (24 hex characters). */
export function isLtMongoId(id: string): boolean {
  return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
}
