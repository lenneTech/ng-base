/**
 * Offline-sync client of the nest-server sync module (>= 12.2.0).
 *
 * The protocol is `docs/offline-sync-protocol.md` in @lenne.tech/nest-server; section numbers (§n)
 * below point into it. This file is the protocol engine without Angular: local changes into the outbox,
 * push, pull, conflicts, resync. `injectLtOfflineSync()` adds signals, triggers and tab
 * coordination on top. Ported from the nest-server's reference test client
 * (`tests/clients/sync-client.mjs`), which passes the protocol's browser and Node scenarios.
 *
 * A local record is `{ id, version, updatedAt, deletedAt, data }`; `version` 0 means "created
 * here, not on the server yet". The outbox holds the unsent changes in the order they were made.
 * An item a push has carried (`attempted`) is never changed again: the server may have recorded it
 * under its mutation id, and a repeat must carry the same change (§6.2, §6.5). A later edit
 * becomes an item of its own.
 */

import type { LtSyncConflict, LtSyncConflictResolution, LtSyncIdFormat, LtSyncPushResult, LtSyncRecord, LtSyncResult } from './sync-types';
import { getLtSyncOwner, listLtSyncPendingModels, LtSyncOwnerChangedError, type LtSyncOutboxItem, type LtSyncStoreTx, runLtSyncTx } from './sync-store';

/** Push at most this many items per request: the server's default `maxPushItems` (§4) */
const PUSH_CHUNK = 100;

/** A push answering `conflict` on every round (a racing writer, a hook that keeps resending) stops here */
const MAX_PUSH_ROUNDS = 50;

