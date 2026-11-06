import { InjectionToken } from '@angular/core';

/** The request object tus-js-client hands to `onBeforeRequest` / `onAfterResponse`. */
export interface LtTusHttpRequest {
  getUnderlyingObject(): unknown;
  setHeader(header: string, value: string): void;
}

/** The response object tus-js-client hands to `onAfterResponse` (and inside `DetailedError.originalResponse`). */
export interface LtTusHttpResponse {
  getHeader(header: string): null | string | undefined;
  getStatus(): number;
}

/** A previous upload of the same file found in tus-js-client's URL storage. */
export interface LtTusPreviousUpload {
  creationTime?: string;
}

/** The tus-js-client upload options `injectLtTusUpload()` sets. */
export interface LtTusClientUploadOptions {
  chunkSize?: number;
  endpoint?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, string>;
  onAfterResponse?: (req: LtTusHttpRequest, res: LtTusHttpResponse) => void;
  onBeforeRequest?: (req: LtTusHttpRequest) => void;
  onError?: (error: Error) => void;
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
  onShouldRetry?: (error: Error & { originalResponse?: LtTusHttpResponse | null }, retryAttempt: number, options: unknown) => boolean;
  onSuccess?: () => void;
  removeFingerprintOnSuccess?: boolean;
  retryDelays?: number[];
}

/** The part of a tus-js-client `Upload` instance `injectLtTusUpload()` uses. */
export interface LtTusClientUpload {
  url: null | string;
  abort(shouldTerminate?: boolean): Promise<void>;
  findPreviousUploads(): Promise<LtTusPreviousUpload[]>;
  resumeFromPreviousUpload(previousUpload: LtTusPreviousUpload): void;
  start(): void;
}

/** The part of the `tus-js-client` module `injectLtTusUpload()` uses (structural, so the peer stays optional). */
export interface LtTusClient {
  Upload: new (file: File, options: LtTusClientUploadOptions) => LtTusClientUpload;
}

/** Error text when the optional peer `tus-js-client` is missing. */
export const LT_TUS_CLIENT_MISSING_MESSAGE =
  '[@lenne.tech/ng-base] tus-js-client is not installed. Install it to use uploads: pnpm add tus-js-client (or npm install tus-js-client).';

let tusClient: Promise<LtTusClient> | null = null;

/** Load `tus-js-client` lazily (once); rejects with an install hint when the optional peer is missing. */
export function loadLtTusClient(): Promise<LtTusClient> {
  tusClient ??= import('tus-js-client').then(
    (module) => {
      const candidate = module as unknown as Partial<LtTusClient> & { default?: Partial<LtTusClient> };
      const client = candidate.Upload ? candidate : candidate.default;
      if (!client?.Upload) {
        throw new Error(LT_TUS_CLIENT_MISSING_MESSAGE);
      }
      return client as LtTusClient;
    },
    () => {
      throw new Error(LT_TUS_CLIENT_MISSING_MESSAGE);
    },
  );
  // A failed load is not cached, so installing the package and reloading the chunk can recover.
  tusClient.catch(() => (tusClient = null));
  return tusClient;
}

/**
 * Loader of the `tus-js-client` module used by `injectLtTusUpload()` (default: lazy `import('tus-js-client')`).
 * Replace it in tests with a fake client, or to supply a preconfigured build.
 */
export const LT_TUS_CLIENT_LOADER = new InjectionToken<() => Promise<LtTusClient>>('LT_TUS_CLIENT_LOADER', {
  factory: () => loadLtTusClient,
});
