import type { Signal } from '@angular/core';

// =============================================================================
// Offline Sync Types
// =============================================================================
// The protocol is `docs/offline-sync-protocol.md` in @lenne.tech/nest-server (>= 12.2.0);
// section numbers below (§n) point into it.

/** The id format a sync model declares (§3). One per model, never mixed. */
export type LtSyncIdFormat = 'objectId' | 'uuidv7';

/**
 * A record as the device holds it. `version` 0 means "created here, not on the server yet";
 * a tombstone has `deletedAt` set and no `data`.
 */
export interface LtSyncRecord<T = Record<string, unknown>> {
  data?: T;
  deletedAt: null | string;
  id: string;
  updatedAt: null | string;
  version: number;
}

/** Status of one pushed change (§7) */
export type LtSyncItemStatus = 'applied' | 'conflict' | 'merged' | 'not_found' | 'rejected' | 'retry';

/** One result of a push, in the order the changes were sent (§6.6) */
export interface LtSyncPushResult {
  /** Reason of a `rejected` change, e.g. `VALIDATION_FAILED`, `FORBIDDEN`, `ID_UNAVAILABLE` */
  code?: string;
  details?: unknown;
  id: string;
  mutationId: string;
  /** The server's record on `conflict` and `merged` (a tombstone when it was deleted) */
  record?: { data?: Record<string, unknown>; deletedAt?: null | string; id: string; updatedAt?: null | string; version: number };
  status: LtSyncItemStatus;
  version?: number;
}

/** What `onConflict` receives when the server did not apply a local change */
export interface LtSyncConflict<T = Record<string, unknown>> {
  /** The local change the server refused */
  change: { data?: Partial<T>; op: 'delete' | 'upsert' };
  /** The local record as it was before the conflict was resolved */
  local: LtSyncRecord<T> | undefined;
  /** The server's current record; a tombstone (`deletedAt` set) when it was deleted there */
  server: LtSyncRecord<T>;
}

/**
 * The answer of `onConflict`: keep the server's state (`'server'`), or send `data` again on top
 * of it. A record the server deleted stays deleted: an upsert on a tombstone is a conflict again (§6.3).
 */
export type LtSyncConflictResolution<T = Record<string, unknown>> = 'server' | { data: Partial<T> };

/** Outcome of one sync run */
export interface LtSyncResult {
  applied: number;
  /** Conflicts of this run, after `onConflict` (or the server-wins default) resolved them */
  conflicts: LtSyncPushResult[];
  /** The caller may no longer pull the model (403): its local records and cursor are gone */
  forbidden: boolean;
  /** The server answered 401: sign in again. Nothing was applied, nothing was discarded (§4) */
  needsLogin: boolean;
  /** The server could not be reached */
  offline: boolean;
  rejected: LtSyncPushResult[];
  /** A `410` made the client drop its local records and pull everything again (§8) */
  resynced: boolean;
  /** Changes the server answered `retry`; they go out again with the next sync */
  retried: number;
  /** The server asked to slow down (429 / 503): milliseconds until the next attempt */
  retryAfterMs?: number;
}

/** Options of `provideLtSync()` (runtime override `NG_PUBLIC_LT_SYNC_BASE_PATH`) */
export interface LtSyncOptions {
  /** Sync base path (default: '/sync' — must match the nest-server sync module) */
  basePath?: string;
}

/** Options of `injectLtOfflineSync()` */
export interface LtOfflineSyncOptions<T = Record<string, unknown>> {
  /** Sync on start, on `online`, on focus and after a hint (default: true). `false` leaves it to `sync()` */
  auto?: boolean;
  /** Listen for the server's hints (`GET <basePath>/hints`, §9) while the tab is visible (default: true) */
  hints?: boolean;
  /** The id format the model declares (default: 'objectId') */
  idFormat?: LtSyncIdFormat;
  /** Resolve a conflict yourself; without it the server's state wins */
  onConflict?: (conflict: LtSyncConflict<T>) => LtSyncConflictResolution<T> | Promise<LtSyncConflictResolution<T>>;
  /** Records per pull page (default: 200; the server caps it, 1000 at most) */
  pageLimit?: number;
  /** Restrict pull and push to one tenant (`X-Tenant-Id`, §4); records and unsent changes are kept per tenant */
  tenantId?: string;
}

/** What `injectLtOfflineSync()` returns */
export interface LtOfflineSyncState<T = Record<string, unknown>> {
  /** Conflicts of the last sync, after they were resolved */
  conflicts: Signal<LtSyncPushResult[]>;
  /** Create a record with a client id (§3); it waits in the outbox until a sync sends it */
  create: (data: T) => Promise<LtSyncRecord<T>>;
  /** The last unexpected error (not offline, not 401) */
  error: Signal<Error | null>;
  /** The caller may no longer pull this model (403). Unsent changes cannot be pushed under this account */
  forbidden: Signal<boolean>;
  /** One local record, a tombstone included */
  get: (id: string) => Promise<LtSyncRecord<T> | undefined>;
  /** Time of the last sync that reached the server */
  lastSyncedAt: Signal<Date | null>;
  /** The server answered 401. Nothing was discarded; the next sync after signing in sends everything */
  needsLogin: Signal<boolean>;
  /** The browser is offline, or the last request could not reach the server */
  offline: Signal<boolean>;
  /** Unsent local changes of this model */
  pendingCount: Signal<number>;
  /** The live local records, sorted by id. Empty while no user is signed in */
  records: Signal<readonly LtSyncRecord<T>[]>;
  /** Changes the server rejected in the last sync; they are dropped and the record returns to the server's state (§7) */
  rejected: Signal<LtSyncPushResult[]>;
  /** Delete a record: a tombstone on the server (a hard delete is not reachable through sync) */
  remove: (id: string) => Promise<void>;
  /** Push the outbox, then pull until the server has nothing more */
  sync: () => Promise<LtSyncResult>;
  /** A sync of this model is running in this tab */
  syncing: Signal<boolean>;
  /** Change fields of a record */
  update: (id: string, data: Partial<T>) => Promise<LtSyncRecord<T>>;
}
