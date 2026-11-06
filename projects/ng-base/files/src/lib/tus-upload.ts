import { assertInInjectionContext, computed, DestroyRef, inject, signal } from '@angular/core';
import { isLtAbsoluteUrl, LtApiUrlService } from '@lenne.tech/ng-base';
import { LtAuthStateService } from '@lenne.tech/ng-base/auth/provide';

import { LT_FILES_OPTIONS } from './files-options';
import { LT_TUS_CLIENT_LOADER, type LtTusClientUpload, type LtTusHttpRequest, type LtTusPreviousUpload } from './tus-client';
import type { LtTusUploadState, LtUploadItem, LtUploadOptions, LtUploadProgress } from './upload-types';

/** A TUS upload queue with signal state, created by {@link injectLtTusUpload}. */
export type LtTusUpload = LtTusUploadState;

/**
 * Response header in which nest-server (11.42.13+, `TUS_FILE_ID_HEADER`) names the stored file. Sent on the response that
 * completes the upload and listed in `Access-Control-Expose-Headers`.
 */
export const LT_TUS_FILE_ID_HEADER = 'X-File-Id';

/** Default retry delays of a TUS upload in milliseconds. */
export const LT_TUS_RETRY_DELAYS: readonly number[] = [0, 1000, 3000, 5000, 10000];

const DEFAULT_PARALLEL_UPLOADS = 3;

interface ResolvedUploadOptions extends LtUploadOptions {
  autoStart: boolean;
  chunkSize: number;
  endpoint: string;
  parallelUploads: number;
  retryDelays: number[];
}

/** Exponential moving average (0.7 old / 0.3 new) of the upload speed in bytes per second. */
class LtSpeedTracker {
  private lastBytes = 0;
  private lastTime = 0;
  private smoothed = 0;
  private baseline = true;

  /** Start a new measurement from `bytes` (after a (re)start; the time of a pause does not count). */
  reset(bytes: number): void {
    this.lastBytes = bytes;
    this.lastTime = Date.now();
    this.smoothed = 0;
    this.baseline = true;
  }

  /** Record `bytes` uploaded so far and return the smoothed speed. */
  sample(bytes: number): number {
    const now = Date.now();
    if (this.baseline && bytes < this.lastBytes) {
      this.lastBytes = bytes; // a resumed upload reports its offset first
    }
    const seconds = (now - this.lastTime) / 1000;
    if (seconds > 0 && bytes >= this.lastBytes) {
      const current = (bytes - this.lastBytes) / seconds;
      this.smoothed = this.smoothed === 0 ? current : this.smoothed * 0.7 + current * 0.3;
      this.lastBytes = bytes;
      this.lastTime = now;
      this.baseline = false;
    }
    return Math.round(this.smoothed);
  }
}

/**
 * Create a TUS upload queue (counterpart of `useLtTusUpload()`), bound to the current injection context: running
 * uploads are aborted when the component/service is destroyed.
 *
 * `tus-js-client` (optional peer) is loaded lazily; without it `addFiles` rejects with an install hint.
 * Defaults: `autoStart` true, chunk size and endpoint from `provideLtFiles()`, 3 parallel uploads, retries
 * `[0, 1000, 3000, 5000, 10000]` (none on 4xx except 429), `withCredentials` for the session cookie, Bearer token
 * in JWT mode, the nest-server file id from the `X-File-Id` response header, resume via fingerprints.
 *
 * Options are read whenever an upload is created or started, so an object with getters (e.g. over component inputs)
 * stays current. `undefined` values keep the default. Uploads beyond `parallelUploads` wait in a queue and start as
 * soon as a slot is free; `startUpload`/`resumeUpload`/`retryUpload` of a single item start it right away.
 *
 * @example
 * protected readonly upload = injectLtTusUpload({ onSuccess: (item) => this.attach(item.fileId) });
 */
