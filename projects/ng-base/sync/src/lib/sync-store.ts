/**
 * IndexedDB storage of the offline sync (`injectLtOfflineSync`).
 *
 * ONE database per origin holds every synchronized model: records, the outbox of unsent changes,
 * and meta values (cursors, the owning user). One database is what makes sign-out safe — the
 * nest-server's `SECURITY.md` asks a client to delete every record, cursor and unsent change, and
 * deleting the whole database is the one operation that cannot miss a model.
 *
 * Every tab of the origin shares the database; IndexedDB serializes their read-write transactions.
 * A transaction stays open only while `fn` awaits requests of that same transaction, so nothing
 * inside `run()` may await anything else (a fetch, a timer, an app hook).
 */

import type { LtSyncRecord } from './sync-types';

/** Name of the database every model shares */
export const LT_SYNC_DB_NAME = 'lt-offline-sync';

/** BroadcastChannel the tabs of an origin use to tell each other about changes */
export const LT_SYNC_CHANNEL_NAME = 'lt-offline-sync';

const STORES = ['meta', 'outbox', 'records'];

/** An outbox entry: a protocol push item (§6.2) plus local bookkeeping */
export interface LtSyncOutboxItem {
  /** Set once a push carried the item; it is never changed again, a repeat must carry the same change (§6.5) */
  attempted?: boolean;
  baseVersion?: number;
  data?: Record<string, unknown>;
  id: string;
  mutationId: string;
  op: 'delete' | 'upsert';
  seq?: number;
}

/** What `run()` hands its callback: the transaction's operations, scoped to one model */
export interface LtSyncStoreTx {
  addOutbox: (item: LtSyncOutboxItem) => Promise<unknown>;
  /** Delete every local record of the model except `keepIds` */
  clearRecords: (keepIds: Set<string>) => Promise<void>;
  deleteMeta: (key: string) => Promise<unknown>;
  deleteRecord: (id: string) => Promise<unknown>;
  getMeta: <V = unknown>(key: string) => Promise<undefined | V>;
  getRecord: (id: string) => Promise<LtSyncRecord | undefined>;
  /** The model's unsent changes in the order they were made */
  listOutbox: () => Promise<LtSyncOutboxItem[]>;
  listRecords: () => Promise<LtSyncRecord[]>;
  putOutbox: (item: LtSyncOutboxItem) => Promise<unknown>;
  putRecord: (record: LtSyncRecord) => Promise<unknown>;
  removeOutbox: (mutationId: string) => Promise<void>;
  setMeta: (key: string, value: unknown) => Promise<unknown>;
}

const done = <R>(request: IDBRequest<R>): Promise<R> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });

let connection: IDBDatabase | undefined;
let opening: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return Promise.resolve(connection);
  opening ??= (async () => {
    const request = indexedDB.open(LT_SYNC_DB_NAME, 1);
    request.addEventListener('upgradeneeded', () => {
      const db = request.result;
      db.createObjectStore('records', { keyPath: ['model', 'id'] }).createIndex('model', 'model');
      const outbox = db.createObjectStore('outbox', { autoIncrement: true, keyPath: 'seq' });
      outbox.createIndex('mutationId', 'mutationId', { unique: true });
      outbox.createIndex('model', 'model');
      db.createObjectStore('meta', { keyPath: 'key' });
    });
    try {
      const db = await done(request);
      // Another tab deleting the database (sign-out, account switch) must not wait for this one
      db.addEventListener('versionchange', () => {
        db.close();
        if (connection === db) connection = undefined;
      });
      connection = db;
      return db;
    } finally {
      opening = undefined;
    }
  })();
  return opening;
}

/**
 * The data no longer belongs to the user a sync run started for: signed out (database deleted) or
 * another account claimed it. The run's write was refused, nothing of it was stored.
 */
export class LtSyncOwnerChangedError extends Error {
  constructor() {
    super('the local sync data changed owner');
    this.name = 'LtSyncOwnerChangedError';
  }
}

/**
 * Run `fn` in one read-write transaction over the scope's records, outbox and meta values. `scope`
 * is a model, or a model and tenant (`note#<tenantId>`).
 *
 * With `owner`, the transaction first checks that the data still belongs to that user and refuses
 * otherwise (`LtSyncOwnerChangedError`). A sync answer can arrive after sign-out deleted the
 * database, or after another account claimed it — in this tab or another one. Unfenced, it would
 * reopen the database and write the previous user's records for the next user to see.
 */