/** The request could not reach the server */
export class LtSyncOfflineError extends Error {
  constructor(cause: unknown) {
    super(`offline: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'LtSyncOfflineError';
  }
}

/** The server answered 401: the session ended. Nothing was applied, nothing is discarded (§4) */
export class LtSyncUnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'LtSyncUnauthorizedError';
  }
}

/** The server asked to slow down: 429 with `Retry-After`, or 503 (§10) */
export class LtSyncBackoffError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | undefined,
  ) {
    super(`server answered ${status}`);
    this.name = 'LtSyncBackoffError';
  }
}

// --- ids ------------------------------------------------------------------------------------------

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * An ObjectId-hex id with the random tail §3 requires: 4 timestamp bytes plus 8 bytes from a secure
 * source, fresh for every id. A driver's default ObjectId would make the next id predictable.
 */
export function ltSyncObjectId(): string {
  const random = new Uint8Array(8);
  globalThis.crypto.getRandomValues(random);
  return (
    Math.floor(Date.now() / 1000)
      .toString(16)
      .padStart(8, '0') + hex(random)
  );
}

/** A uuidv7: 48 bits of milliseconds, version 7, the variant, the rest random (`crypto.randomUUID()` is v4) */
export function ltSyncUuidV7(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let time = Date.now();
  for (let index = 5; index >= 0; index--) {
    bytes[index] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const value = hex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

// --- urls -----------------------------------------------------------------------------------------

/**
 * Environment of the engine, set by `provideLtSync()` from DI (API URL builder, sync base path, the auth-aware
 * `LT_FETCH`). The engine itself stays framework-free; tests call {@link configureLtSync} directly.
 */
export interface LtSyncEnvironment {
  /** Sync base path (default `/sync`). */
  basePath: string;
  /** Build a full API URL for a path (`LtApiUrlService.buildUrl`). */
  buildApiUrl: (path: string) => string;
  /** `fetch` for every request (the auth-aware `LT_FETCH`: cookie or JWT like every other request). */
  fetch: (input: string, init: RequestInit) => Promise<Response>;
}

let environment: LtSyncEnvironment = {
  basePath: '/sync',
  buildApiUrl: (path) => path,
  fetch: (input, init) => fetch(input, { credentials: 'include', ...init }),
};

/** Set the engine environment (done by `provideLtSync()`). */
export function configureLtSync(env: Partial<LtSyncEnvironment>): void {
  environment = { ...environment, ...env };
}

/** The sync base path (default `/sync`) */
export function getLtSyncBasePath(): string {
  return environment.basePath || '/sync';
}

/** A full URL for a sync path, e.g. `/note?limit=200` or `/hints?models=note` */
export function buildLtSyncUrl(path: string): string {
  return environment.buildApiUrl(`${getLtSyncBasePath()}${path}`);
}

/** The configured fetch (auth-aware once `provideLtSync()` ran). */
export function ltSyncFetch(input: string, init: RequestInit): Promise<Response> {
  return environment.fetch(input, init);
}

/** Milliseconds a `Retry-After` header asks for: seconds or an HTTP date */
function retryAfterMs(value: null | string): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

// --- engine ---------------------------------------------------------------------------------------

/** Options of the protocol engine */
export interface LtSyncEngineOptions<T> {
  /** `fetch` for the requests (default: the auth-aware `LT_FETCH` set by `provideLtSync()`) */
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  idFormat?: LtSyncIdFormat;
  /** The model's name under the sync base path */
  model: string;
  onConflict?: (conflict: LtSyncConflict<T>) => LtSyncConflictResolution<T> | Promise<LtSyncConflictResolution<T>>;
  pageLimit?: number;
  tenantId?: string;
}

/** The protocol engine of one model */
export interface LtSyncEngine<T> {
  create: (data: T) => Promise<LtSyncRecord<T>>;
  get: (id: string) => Promise<LtSyncRecord<T> | undefined>;
  /** The live local records, sorted by id */
  list: () => Promise<LtSyncRecord<T>[]>;
  readonly model: string;
  /** Where the engine keeps its data: the model, or the model and the tenant */
  readonly scope: string;
  pendingCount: () => Promise<number>;
  /** Push the outbox only — the sign-out flush. Never throws */
  pushPending: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Push the outbox, then pull until `hasMore` is false. Never throws for offline, 401 or a backoff */
  sync: () => Promise<LtSyncResult>;
  update: (id: string, data: Partial<T>) => Promise<LtSyncRecord<T>>;
}

/** The engines of this tab by scope, so the sign-out flush pushes with the options the app gave */
const engines = new Map<string, LtSyncEngine<any>>();

/**
 * Where a model's local data lives: per model, and per tenant when one is given. A change made
 * under one tenant must never go out with another tenant's `X-Tenant-Id` — the server stamps a
 * create into the tenant of the header — nor show in that tenant's list.
 */
export function ltSyncScope(model: string, tenantId?: string): string {
  return tenantId ? `${model}#${tenantId}` : model;
}

/** The model and tenant of a scope (`ltSyncScope` in reverse) */
function parseLtSyncScope(scope: string): { model: string; tenantId?: string } {
  const at = scope.indexOf('#');
  return at === -1 ? { model: scope } : { model: scope.slice(0, at), tenantId: scope.slice(at + 1) };
}

/** A pulled item or a server record as a local record */
function localOf(item: NonNullable<LtSyncPushResult['record']>): LtSyncRecord {
  return {
    data: item.deletedAt ? undefined : item.data,
    deletedAt: item.deletedAt ?? null,
    id: item.id,
    updatedAt: item.updatedAt ?? null,
    version: item.version,
  };
}

/** The last queued change of a record */
function lastPending(outbox: LtSyncOutboxItem[], id: string): LtSyncOutboxItem | undefined {
  return outbox.filter((item) => item.id === id).at(-1);
}

/**
 * The `baseVersion` of a new change: the version the change before it produces (§6.2) — the
 * stored version, or one more than a change already on its way.
 */
function nextBase(record: LtSyncRecord, pending: LtSyncOutboxItem | undefined): number {
  return pending ? (pending.baseVersion ?? 0) + 1 : record.version;
}

/** The item as the protocol takes it, without the local bookkeeping */
function pushItem(item: LtSyncOutboxItem): Record<string, unknown> {
  const { baseVersion, data, id, mutationId, op } = item;
  return { ...(baseVersion === undefined ? {} : { baseVersion }), ...(data === undefined ? {} : { data }), id, mutationId, op };
}

function emptyResult(): LtSyncResult {
  return { applied: 0, conflicts: [], forbidden: false, needsLogin: false, offline: false, rejected: [], resynced: false, retried: 0 };
}

/** Create the protocol engine of one model and register it for the sign-out flush */
export function createLtSyncEngine<T extends Record<string, unknown> = Record<string, unknown>>(options: LtSyncEngineOptions<T>): LtSyncEngine<T> {
  const { idFormat = 'objectId', model, onConflict, pageLimit = 200, tenantId } = options;
  const fetchImpl = options.fetch ?? ltSyncFetch;
  const scope = ltSyncScope(model, tenantId);
  const cursorKey = `cursor:${scope}`;
  const run = <R>(fn: (tx: LtSyncStoreTx) => Promise<R>) => runLtSyncTx(scope, fn);
  /**
   * A write of a sync run, refused once the data no longer belongs to the user the run started for.
   * Its answers can arrive after sign-out deleted the database or another account claimed it.
   */
  const runAs = <R>(owner: string | undefined, fn: (tx: LtSyncStoreTx) => Promise<R>) => runLtSyncTx(scope, fn, owner === undefined ? {} : { owner });
  const newId = () => (idFormat === 'uuidv7' ? ltSyncUuidV7() : ltSyncObjectId());

  /** One request; answers `{ status, body }`, throws offline, 401 and backoff */
  async function request(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<{ body: any; status: number }> {
    const headers: Record<string, string> = { accept: 'application/json' };
    // Required of every push (§4): it forces the CORS preflight that guards cookie writes
    if (payload !== undefined) headers['content-type'] = 'application/json';
    if (tenantId) headers['x-tenant-id'] = tenantId;
    let response: Response;
    try {
      response = await fetchImpl(buildLtSyncUrl(path), { body: payload === undefined ? undefined : JSON.stringify(payload), headers, method });
    } catch (error) {
      throw new LtSyncOfflineError(error);
    }
    if (response.status === 401) throw new LtSyncUnauthorizedError();
    if (response.status === 429 || response.status === 503) throw new LtSyncBackoffError(response.status, retryAfterMs(response.headers.get('retry-after')));
    const text = await response.text();
    let body: any;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    if (response.status === 410 || (response.status === 403 && method === 'GET')) return { body, status: response.status };
    if (!response.ok) {
      const error = new Error(`${method} ${getLtSyncBasePath()}${path} answered ${response.status}: ${text.slice(0, 300)}`) as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    return { body, status: response.status };
  }

  /** Act on one item's result (§7) */
  async function settle(
    tx: LtSyncStoreTx,
    item: LtSyncOutboxItem,
    outcome: LtSyncPushResult | undefined,
    result: LtSyncResult,
    resolution: LtSyncConflictResolution<T>,
  ): Promise<void> {
    const status = outcome?.status;
    if (status === 'retry' || !status) {
      // The same change is still in progress elsewhere (a second tab), or the server had a transient
      // problem: it stays queued, unchanged, and goes out again with the next sync
      result.retried++;
      return;
    }
    await tx.removeOutbox(item.mutationId);
    const record = await tx.getRecord(item.id);
    if (status === 'applied') {
      result.applied++;
      if (item.op === 'delete') {
        await tx.deleteRecord(item.id);
      } else if (record && (record.version ?? 0) < (outcome.version ?? 0)) {
        await tx.putRecord({ ...record, version: outcome.version! });
      }
      return;
    }
    const later = (await tx.listOutbox()).filter((entry) => entry.id === item.id);
    if (status === 'merged' && outcome.record) {
      result.applied++;
      // The merged record is the server's; edits still waiting behind this change stay visible
      const pendingData = later.filter((entry) => entry.op === 'upsert').reduce((data, entry) => ({ ...data, ...entry.data }), {});
      const merged = localOf(outcome.record);
      await tx.putRecord(merged.deletedAt ? merged : { ...merged, data: { ...merged.data, ...pendingData } });
      return;
    }
    if (status === 'conflict') {
      result.conflicts.push(outcome);
      // Later changes of the record were based on the refused one, so they go too
      for (const entry of later) await tx.removeOutbox(entry.mutationId);
      if (!outcome.record || outcome.record.deletedAt) {
        await tx.deleteRecord(item.id);
        return;
      }
      const server = localOf(outcome.record);
      if (resolution === 'server') {
        await tx.putRecord(server);
        return;
      }
      // The app's answer goes out on top of the server's state (§7: push again with baseVersion = record.version)
      await tx.putRecord({ ...server, data: { ...server.data, ...resolution.data } });
      await tx.addOutbox({ baseVersion: server.version, data: resolution.data as Record<string, unknown>, id: item.id, mutationId: ltSyncUuidV7(), op: 'upsert' });
      return;
    }
    // Not stored, and never will be: the changes queued behind it carry a `baseVersion` that assumed
    // it was applied. Sent on their own they could meet another writer's version with that very
    // number and be applied on top of it (protocol §11 since nest-server 12.3.0), so they go too
    for (const entry of later) await tx.removeOutbox(entry.mutationId);
    if (status === 'not_found') {
      await tx.deleteRecord(item.id);
      return;
    }
    // rejected: retrying the same change will not help; a record the server never had goes with it
    result.rejected.push(outcome);
    if (record && !record.version) {
      await tx.deleteRecord(item.id);
    } else if (record) {
      // The device shows the refused change. The server's record did not change, so no delta would
      // ever bring it back: drop the cursor, and the pull right after this push restores it
      await tx.deleteMeta(cursorKey);
    }
  }

  /** The app's conflict answer, asked outside any transaction (an IndexedDB transaction does not survive an awaited hook) */
  async function resolveConflict(item: LtSyncOutboxItem, outcome: LtSyncPushResult | undefined): Promise<LtSyncConflictResolution<T>> {
    if (outcome?.status !== 'conflict' || !onConflict || !outcome.record || outcome.record.deletedAt) return 'server';
    const local = (await run((tx) => tx.getRecord(item.id))) as LtSyncRecord<T> | undefined;
    const answer = await onConflict({ change: { data: item.data as Partial<T> | undefined, op: item.op }, local, server: localOf(outcome.record) as LtSyncRecord<T> });
    return answer === 'server' || !answer?.data ? 'server' : answer;
  }

  async function push(result: LtSyncResult, owner: string | undefined): Promise<void> {
    const carried = new Set<string>();
    for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
      // Read and mark in ONE transaction, and send what that transaction read: an edit between a
      // separate read and mark would fold into an item already on its way and be lost.
      // At most ONE change per record per request: the next one's `baseVersion` assumes this one
      // is applied. Sent together, a change based on a refused one would meet another writer's
      // version with the same number and be applied on top of it; sent after, it is dropped first.
      const chunk = await runAs(owner, async (tx) => {
        const records = new Set<string>();
        const items: LtSyncOutboxItem[] = [];
        for (const item of await tx.listOutbox()) {
          if (items.length === PUSH_CHUNK) break;
          if (records.has(item.id)) continue;
          records.add(item.id);
          if (!carried.has(item.mutationId)) items.push(item);
        }
        for (const item of items) await tx.putOutbox({ ...item, attempted: true });
        return items;
      });
      if (!chunk.length) return;
      for (const item of chunk) carried.add(item.mutationId);
      const response = await request('POST', `/${encodeURIComponent(model)}`, { items: chunk.map(pushItem) });
      const results: LtSyncPushResult[] = response.body?.results ?? [];
      for (let index = 0; index < chunk.length; index++) {
        const item = chunk[index]!;
        const resolution = await resolveConflict(item, results[index]);
        await runAs(owner, (tx) => settle(tx, item, results[index], result, resolution));
      }
    }
  }

  /** Pull every page after the stored cursor; answers whether a resync dropped the local records */
  async function pull(result: LtSyncResult, owner: string | undefined): Promise<boolean> {
    let cursor = await run((tx) => tx.getMeta<string>(cursorKey));
    for (let page = 0; page < 10_000; page++) {
      const query = new URLSearchParams({ limit: String(pageLimit) });
      if (cursor) query.set('cursor', cursor);
      const response = await request('GET', `/${encodeURIComponent(model)}?${query}`);
      if (response.status === 403) {
        // The caller may no longer pull this model (pull roles withdrawn, tenant left): the copies go,
        // like on `410 access`. Unsent changes stay, but cannot be pushed under this account (§10)
        result.forbidden = true;
        await runAs(owner, async (tx) => {
          await tx.clearRecords(new Set((await tx.listOutbox()).map((item) => item.id)));
          await tx.deleteMeta(cursorKey);
        });
        return false;
      }
      if (response.status === 410) {
        if (result.resynced) throw new Error(`resync loop: ${JSON.stringify(response.body)}`);
        // Keep the unsent changes, delete every local record, pull without a cursor (§8)
        result.resynced = true;
        await runAs(owner, async (tx) => {
          await tx.clearRecords(new Set((await tx.listOutbox()).map((item) => item.id)));
          await tx.deleteMeta(cursorKey);
        });
        cursor = undefined;
        continue;
      }
      const body = response.body as { cursor: string; hasMore: boolean; items: NonNullable<LtSyncPushResult['record']>[] };
      // A page's items and its cursor in one local transaction: a crash after it resumes with the next page (§5.2)
      await runAs(owner, async (tx) => {
        const pending = new Set((await tx.listOutbox()).map((item) => item.id));
        for (const item of body.items ?? []) {
          // An unsent local change wins locally until its push settles; the push meets the newer version then
          if (pending.has(item.id)) continue;
          // A page may repeat a record or deliver an older one; the higher version wins (§5.2)
          const local = await tx.getRecord(item.id);
          if (local && local.version > item.version) continue;
          if (item.deletedAt) await tx.deleteRecord(item.id);
          else await tx.putRecord(localOf(item));
        }
        await tx.setMeta(cursorKey, body.cursor);
      });
      cursor = body.cursor;
      if (!body.hasMore) return result.resynced;
    }
    throw new Error('pull did not end');
  }

  async function syncOnce(): Promise<LtSyncResult> {
    const result = emptyResult();
    try {
      // Every write of this run is bound to the user the data belongs to now (see `runAs`)
      const owner = await getLtSyncOwner();
      await push(result, owner);
      // A resync drops the local records but keeps the unsent changes; they meet the new state now (§8)
      if (await pull(result, owner)) await push(result, owner);
    } catch (error) {
      // Signed out or another account mid-run: what this run would have written is not theirs to keep
      if (error instanceof LtSyncOwnerChangedError) return result;
      if (error instanceof LtSyncUnauthorizedError) result.needsLogin = true;
      else if (error instanceof LtSyncOfflineError) result.offline = true;
      else if (error instanceof LtSyncBackoffError) result.retryAfterMs = error.retryAfterMs ?? 0;
      else throw error;
    }
    return result;
  }

  /** One sync per model across the tabs of the origin (Web Locks); correct without them, only busier (§6.5) */
  async function syncLocked(): Promise<LtSyncResult> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (!locks) return syncOnce();
    return await locks.request(`lt-offline-sync:${scope}`, syncOnce);
  }

  // Calls during a running sync collapse into ONE follow-up run, so a burst of triggers costs two runs at most
  let current: null | Promise<LtSyncResult> = null;
  let next: null | Promise<LtSyncResult> = null;
  function sync(): Promise<LtSyncResult> {
    if (!current) {
      current = syncLocked().finally(() => {
        current = null;
      });
      return current;
    }
    next ??= current
      .catch(() => undefined)
      .then(() => {
        next = null;
        return sync();
      });
    return next;
  }

  const engine: LtSyncEngine<T> = {
    async create(data) {
      const record: LtSyncRecord<T> = { data, deletedAt: null, id: newId(), updatedAt: null, version: 0 };
      await run(async (tx) => {
        await tx.putRecord(record as LtSyncRecord);
        await tx.addOutbox({ data: data as Record<string, unknown>, id: record.id, mutationId: ltSyncUuidV7(), op: 'upsert' });
      });
      return record;
    },
    get: (id) => run((tx) => tx.getRecord(id)) as Promise<LtSyncRecord<T> | undefined>,
    async list() {
      const records = (await run((tx) => tx.listRecords())) as LtSyncRecord<T>[];
      return records.filter((record) => !record.deletedAt).sort((a, b) => (a.id < b.id ? -1 : 1));
    },
    model,
    pendingCount: () => run(async (tx) => (await tx.listOutbox()).length),
    async pushPending() {
      try {
        // Bound to the owner like a sync: an answer arriving after the sign-out deleted the data writes nothing
        await push(emptyResult(), await getLtSyncOwner());
      } catch {
        // Best effort: whatever did not go out is deleted with the rest on sign-out
      }
    },
    scope,
    async remove(id) {
      await run(async (tx) => {
        const record = await tx.getRecord(id);
        if (!record || record.deletedAt) return;
        const pending = lastPending(await tx.listOutbox(), id);
        if (pending && !pending.attempted) {
          await tx.removeOutbox(pending.mutationId);
          if (pending.baseVersion === undefined) {
            // Created and deleted before it ever reached the server: nothing to tell the server
            await tx.deleteRecord(id);
            return;
          }
        }
        const baseVersion = pending && !pending.attempted ? pending.baseVersion : nextBase(record, pending);
        await tx.addOutbox({ baseVersion, id, mutationId: ltSyncUuidV7(), op: 'delete' });
        await tx.putRecord({ ...record, data: undefined, deletedAt: new Date().toISOString() });
      });
    },
    sync,
    async update(id, data) {
      return run(async (tx) => {
        const record = await tx.getRecord(id);
        if (!record || record.deletedAt) throw new Error(`no live local record ${id}`);
        const pending = lastPending(await tx.listOutbox(), id);
        if (pending && pending.op === 'upsert' && !pending.attempted) {
          // Folded into a change no push has carried yet (§6.2 allows one item per record)
          await tx.putOutbox({ ...pending, data: { ...pending.data, ...(data as Record<string, unknown>) } });
        } else {
          await tx.addOutbox({ baseVersion: nextBase(record, pending), data: data as Record<string, unknown>, id, mutationId: ltSyncUuidV7(), op: 'upsert' });
        }
        const changed = { ...record, data: { ...record.data, ...(data as Record<string, unknown>) } };
        await tx.putRecord(changed);
        return changed as LtSyncRecord<T>;
      });
    },
  };
  engines.set(scope, engine);
  return engine;
}

/**
 * Before sign-out: send what is still unsent, for at most `timeoutMs`, never failing. Whatever
 * did not go out is deleted with the rest afterwards — after signing out it could not be pushed
 * under this account anyway (nest-server `SECURITY.md`).
 *
 * Only when the local data belongs to `userId`, the user signing out. After an expired session
 * the outbox of the PREVIOUS user is still on the device; sent now, it would be created and
 * changed under the current user's session and account. It is deleted unsent instead.
 */
export async function flushLtSyncBeforeSignOut(userId: string | undefined, timeoutMs = 5000): Promise<void> {
  if (typeof indexedDB === 'undefined' || !userId) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  const flush = (async () => {
    if ((await getLtSyncOwner().catch(() => undefined)) !== userId) return;
    const scopes = await listLtSyncPendingModels().catch(() => [] as string[]);
    // Each scope with its own tenant header: the engine the app created, or one rebuilt from the scope
    await Promise.all(scopes.map((scope) => (engines.get(scope) ?? createLtSyncEngine(parseLtSyncScope(scope))).pushPending()));
  })();
  try {
    await Promise.race([flush, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Forget the registered engines (tests) */
export function resetLtSyncEngines(): void {
  engines.clear();
}
