import { inject, InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import { LT_RUNTIME_CONFIG, mergeLtFeatureOptions } from '@lenne.tech/ng-base';

/** TUS options of `provideLtFiles({ tus })`; runtime overrides `NG_PUBLIC_LT_TUS_*`. */
export interface LtTusOptions {
  /** Chunk size in bytes (default 5 MB). */
  defaultChunkSize?: number;
  /**
   * TUS endpoint (default **`/tus`**, nest-server's default; nuxt-extensions defaulted to `/files/upload`). Relative values
   * are paths on the API while `resolveAgainstApi` is on; absolute URLs are used as they are.
   */
  defaultEndpoint?: string;
  /** Resolve a relative endpoint against the API base URL (default `true`). Turn off only behind an own same-origin proxy. */
  resolveAgainstApi?: boolean;
}

/** Options of `provideLtFiles()`. */
export interface LtFilesOptions {
  /** Base path of nest-server's file controller for info/download URLs (default `/files`). */
  filesBasePath?: string;
  /** TUS upload options. */
  tus?: LtTusOptions;
}

/** Resolved files options. */
export interface LtResolvedFilesOptions {
  filesBasePath: string;
  tus: Required<LtTusOptions>;
}

/** Defaults of {@link LtFilesOptions}. */
export const LT_FILES_DEFAULTS: LtResolvedFilesOptions = {
  filesBasePath: '/files',
  tus: { defaultChunkSize: 5 * 1024 * 1024, defaultEndpoint: '/tus', resolveAgainstApi: true },
};

const LT_FILES_INPUT_OPTIONS = new InjectionToken<LtFilesOptions>('LT_FILES_INPUT_OPTIONS', { factory: () => ({}) });

/** Resolved files options (defaults ← `provideLtFiles(options)` ← runtime `NG_PUBLIC_LT_TUS_*`). */
export const LT_FILES_OPTIONS = new InjectionToken<LtResolvedFilesOptions>('LT_FILES_OPTIONS', {
  factory: () => {
    const input = inject(LT_FILES_INPUT_OPTIONS);
    const runtime = inject(LT_RUNTIME_CONFIG, { optional: true });
    return {
      filesBasePath: input.filesBasePath ?? LT_FILES_DEFAULTS.filesBasePath,
      tus: mergeLtFeatureOptions(LT_FILES_DEFAULTS.tus, input.tus, runtime?.lt.tus),
    };
  },
});

/** Files providers (TUS upload defaults, file info/download base path). Optional when the defaults fit. */
export function provideLtFiles(options: LtFilesOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: LT_FILES_INPUT_OPTIONS, useValue: options }]);
}
