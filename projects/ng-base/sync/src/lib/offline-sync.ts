import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { assertInInjectionContext, DestroyRef, effect, inject, PLATFORM_ID, signal, untracked } from '@angular/core';
import { LtAuthStore } from '@lenne.tech/ng-base/auth/provide';

import { createLtSyncEngine } from './sync-engine';
import { subscribeLtSyncHints } from './sync-hints';
import { claimLtSyncOwner, LT_SYNC_CHANNEL_NAME, type LtSyncMessage } from './sync-store';
import type { LtOfflineSyncOptions, LtOfflineSyncState, LtSyncPushResult, LtSyncRecord, LtSyncResult } from './sync-types';

/** Offline-synchronised records of one model, created by {@link injectLtOfflineSync}. */
export type LtOfflineSync<T = Record<string, unknown>> = LtOfflineSyncState<T>;

/** First wait after a failed sync (offline, 429, 503, `retry`); doubles up to the maximum (§11) */
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 60_000;

/** A local change syncs this long after the last one, so typing does not push every keystroke */
const LOCAL_CHANGE_DELAY_MS = 300;

const emptyResult = (overrides: Partial<LtSyncResult> = {}): LtSyncResult => ({
  applied: 0,
  conflicts: [],
  forbidden: false,
  needsLogin: false,
  offline: false,
  rejected: [],
  resynced: false,
  retried: 0,
  ...overrides,
});

/**
 * Offline-first records of one model (counterpart of `useLtOfflineSync()`), bound to the current injection context.
 *
 * Records live in IndexedDB; changes made offline wait in an outbox and go out with the next sync.
 * Triggers: start, `online`, window focus, `visibilitychange` (a hidden tab closes the hint stream), a server hint
 * and every reconnect of the hint stream (protocol §9), 300 ms after a local change; backoff 1 s → 60 s. Tabs
 * coordinate: one syncs at a time (Web Locks), the others pick up the result (BroadcastChannel); without either API
 * it stays correct, only busier.
 *
 * The local data belongs to the signed-in user (`LtAuthStore.user()`, the same signal as `LtAuthService.user()`). A user change re-claims ownership of the
 * local database: another user's data is wiped before anything is shown or pulled. `signOut()` (`LtAuthService` / `LtAuthStore`) sends
 * what is unsent and then deletes it (hook of `provideLtSync()`). An expired session deletes nothing: after signing
 * in again the outbox goes out without duplicates (protocol §4).
 *
 * During SSR or without IndexedDB it is an inert stub (empty records, mutations reject). Without a signed-in user
 * `records` is empty and mutations throw. Everything stops when the injection context is destroyed.
 * Requires `provideLtSync()` and `provideLtAuth()`.
 *
 * @example
 * ```ts
 * export class NotesPage {
 *   protected readonly notes = injectLtOfflineSync<{ title: string }>('note');
 *
 *   add(title: string) {
 *     return this.notes.create({ title });
 *   }
 * }
 * // template: @for (note of notes.records(); track note.id) { … } · notes.pendingCount() · notes.offline()
 * ```
 */
