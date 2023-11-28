import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { BASE_MODULE_CONFIG, BaseModuleConfig } from '../interfaces/base-module-config.interface';
import { isPlatformBrowser } from '@angular/common';

/**
 * Storage service for local data storage
 */
@Injectable({
  providedIn: 'root',
})
export class StorageService {
  /**
   * Storage
   */
  protected storage: any = null;

  /**
   * Prefix for storage keys
   */
  protected prefix = '';

  /**
   * Initializations
   */
  constructor(
    @Inject(BASE_MODULE_CONFIG) private moduleConfig: BaseModuleConfig,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    // Set storage
    const type = moduleConfig.storageType ? moduleConfig.storageType : 'local';
    if (isPlatformBrowser(this.platformId)) {
      if (type === 'session') {
        this.storage = sessionStorage;
      } else {
        if (localStorage) {
          this.storage = localStorage;
        } else {
          this.storage = null;
        }
      }
    }

    // Set prefix
    this.prefix = '';
    if (moduleConfig.prefix) {
      this.prefix += moduleConfig.prefix + '_';
    }
    if (moduleConfig.version) {
      this.prefix += moduleConfig.version + '_';
    }
  }

  /**
   * Save itemKeys
   *
   * If you want to save one item, use itemKeys and value parameters like these:
   * save('KEY_OF_THE_ITEM', ITEM)
   *
   * If you want to save multiple items, use itemKeys only (value parameter will be ignored):
   * save({'KEY_OF_ITEM_1': ITEM_1, 'KEY_OF_ITEM_2': ITEM_2, ...})
   */
  public save(itemKeys: string | { [key: string]: any }, value?: any): boolean {
    // Check local storage
    if (!this.storage) {
      return false;
    }

    // Check item keys and value
    if (
      !itemKeys ||
      (typeof itemKeys === 'object' && !Object.keys(itemKeys).length) ||
      (typeof itemKeys === 'string' && value === undefined)
    ) {
      return false;
    }

    if (typeof itemKeys === 'object') {
      for (const [itemKey, itemValue] of Object.entries(itemKeys)) {
        this.storage.setItem(this.prefix + itemKey, JSON.stringify(itemValue));
      }
      return true;
    }

    this.storage.setItem(this.prefix + itemKeys, JSON.stringify(value));
    return true;
  }

  /**
   * Load items via key(s)
   */
  public load(itemKeys: string | string[]): any {
    // Check local storage
    if (!this.storage) {
      return;
    }

    // Check item keys
    if (!itemKeys || (Array.isArray(itemKeys) && !itemKeys.length)) {
      return null;
    }

    if (Array.isArray(itemKeys)) {
      const back = {};
      itemKeys.forEach((itemKey) => {
        const loadedItem = this.storage.getItem(this.prefix + itemKey);
        if (loadedItem) {
          back[itemKey] = JSON.parse(loadedItem);
        } else {
          back[itemKey] = null;
        }
      });
      return back;
    }

    let value = this.storage.getItem(this.prefix + itemKeys);
    if (value) {
      value = JSON.parse(value);
    }

    return value;
  }

  /**
   * Remove item from storage
   *
   * @param itemKeys keys or key to remove
   */
  public remove(itemKeys: string | string[]): boolean {
    // Check local storage
    if (!this.storage) {
      return false;
    }

    if (Array.isArray(itemKeys)) {
      itemKeys.forEach((key) => {
        this.storage.removeItem(this.prefix + key);
      });
      return true;
    }

    this.storage.removeItem(this.prefix + itemKeys);
    return true;
  }

  /**
   * Clear local storage
   */
  public reset(): void {
    this.storage.clear();
  }
}
