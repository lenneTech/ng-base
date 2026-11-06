/*
 * Public API of `@lenne.tech/ng-base/sync`: offline-first sync with the nest-server sync module (IndexedDB store,
 * outbox, push/pull protocol engine, SSE hint stream, BroadcastChannel, Web Locks) and its signal facade.
 */
export { injectLtOfflineSync } from './lib/offline-sync';
export type { LtOfflineSync } from './lib/offline-sync';
export { LT_SYNC_OPTIONS, provideLtSync } from './lib/provide-lt-sync';
export {
  LtSyncOfflineError,
  LtSyncUnauthorizedError,
  LtSyncBackoffError,
  ltSyncObjectId,
  ltSyncUuidV7,
  configureLtSync,
  getLtSyncBasePath,
  buildLtSyncUrl,
  ltSyncFetch,
  ltSyncScope,
  createLtSyncEngine,
  flushLtSyncBeforeSignOut,
  resetLtSyncEngines,
} from './lib/sync-engine';
export type { LtSyncEngine, LtSyncEngineOptions, LtSyncEnvironment } from './lib/sync-engine';
export { openLtSyncHints, subscribeLtSyncHints } from './lib/sync-hints';
export type { LtSyncHintsOptions, LtSyncHintSubscriber } from './lib/sync-hints';
export {
  LT_SYNC_DB_NAME,
  LT_SYNC_CHANNEL_NAME,
  LtSyncOwnerChangedError,
  runLtSyncTx,
  listLtSyncPendingModels,
  getLtSyncOwner,
  claimLtSyncOwner,
  deleteLtSyncDatabase,
} from './lib/sync-store';
export type { LtSyncMessage, LtSyncOutboxItem, LtSyncStoreTx } from './lib/sync-store';
export type {
  LtSyncIdFormat,
  LtSyncRecord,
  LtSyncItemStatus,
  LtSyncPushResult,
  LtSyncConflict,
  LtSyncConflictResolution,
  LtSyncResult,
  LtSyncOptions,
  LtOfflineSyncOptions,
  LtOfflineSyncState,
} from './lib/sync-types';