export function injectLtOfflineSync<T extends Record<string, unknown> = Record<string, unknown>>(model: string, options: LtOfflineSyncOptions<T> = {}): LtOfflineSync<T> {
  assertInInjectionContext(injectLtOfflineSync);

  const records = signal<readonly LtSyncRecord<T>[]>([]);
  const pendingCount = signal(0);
  const offline = signal(false);
  const syncing = signal(false);
  const needsLogin = signal(false);
  const forbidden = signal(false);
  const conflicts = signal<LtSyncPushResult[]>([]);
  const rejected = signal<LtSyncPushResult[]>([]);
  const error = signal<Error | null>(null);
  const lastSyncedAt = signal<Date | null>(null);

  const state = {
    conflicts: conflicts.asReadonly(),
    error: error.asReadonly(),
    forbidden: forbidden.asReadonly(),
    lastSyncedAt: lastSyncedAt.asReadonly(),
    needsLogin: needsLogin.asReadonly(),
    offline: offline.asReadonly(),
    pendingCount: pendingCount.asReadonly(),
    records: records.asReadonly(),
    rejected: rejected.asReadonly(),
    syncing: syncing.asReadonly(),
  };

  // IndexedDB exists only in the browser: on the server the records render as an empty list
  if (!isPlatformBrowser(inject(PLATFORM_ID)) || typeof indexedDB === 'undefined') {
    const browserOnly = () => Promise.reject(new Error('injectLtOfflineSync: offline sync runs in the browser only'));
    return { ...state, create: browserOnly, get: async () => undefined, remove: browserOnly, sync: async () => emptyResult(), update: browserOnly };
  }

  const auth = inject(LtAuthStore);
  const destroyRef = inject(DestroyRef);
  const doc = inject(DOCUMENT);
  const win = doc.defaultView;
  const auto = options.auto !== false;
  const engine = createLtSyncEngine<T>({ idFormat: options.idFormat, model, onConflict: options.onConflict, pageLimit: options.pageLimit, tenantId: options.tenantId });
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(LT_SYNC_CHANNEL_NAME);

  // --- owner: the local data belongs to the signed-in user ----------------------------------------

  let ownerId: null | string = null;
  let claiming: null | { id: string; done: Promise<boolean> } = null;
  const currentUserId = () => {
    const id = auth.user()?.id;
    return id ? String(id) : null;
  };

  /** Whether a signed-in user owns the local data; claims it first, wiping another user's (account switch) */
  async function ensureOwner(): Promise<boolean> {
    const id = currentUserId();
    if (!id) {
      ownerId = null;
      return false;
    }
    if (id === ownerId) {
      return true;
    }
    // A claim is per user: one still running for the previous user must not answer for this one
    if (claiming?.id !== id) {
      const pending = { done: claimLtSyncOwner(id), id };
      claiming = pending;
      void pending.done.finally(() => {
        if (claiming === pending) {
          claiming = null;
        }
      });
    }
    await claiming.done;
    // The user changed while the claim ran: claim for the one signed in now, never show the data to them as the other's
    if (currentUserId() !== id) {
      return ensureOwner();
    }
    ownerId = id;
    return true;
  }

  async function refresh(): Promise<void> {
    if (!(await ensureOwner())) {
      records.set([]);
      pendingCount.set(0);
      return;
    }
    const [list, pending] = await Promise.all([engine.list(), engine.pendingCount()]);
    records.set(list);
    pendingCount.set(pending);
  }

  async function owned<R>(fn: () => Promise<R>): Promise<R> {
    if (!(await ensureOwner())) {
      throw new Error('injectLtOfflineSync: no signed-in user owns the local data');
    }
    return fn();
  }

  // --- sync ---------------------------------------------------------------------------------------

  let timer: ReturnType<typeof setTimeout> | undefined;
  let backoffMs = 0;
  let disposed = false;
  let closeHints: (() => void) | undefined;
  /** Why the hint stream stopped: `disabled` for good (404), `unauthorized` until a sync gets through */
  let hintsStopped: 'disabled' | 'unauthorized' | null = null;

  /**
   * Tell the other tabs and instances that this scope changed. A destroyed instance has closed its channel (posting on
   * it would throw), so a sync still finishing after the destroy announces through a short-lived one.
   */
  function announce(): void {
    const message = { scope: engine.scope, type: 'changed' } satisfies LtSyncMessage;
    if (!disposed) {
      channel?.postMessage(message);
      return;
    }
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }
    const once = new BroadcastChannel(LT_SYNC_CHANNEL_NAME);
    try {
      once.postMessage(message);
    } finally {
      once.close();
    }
  }

  function schedule(ms: number): void {
    if (disposed) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void sync().catch(() => undefined), ms);
  }

  /** Wait longer after every failure, as long as the server asks or cannot be reached (§11) */
  function backOff(retryAfterMs = 0): void {
    backoffMs = Math.min(backoffMs ? backoffMs * 2 : BACKOFF_START_MS, BACKOFF_MAX_MS);
    // While the browser knows it is offline, its `online` event is the trigger, not a timer
    if (auto && win?.navigator.onLine !== false) {
      schedule(Math.max(retryAfterMs, backoffMs));
    }
  }

  async function sync(): Promise<LtSyncResult> {
    if (!(await ensureOwner())) {
      needsLogin.set(true);
      return emptyResult({ needsLogin: true });
    }
    syncing.set(true);
    try {
      const result = await engine.sync();
      error.set(null);
      offline.set(result.offline);
      needsLogin.set(result.needsLogin);
      forbidden.set(result.forbidden);
      conflicts.set(result.conflicts);
      rejected.set(result.rejected);
      if (result.offline || result.retryAfterMs !== undefined || result.retried) {
        backOff(result.retryAfterMs);
      } else if (!result.needsLogin) {
        backoffMs = 0;
        lastSyncedAt.set(new Date());
        // The stream stopped on a 401; a sync that got through means the user is back
        if (hintsStopped === 'unauthorized') {
          hintsStopped = null;
          startHints();
        }
      }
      return result;
    } catch (caught) {
      error.set(caught instanceof Error ? caught : new Error(String(caught)));
      throw caught;
    } finally {
      syncing.set(false);
      await refresh();
      announce();
    }
  }

  const autoSync = () => {
    if (auto) {
      void sync().catch(() => undefined);
    }
  };

  async function afterLocalChange(): Promise<void> {
    announce();
    await refresh();
    if (auto) {
      schedule(LOCAL_CHANGE_DELAY_MS);
    }
  }

  // --- hints (§9) ---------------------------------------------------------------------------------

  function startHints(): void {
    if (!auto || options.hints === false || closeHints || hintsStopped || disposed) {
      return;
    }
    if (doc.visibilityState === 'hidden' || !auth.user()?.id) {
      return;
    }
    // One stream per tab and tenant, shared by every instance (see `subscribeLtSyncHints`)
    closeHints = subscribeLtSyncHints({
      model,
      // Hints sent while the stream was down are not replayed: every (re)connect pulls once
      onConnect: autoSync,
      onHint: autoSync,
      onStop: (reason) => {
        stopHints();
        hintsStopped = reason;
      },
      tenantId: options.tenantId,
    });
  }

  function stopHints(): void {
    closeHints?.();
    closeHints = undefined;
  }

  // --- triggers -----------------------------------------------------------------------------------

  const onOnline = () => {
    offline.set(false);
    backoffMs = 0;
    autoSync();
  };
  const onOffline = () => {
    offline.set(true);
  };
  const onVisibility = () => {
    // A hidden tab keeps no stream open; coming back, the reconnect pulls
    if (doc.visibilityState === 'hidden') {
      stopHints();
      return;
    }
    startHints();
    autoSync();
  };
  const onMessage = (event: MessageEvent<LtSyncMessage>) => {
    if (event.data?.type === 'cleared') {
      // Signed out or another account in some tab: the database is gone, claim it anew
      ownerId = null;
      void refresh();
    } else if (event.data?.type === 'changed' && event.data.scope === engine.scope) {
      void refresh();
    }
  };

  win?.addEventListener('online', onOnline);
  win?.addEventListener('offline', onOffline);
  win?.addEventListener('focus', autoSync);
  doc.addEventListener('visibilitychange', onVisibility);
  if (win?.navigator.onLine === false) {
    offline.set(true);
  }
  channel?.addEventListener('message', onMessage);

  // A user change (sign-in, sign-out, account switch) re-claims the local data before anything is shown or pulled
  let watchedUserId = auth.user()?.id ?? null;
  const userWatch = effect(() => {
    const id = auth.user()?.id ?? null;
    untracked(() => {
      if (id === watchedUserId) {
        return;
      }
      watchedUserId = id;
      stopHints();
      hintsStopped = hintsStopped === 'disabled' ? 'disabled' : null;
      void refresh().then(() => {
        if (!id) {
          return;
        }
        startHints();
        autoSync();
      });
    });
  });

  destroyRef.onDestroy(() => {
    disposed = true;
    clearTimeout(timer);
    stopHints();
    userWatch.destroy();
    channel?.removeEventListener('message', onMessage);
    channel?.close();
    win?.removeEventListener('online', onOnline);
    win?.removeEventListener('offline', onOffline);
    win?.removeEventListener('focus', autoSync);
    doc.removeEventListener('visibilitychange', onVisibility);
  });

  // Start: show what is local, then sync and listen for hints
  void refresh().then(() => {
    startHints();
    autoSync();
  });

  return {
    ...state,
    async create(data) {
      const record = await owned(() => engine.create(data));
      await afterLocalChange();
      return record;
    },
    async get(id) {
      return (await ensureOwner()) ? engine.get(id) : undefined;
    },
    async remove(id) {
      await owned(() => engine.remove(id));
      await afterLocalChange();
    },
    sync,
    async update(id, data) {
      const record = await owned(() => engine.update(id, data));
      await afterLocalChange();
      return record;
    },
  };
}
