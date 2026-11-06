import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service, signal, type WritableSignal } from '@angular/core';
import { LT_RUNTIME_CONFIG } from '@lenne.tech/ng-base';

/**
 * JSON values in `localStorage` (or `sessionStorage`) under the project prefix (`NG_PUBLIC_STORAGE_PREFIX` →
 * `<prefix>_<key>`). SSR-safe: on the server every read returns the fallback and writes are ignored.
 */
@Service()
export class LtStorageService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly prefix = inject(LT_RUNTIME_CONFIG, { optional: true })?.storagePrefix ?? '';

  /** Store a JSON-serialisable value. Returns `false` when no storage is available or it is full. */
  save(key: string, value: unknown, type: 'local' | 'session' = 'local'): boolean {
    const storage = this.storage(type);
    if (!storage) {
      return false;
    }
    try {
      storage.setItem(this.key(key), JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  /** Load a value (`fallback` when missing, unparsable or on the server). */
  load<T>(key: string, fallback: T, type?: 'local' | 'session'): T;
  load<T>(key: string, fallback?: T, type?: 'local' | 'session'): T | undefined;
  load<T>(key: string, fallback?: T, type: 'local' | 'session' = 'local'): T | undefined {
    const raw = this.storage(type)?.getItem(this.key(key));
    if (raw === null || raw === undefined) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  /** Remove a value. */
  remove(key: string, type: 'local' | 'session' = 'local'): void {
    this.storage(type)?.removeItem(this.key(key));
  }

  /** Remove every value under the project prefix. */
  clear(type: 'local' | 'session' = 'local'): void {
    const storage = this.storage(type);
    if (!storage) {
      return;
    }
    const prefix = this.key('');
    for (const key of Object.keys(storage)) {
      if (key.startsWith(prefix)) {
        storage.removeItem(key);
      }
    }
  }

  /** A writable signal persisted under `key` (initial value from storage, every `set` saved). */
  signal<T>(key: string, fallback: T, type: 'local' | 'session' = 'local'): WritableSignal<T> {
    const state = signal<T>(this.load(key, fallback, type));
    const originalSet = state.set.bind(state);
    state.set = (value: T) => {
      originalSet(value);
      this.save(key, value, type);
    };
    state.update = (updater: (value: T) => T) => state.set(updater(state()));
    return state;
  }

  private key(key: string): string {
    return this.prefix ? `${this.prefix}_${key}` : key;
  }

  private storage(type: 'local' | 'session'): Storage | null {
    if (!this.isBrowser) {
      return null;
    }
    try {
      return type === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    } catch {
      return null;
    }
  }
}
