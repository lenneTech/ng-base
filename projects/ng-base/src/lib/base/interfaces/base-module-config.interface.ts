import { InjectionToken } from '@angular/core';
import { StorageType } from '../types/storage.type';

/**
 * Configuration for base module
 */
export interface BaseModuleConfig {
  /**
   * URL to server API
   * Default: 'localhost:3000'
   */
  apiUrl?: string;

  /**
   * Default redirect URL for AuthGuard
   * Default: '/auth'
   */
  authGuardRedirectUrl?: string;

  /**
   * Version of the App (for storage handling)
   * Default: null
   */
  version?: string;

  /**
   * Prefix of the App (for storage handling)
   * Default: null
   */
  prefix?: string;

  /**
   * Scroll detection offset for ScrollService
   * Should be >= scrollOffset
   * Default: 200
   */
  scrollDetectionOffset?: number;

  /**
   * Scroll offset for ScrollService
   * Default: 100
   */
  scrollOffset?: number;

  /**
   * Type of storage: 'session' or 'local'
   * Default: 'local'
   */
  storageType?: StorageType;
}

export const BASE_MODULE_CONFIG = new InjectionToken('BASE_MODULE_CONFIG');