export async function runLtSyncTx<R>(model: string, fn: (tx: LtSyncStoreTx) => Promise<R>, options: { owner?: string } = {}): Promise<R> {
  const db = await openDatabase();
  const transaction = db.transaction(STORES, 'readwrite');
  const finished = new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('transaction aborted')));
    transaction.addEventListener('error', () => reject(transaction.error));
  });
  const store = (name: string) => transaction.objectStore(name);
  const strip = (stored: (LtSyncRecord & { model?: string }) | undefined): LtSyncRecord | undefined => {
    if (!stored) return undefined;
    const { model: _model, ...record } = stored;
    return record;
  };
  const tx: LtSyncStoreTx = {
    addOutbox: (item) => {
      const { seq: _seq, ...rest } = item;
      return done(store('outbox').add({ ...rest, model }));
    },
    clearRecords: async (keepIds) => {
      const keys = (await done(store('records').index('model').getAllKeys(model))) as [string, string][];
      for (const key of keys) {
        if (!keepIds.has(key[1])) await done(store('records').delete(key));
      }
    },
    deleteMeta: (key) => done(store('meta').delete(key)),
    deleteRecord: (id) => done(store('records').delete([model, id])),
    getMeta: async <V>(key: string) => ((await done(store('meta').get(key))) as undefined | { value: V })?.value,
    getRecord: async (id) => strip(await done(store('records').get([model, id]))),
    listOutbox: async () => {
      // An index lists equal keys in primary-key order, which is `seq`: the order the changes were made
      const items = (await done(store('outbox').index('model').getAll(model))) as (LtSyncOutboxItem & { model?: string })[];
      return items.map(({ model: _model, ...item }) => item);
    },
    listRecords: async () => ((await done(store('records').index('model').getAll(model))) as LtSyncRecord[]).map((record) => strip(record)!),
    putOutbox: (item) => done(store('outbox').put({ ...item, model })),
    putRecord: (record) => done(store('records').put({ ...record, model })),
    removeOutbox: async (mutationId) => {
      const key = await done(store('outbox').index('mutationId').getKey(mutationId));
      if (key !== undefined) await done(store('outbox').delete(key));
    },
    setMeta: (key, value) => done(store('meta').put({ key, value })),
  };
  let result: R;
  try {
    if (options.owner !== undefined && (await tx.getMeta<string>('owner')) !== options.owner) throw new LtSyncOwnerChangedError();
    result = await fn(tx);
  } catch (error) {
    transaction.abort();
    await finished.catch(() => undefined);
    throw error;
  }
  await finished;
  return result;
}

/** The scopes (model, or model and tenant) that hold unsent changes, in no particular order */
export async function listLtSyncPendingModels(): Promise<string[]> {
  const db = await openDatabase();
  const transaction = db.transaction(['outbox'], 'readonly');
  const items = (await done(transaction.objectStore('outbox').getAll())) as { model: string }[];
  return [...new Set(items.map((item) => item.model))];
}

/** The user the local data belongs to, if any */
export function getLtSyncOwner(): Promise<string | undefined> {
  return runLtSyncTx('', (tx) => tx.getMeta<string>('owner'));
}

/**
 * Bind the local data to the signed-in user, in ONE transaction. The same user keeps it. Anybody
 * else — another user, or nobody at all while data is present — means it is not this user's: every
 * model is wiped before anything is shown or pulled (nest-server `SECURITY.md`). Data without an
 * owner can only be a write that outlived a sign-out, which is exactly what must not be inherited.
 * Answers whether it wiped.
 */
export async function claimLtSyncOwner(userId: string): Promise<boolean> {
  const db = await openDatabase();
  const transaction = db.transaction(STORES, 'readwrite');
  const finished = new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('transaction aborted')));
    transaction.addEventListener('error', () => reject(transaction.error));
  });
  const meta = transaction.objectStore('meta');
  const owner = ((await done(meta.get('owner'))) as undefined | { value: string })?.value;
  let wiped = false;
  if (owner !== userId) {
    const held = (await done(transaction.objectStore('records').count())) + (await done(transaction.objectStore('outbox').count())) + (await done(meta.count()));
    if (held > 0) {
      for (const name of STORES) await done(transaction.objectStore(name).clear());
      wiped = true;
    }
    await done(meta.put({ key: 'owner', value: userId }));
  }
  await finished;
  if (wiped) postLtSyncMessage({ type: 'cleared' });
  return wiped;
}

/**
 * Delete every record, cursor and unsent change of every model — on sign-out. Other tabs close
 * their connection on `versionchange` and are told via the channel. A sync answer arriving later
 * finds no owner and is refused (`runLtSyncTx` with `owner`).
 */
export async function deleteLtSyncDatabase(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await opening?.catch(() => undefined);
  connection?.close();
  connection = undefined;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LT_SYNC_DB_NAME);
    request.addEventListener('success', () => resolve());
    request.addEventListener('error', () => reject(request.error));
    // A tab that ignores `versionchange` would block forever; the delete completes once it closes
    request.addEventListener('blocked', () => undefined);
  });
  postLtSyncMessage({ type: 'cleared' });
}

/** Messages the tabs exchange */
export type LtSyncMessage = { scope: string; type: 'changed' } | { type: 'cleared' };

/**
 * Tell every listener of this origin, this tab's included (a fresh channel is not the receiver's
 * own); a no-op where BroadcastChannel is missing
 */
function postLtSyncMessage(message: LtSyncMessage): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(LT_SYNC_CHANNEL_NAME);
  try {
    channel.postMessage(message);
  } finally {
    channel.close();
  }
}