export function injectLtTusUpload(options: LtUploadOptions = {}): LtTusUpload {
  assertInInjectionContext(injectLtTusUpload);
  const filesOptions = inject(LT_FILES_OPTIONS);
  const api = inject(LtApiUrlService);
  const authState = inject(LtAuthStateService);
  const loadClient = inject(LT_TUS_CLIENT_LOADER);

  const items = signal<LtUploadItem[]>([]);
  const tusUploads = new Map<string, LtTusClientUpload>();
  const speedTrackers = new Map<string, LtSpeedTracker>();
  /** Start generation per upload: a pause/cancel invalidates a start whose resume lookup is still running. */
  const generations = new Map<string, number>();
  const queue: string[] = [];
  let sequence = 0;
  let destroyed = false;

  const uploads = items.asReadonly();
  const isUploading = computed(() => items().some((item) => item.status === 'uploading'));
  const totalProgress = computed<LtUploadProgress>(() => {
    const list = items();
    if (list.length === 0) {
      return idleProgress(0);
    }
    const bytesUploaded = list.reduce((sum, item) => sum + item.progress.bytesUploaded, 0);
    const bytesTotal = list.reduce((sum, item) => sum + item.progress.bytesTotal, 0);
    const speed = list.reduce((sum, item) => sum + item.progress.speed, 0);
    return {
      bytesTotal,
      bytesUploaded,
      percentage: bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0,
      remainingTime: speed > 0 ? Math.ceil((bytesTotal - bytesUploaded) / speed) : 0,
      speed,
    };
  });

  function config(): ResolvedUploadOptions {
    const defined = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as LtUploadOptions;
    return {
      ...defined,
      autoStart: defined.autoStart ?? true,
      chunkSize: defined.chunkSize || filesOptions.tus.defaultChunkSize,
      endpoint: defined.endpoint || filesOptions.tus.defaultEndpoint,
      parallelUploads: Math.max(1, defined.parallelUploads || DEFAULT_PARALLEL_UPLOADS),
      retryDelays: defined.retryDelays ?? [...LT_TUS_RETRY_DELAYS],
    };
  }

  /** A relative endpoint is a path on the API (like auth and AI requests) unless `tus.resolveAgainstApi` is off. */
  function resolveEndpoint(endpoint: string): string {
    if (!endpoint || filesOptions.tus.resolveAgainstApi === false || isLtAbsoluteUrl(endpoint)) {
      return endpoint;
    }
    return api.buildUrl(endpoint.startsWith('/') ? endpoint : `/${endpoint}`);
  }

  function get(id: string): LtUploadItem | undefined {
    return items().find((item) => item.id === id);
  }

  function update(id: string, changes: Partial<LtUploadItem>): LtUploadItem | undefined {
    let updated: LtUploadItem | undefined;
    items.update((list) =>
      list.map((item) => {
        if (item.id !== id) {
          return item;
        }
        updated = { ...item, ...changes };
        return updated;
      }),
    );
    return updated;
  }

  function invalidate(id: string): void {
    generations.set(id, (generations.get(id) ?? 0) + 1);
  }

  function dequeue(id: string): void {
    const index = queue.indexOf(id);
    if (index >= 0) {
      queue.splice(index, 1);
    }
  }

  function uploadingCount(): number {
    return items().filter((item) => item.status === 'uploading').length;
  }

  /** Start queued uploads while slots are free. */
  function pump(): void {
    if (destroyed) {
      return;
    }
    const limit = config().parallelUploads;
    while (queue.length > 0 && uploadingCount() < limit) {
      const id = queue.shift() as string;
      const item = get(id);
      if (item && (item.status === 'idle' || item.status === 'paused')) {
        begin(id);
      }
    }
  }

  function enqueue(ids: string[]): void {
    for (const id of ids) {
      if (!queue.includes(id)) {
        queue.push(id);
      }
    }
    pump();
  }

  function begin(id: string): void {
    const item = get(id);
    const tusUpload = tusUploads.get(id);
    if (destroyed || !item || !tusUpload || item.status === 'uploading' || item.status === 'completed') {
      return;
    }
    dequeue(id);
    invalidate(id);
    const generation = generations.get(id);
    speedTrackers.get(id)?.reset(item.progress.bytesUploaded);
    update(id, { error: undefined, startedAt: new Date(), status: 'uploading' });

    const stillWanted = (): boolean => !destroyed && generations.get(id) === generation && get(id)?.status === 'uploading';
    // An upload that already has its URL continues there; a new one looks for an interrupted upload of the same file.
    const lookup: Promise<LtTusPreviousUpload[]> = tusUpload.url ? Promise.resolve([]) : tusUpload.findPreviousUploads().catch(() => []);
    void lookup.then((previousUploads) => {
      if (!stillWanted()) {
        return;
      }
      const previous = latest(previousUploads);
      if (previous) {
        tusUpload.resumeFromPreviousUpload(previous);
      }
      tusUpload.start();
    });
  }

  function settle(id: string): void {
    invalidate(id);
    pump();
  }

  function createTusUpload(client: Awaited<ReturnType<typeof loadClient>>, item: LtUploadItem, resolved: ResolvedUploadOptions): LtTusClientUpload {
    // Read in `onAfterResponse`, not from `onSuccess`'s payload: tus-js-client passes `{ lastResponse }` to `onSuccess`
    // only from 4.2.0, and the peer range starts at 4.0.0.
    let fileId: string | undefined;
    const callerSetsAuthorization = Object.keys(resolved.headers ?? {}).some((name) => name.toLowerCase() === 'authorization');

    const upload: LtTusClientUpload = new client.Upload(item.file, {
      chunkSize: resolved.chunkSize,
      endpoint: resolveEndpoint(resolved.endpoint),
      headers: resolved.headers,
      metadata: {
        filename: item.file.name,
        filetype: item.file.type,
        ...resolved.metadata,
        ...item.metadata,
      },
      onAfterResponse: (_req, res) => {
        // Only the completing response carries it; XHR answers `null` for a header that was not sent or not exposed.
        fileId = res.getHeader(LT_TUS_FILE_ID_HEADER) || fileId;
      },
      onBeforeRequest: (req: LtTusHttpRequest) => {
        const xhr = req.getUnderlyingObject() as { withCredentials?: boolean } | null;
        if (xhr && typeof xhr === 'object' && 'withCredentials' in xhr) {
          xhr.withCredentials = true;
        }
        if (!callerSetsAuthorization && authState.getAuthMode() === 'jwt') {
          const token = authState.getJwtToken();
          if (token) {
            req.setHeader('Authorization', `Bearer ${token}`);
          }
        }
      },
      onError: (error) => {
        const failed = update(item.id, { error: error.message, progress: { ...(get(item.id)?.progress ?? item.progress), remainingTime: 0, speed: 0 }, status: 'error' });
        settle(item.id);
        if (failed) {
          config().onError?.(failed, error);
        }
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const current = get(item.id);
        if (!current || current.status !== 'uploading') {
          return;
        }
        const speed = speedTrackers.get(item.id)?.sample(bytesUploaded) ?? 0;
        const progress: LtUploadProgress = {
          bytesTotal,
          bytesUploaded,
          percentage: bytesTotal > 0 ? Math.min(100, Math.round((bytesUploaded / bytesTotal) * 100)) : 0,
          remainingTime: speed > 0 ? Math.ceil((bytesTotal - bytesUploaded) / speed) : 0,
          speed,
        };
        const updated = update(item.id, { progress });
        if (updated) {
          config().onProgress?.(updated);
        }
      },
      onShouldRetry: (error) => {
        const status = error.originalResponse?.getStatus?.();
        // No retry on 4xx (except 429 Too Many Requests): the request itself is wrong or not allowed.
        return !(status && status >= 400 && status < 500 && status !== 429);
      },
      onSuccess: () => {
        const current = get(item.id);
        if (!current) {
          return;
        }
        const bytesTotal = current.progress.bytesTotal || item.file.size;
        const completed = update(item.id, {
          completedAt: new Date(),
          error: undefined,
          fileId,
          progress: { bytesTotal, bytesUploaded: bytesTotal, percentage: 100, remainingTime: 0, speed: 0 },
          status: 'completed',
          url: upload.url ?? undefined,
        });
        settle(item.id);
        if (completed) {
          config().onSuccess?.(completed);
        }
      },
      // Keep the fingerprint only for interrupted uploads: a completed one must not be "resumed" by the next upload of
      // the same file, which would finish without a request and therefore without an `X-File-Id`.
      removeFingerprintOnSuccess: true,
      retryDelays: resolved.retryDelays,
    });
    return upload;
  }

  async function addFiles(files: File | File[]): Promise<string[]> {
    const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
    if (list.length === 0) {
      return [];
    }
    const client = await loadClient();
    if (destroyed) {
      return [];
    }
    const resolved = config();
    const ids: string[] = [];
    for (const file of list) {
      const id = `upload_${Date.now().toString(36)}_${++sequence}_${Math.random().toString(36).slice(2, 8)}`;
      const item: LtUploadItem = { file, id, metadata: resolved.metadata, progress: idleProgress(file.size), status: 'idle' };
      tusUploads.set(id, createTusUpload(client, item, resolved));
      speedTrackers.set(id, new LtSpeedTracker());
      items.update((current) => [...current, item]);
      ids.push(id);
    }
    if (resolved.autoStart) {
      enqueue(ids);
    }
    return ids;
  }

  function startUpload(id: string): void {
    begin(id);
  }

  function startAll(): void {
    enqueue(
      items()
        .filter((item) => item.status === 'idle' || item.status === 'paused')
        .map((item) => item.id),
    );
  }

  function pauseUpload(id: string): void {
    const item = get(id);
    const tusUpload = tusUploads.get(id);
    if (!item || !tusUpload) {
      return;
    }
    if (item.status === 'uploading') {
      invalidate(id);
      void tusUpload.abort().catch(() => undefined);
      update(id, { progress: { ...item.progress, remainingTime: 0, speed: 0 }, status: 'paused' });
      pump();
    } else if (item.status === 'idle') {
      // A queued upload is taken out of the queue.
      dequeue(id);
      update(id, { status: 'paused' });
    }
  }

  function pauseAll(): void {
    items()
      .filter((item) => item.status === 'uploading')
      .forEach((item) => pauseUpload(item.id));
  }

  function resumeUpload(id: string): void {
    if (get(id)?.status === 'paused') {
      begin(id);
    }
  }

  function resumeAll(): void {
    enqueue(
      items()
        .filter((item) => item.status === 'paused')
        .map((item) => item.id),
    );
  }

  function cancelUpload(id: string): void {
    const tusUpload = tusUploads.get(id);
    invalidate(id);
    dequeue(id);
    if (tusUpload) {
      void tusUpload.abort().catch(() => undefined);
    }
    tusUploads.delete(id);
    speedTrackers.delete(id);
    generations.delete(id);
    items.update((list) => list.filter((item) => item.id !== id));
    pump();
  }

  function cancelAll(): void {
    items().forEach((item) => cancelUpload(item.id));
  }

  function removeUpload(id: string): void {
    cancelUpload(id);
  }

  function clearCompleted(): void {
    items()
      .filter((item) => item.status === 'completed')
      .forEach((item) => removeUpload(item.id));
  }

  function retryUpload(id: string): void {
    if (get(id)?.status === 'error') {
      update(id, { error: undefined, status: 'idle' });
      begin(id);
    }
  }

  inject(DestroyRef).onDestroy(() => {
    destroyed = true;
    queue.length = 0;
    for (const tusUpload of tusUploads.values()) {
      void tusUpload.abort().catch(() => undefined);
    }
  });

  return {
    addFiles,
    cancelAll,
    cancelUpload,
    clearCompleted,
    getUpload: get,
    isUploading,
    pauseAll,
    pauseUpload,
    removeUpload,
    resumeAll,
    resumeUpload,
    retryUpload,
    startAll,
    startUpload,
    totalProgress,
    uploads,
  };
}

function idleProgress(bytesTotal: number): LtUploadProgress {
  return { bytesTotal, bytesUploaded: 0, percentage: 0, remainingTime: 0, speed: 0 };
}

function latest(previousUploads: LtTusPreviousUpload[]): LtTusPreviousUpload | undefined {
  return [...previousUploads].sort((a, b) => Date.parse(b.creationTime ?? '') - Date.parse(a.creationTime ?? '') || 0)[0];
}
