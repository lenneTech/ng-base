/**
 * The offline-sync protocol engine against an in-memory server (`testing/sync-server.ts`), with a
 * real IndexedDB implementation (`fake-indexeddb`, loaded by `test-setup.ts`).
 *
 * The five scenarios the nest-server's reference test clients pass (DEV-3903) each have their own
 * block: offline create/change/delete, conflict, two tabs, expired session, cleared storage.
 * Ported from `nuxt-extensions/test/sync-engine.test.ts`; the Nuxt runtime config is replaced by
 * `configureLtSync()`.
 */

import { configureLtSync, createLtSyncEngine, flushLtSyncBeforeSignOut, ltSyncObjectId, ltSyncUuidV7, resetLtSyncEngines } from './sync-engine';
import { claimLtSyncOwner, deleteLtSyncDatabase, getLtSyncOwner, LT_SYNC_DB_NAME, runLtSyncTx } from './sync-store';
import { FakeSyncServer } from './testing/sync-server';

type Note = { body?: string; title: string };

let server: FakeSyncServer;

const engine = (options: Partial<Parameters<typeof createLtSyncEngine<Note>>[0]> = {}) => createLtSyncEngine<Note>({ fetch: server.fetch, model: 'note', ...options });

const outbox = () => runLtSyncTx('note', (tx) => tx.listOutbox());

beforeEach(() => {
  server = new FakeSyncServer();
  // What `provideLtSync()` does from DI: API URL, base path and the (auth-aware) fetch
  configureLtSync({ basePath: '/sync', buildApiUrl: (path) => `https://api.test${path}`, fetch: (input, init) => server.fetch(input, init) });
});

afterEach(async () => {
  resetLtSyncEngines();
  await deleteLtSyncDatabase();
});

describe('scenario: offline create, change and delete', () => {
  it('keeps every change in the outbox while offline and sends it once online', async () => {
    const client = engine();
    server.online = false;
    const a = await client.create({ title: 'A' });
    const b = await client.create({ title: 'B' });
    await client.update(a.id, { body: 'changed offline' });
    await client.remove(b.id);

    const offline = await client.sync();
    expect(offline.offline).toBe(true);
    // B was created and deleted before it reached the server: nothing to tell it
    expect((await client.list()).map((record) => record.data)).toEqual([{ body: 'changed offline', title: 'A' }]);
    expect(await client.pendingCount()).toBe(1);

    server.online = true;
    const online = await client.sync();
    expect(online).toMatchObject({ applied: 1, offline: false });
    expect(server.live()).toMatchObject([{ data: { body: 'changed offline', title: 'A' }, id: a.id, version: 1 }]);
    expect(await client.get(a.id)).toMatchObject({ version: 1 });
    expect(await client.pendingCount()).toBe(0);
  });

  it('chains baseVersion over changes made while a push was already on its way', async () => {
    const client = engine();
    const a = await client.create({ title: 'A' });
    await client.sync();

    server.online = false;
    await client.update(a.id, { title: 'A2' });
    // The failed push marked the change as carried: a later edit must not fold into it (§6.5)
    await client.sync();
    await client.update(a.id, { title: 'A3' });
    expect((await outbox()).map((item) => item.baseVersion)).toEqual([1, 2]);

    server.online = true;
    await client.sync();
    expect(server.records.get(a.id)).toMatchObject({ data: { title: 'A3' }, version: 3 });
    expect(await client.get(a.id)).toMatchObject({ data: { title: 'A3' }, version: 3 });
  });

  it('sends a delete of a synced record as a tombstone with its base version', async () => {
    const client = engine();
    const a = await client.create({ title: 'A' });
    await client.sync();
    server.online = false;
    await client.update(a.id, { title: 'gone soon' });
    await client.remove(a.id);
    // The unsent change was dropped for the delete, which carries the change's base
    expect(await outbox()).toMatchObject([{ baseVersion: 1, id: a.id, op: 'delete' }]);

    server.online = true;
    await client.sync();
    expect(server.records.get(a.id)).toMatchObject({ deletedAt: expect.any(String), version: 2 });
    expect(await client.get(a.id)).toBeUndefined();
  });
});

describe('scenario: conflict', () => {
  it('lets the server win by default and drops the changes based on the refused one', async () => {
    const client = engine();
    const a = await client.create({ title: 'A' });
    await client.sync();
    server.online = false;
    await client.update(a.id, { title: 'mine' });
    await client.sync();
    await client.update(a.id, { body: 'based on mine' });
    server.online = true;
    server.write(a.id, { title: 'theirs' });

    const result = await client.sync();
    expect(result.conflicts).toHaveLength(1);
    expect(await client.get(a.id)).toMatchObject({ data: { title: 'theirs' }, version: 2 });
    expect(await client.pendingCount()).toBe(0);
    // The follow-up change carried baseVersion 2 — the number of the OTHER writer's version. Sent in
    // the same request it would have been applied on top of it; it must never reach the server
    expect(server.records.get(a.id)).toEqual(expect.objectContaining({ data: { title: 'theirs' }, version: 2 }));
    expect(
      server
        .pushes()
        .flatMap((request) => request.body.items)
        .filter((item: { baseVersion?: number }) => item.baseVersion === 2),
    ).toEqual([]);
  });

  it('sends the hook’s answer again on top of the server’s version', async () => {
    const seen: unknown[] = [];
    const client = engine({
      onConflict: (conflict) => {
        seen.push(conflict);
        return { data: { title: `${conflict.server.data?.title} + ${conflict.change.data?.title}` } };
      },
    });
    const a = await client.create({ title: 'A' });
    await client.sync();
    await client.update(a.id, { title: 'mine' });
    server.write(a.id, { title: 'theirs' });

    await client.sync();
    expect(seen).toMatchObject([{ change: { data: { title: 'mine' }, op: 'upsert' }, local: { data: { title: 'mine' } }, server: { data: { title: 'theirs' }, version: 2 } }]);
    expect(server.records.get(a.id)).toMatchObject({ data: { title: 'theirs + mine' }, version: 3 });
    expect(await client.get(a.id)).toMatchObject({ data: { title: 'theirs + mine' }, version: 3 });
    expect(await client.pendingCount()).toBe(0);
  });

  it('never resurrects a record the server deleted, whatever the hook answers', async () => {
    const client = engine({ onConflict: () => ({ data: { title: 'revive' } }) });
    const a = await client.create({ title: 'A' });
    await client.sync();
    await client.update(a.id, { title: 'mine' });
    server.tombstone(a.id);

    const result = await client.sync();
    expect(result.conflicts).toHaveLength(1);
    expect(await client.get(a.id)).toBeUndefined();
    expect(server.records.get(a.id)?.deletedAt).toBeTruthy();
  });
});

describe('scenario: two tabs', () => {
  it('produces neither a duplicate nor a false conflict when two tabs push the same change', async () => {
    const tabA = engine();
    const tabB = engine();
    const a = await tabA.create({ title: 'A' });
    await tabA.update(a.id, { body: 'x' });

    const [first, second] = await Promise.all([tabA.sync(), tabB.sync()]);
    expect([...first.conflicts, ...second.conflicts]).toEqual([]);
    expect(server.live()).toHaveLength(1);
    expect(await tabB.list()).toMatchObject([{ id: a.id, version: 1 }]);
  });

  it('holds back the changes behind one answered `retry` until it is settled', async () => {
    const client = engine();
    const a = await client.create({ title: 'A' });
    await client.sync();
    server.online = false;
    await client.update(a.id, { title: 'first' });
    await client.sync();
    await client.update(a.id, { title: 'second' });
    server.online = true;
    const [first] = await outbox();
    server.inProgress.add(first!.mutationId);

    await client.sync();
    // The second change assumes the first is applied; while that is open it must not go out alone
    expect(
      server
        .pushes()
        .flatMap((request) => request.body.items)
        .map((item: { baseVersion?: number }) => item.baseVersion),
    ).not.toContain(2);
    await client.sync();
    expect(server.records.get(a.id)).toMatchObject({ data: { title: 'second' }, version: 3 });
  });

  it('keeps a change answered `retry` and sends it with its mutation id again', async () => {
    const client = engine();
    const a = await client.create({ title: 'A' });
    const [queued] = await outbox();
    server.inProgress.add(queued!.mutationId);

    expect(await client.sync()).toMatchObject({ applied: 0, retried: 1 });
    expect(await client.pendingCount()).toBe(1);
    expect(await client.sync()).toMatchObject({ applied: 1, retried: 0 });
    expect(server.pushes().map((request) => request.body.items[0].mutationId)).toEqual([queued!.mutationId, queued!.mutationId]);
    expect(server.records.get(a.id)?.version).toBe(1);
  });
});

describe('scenario: expired session', () => {
  it('discards nothing on 401 and sends the same mutation ids after signing in again', async () => {
    const client = engine();
    const a = await client.create({ title: 'A' });
    server.authorized = false;

    expect(await client.sync()).toMatchObject({ needsLogin: true });
    expect(await client.pendingCount()).toBe(1);
    expect(server.records.size).toBe(0);

    server.authorized = true;
    expect(await client.sync()).toMatchObject({ applied: 1, needsLogin: false });
    const sent = server.pushes().map((request) => request.body.items[0].mutationId);
    expect(new Set(sent).size).toBe(1);
    expect(server.live()).toMatchObject([{ id: a.id, version: 1 }]);
  });

  it('recognises a change whose answer was lost, without a duplicate', async () => {
    const client = engine();
    await client.create({ title: 'A' });
    server.loseNextPushResponse = true;

    expect(await client.sync()).toMatchObject({ offline: true });
    expect(await client.sync()).toMatchObject({ applied: 1 });
    expect(server.live()).toHaveLength(1);
  });
});

describe('scenario: cleared storage', () => {
  it('starts without a cursor and receives the full state again', async () => {
    const client = engine();
    await client.create({ title: 'A' });
    await client.create({ title: 'B' });
    await client.sync();

    // What a browser does when it removes the site's storage
    await deleteLtSyncDatabase();
    resetLtSyncEngines();
    const fresh = engine();
    expect(await fresh.list()).toEqual([]);

    await fresh.sync();
    expect(server.pulls().at(-1)?.url.searchParams.has('cursor')).toBe(false);
    expect((await fresh.list()).map((record) => record.data?.title)).toEqual(expect.arrayContaining(['A', 'B']));
  });
});

describe('pull', () => {
  it('pages with the cursor and stores it after every page', async () => {
    for (const title of ['1', '2', '3', '4', '5']) server.write(ltSyncObjectId(), { title });
    const client = engine({ pageLimit: 2 });

    await client.sync();
    const cursors = server.pulls().map((request) => request.url.searchParams.get('cursor'));
    expect(cursors).toEqual([null, '2', '4']);
    expect(await client.list()).toHaveLength(5);
    expect(await runLtSyncTx('note', (tx) => tx.getMeta('cursor:note'))).toBe('5');
  });

  it('applies tombstones and never overwrites a newer local version or an unsent change', async () => {
    const client = engine();
    const kept = await client.create({ title: 'kept' });
    const gone = await client.create({ title: 'gone' });
    await client.sync();
    server.tombstone(gone.id);
    server.write(kept.id, { title: 'server' });
    await client.update(kept.id, { title: 'local' });
    // Pull only: the unsent change must survive the newer server version until its push settles
    server.nextPush.push({ status: 200, body: { results: [{ id: kept.id, mutationId: 'x', status: 'retry' }] } });

    await client.sync();
    expect(await client.get(gone.id)).toBeUndefined();
    expect(await client.get(kept.id)).toMatchObject({ data: { title: 'local' } });
  });

  it('drops the local records on 410, keeps the unsent changes and pushes them after the full pull', async () => {
    const client = engine();
    const a = await client.create({ title: 'A' });
    await client.sync();
    const b = await client.create({ title: 'B offline' });
    server.nextPull.push({ body: { code: 'SYNC_RESYNC_REQUIRED', reason: 'horizon' }, status: 410 });
    // The push of B happens first; force its answer to `retry` so B is still unsent when the 410 arrives
    server.nextPush.push({ status: 200, body: { results: [{ id: b.id, mutationId: 'x', status: 'retry' }] } });

    const result = await client.sync();
    expect(result.resynced).toBe(true);
    expect(server.pulls().at(-1)?.url.searchParams.has('cursor')).toBe(false);
    expect(
      server
        .live()
        .map((record) => record.id)
        .sort(),
    ).toEqual([a.id, b.id].sort());
    expect(await client.pendingCount()).toBe(0);
  });

  it('deletes the model’s records and cursor on 403, keeping only what is unsent', async () => {
    const client = engine();
    await client.create({ title: 'A' });
    await client.sync();
    const unsent = await client.create({ title: 'unsent' });
    server.nextPush.push({ status: 200, body: { results: [{ id: unsent.id, mutationId: 'x', status: 'retry' }] } });
    server.nextPull.push({ status: 403 });

    expect(await client.sync()).toMatchObject({ forbidden: true });
    expect((await client.list()).map((record) => record.id)).toEqual([unsent.id]);
    expect(await runLtSyncTx('note', (tx) => tx.getMeta('cursor:note'))).toBeUndefined();
  });
});

describe('tenants', () => {
  it('keeps a tenant’s records and unsent changes to that tenant', async () => {
    const tenantA = engine({ tenantId: 'tenant-a' });
    const tenantB = engine({ tenantId: 'tenant-b' });
    server.online = false;
    await tenantA.create({ title: 'internal note of tenant a' });
    server.online = true;

    // The server stamps a create into the tenant of its header: B must not send A's note
    expect(await tenantB.list()).toEqual([]);
    await tenantB.sync();
    expect(server.pushes()).toEqual([]);

    await tenantA.sync();
    expect(server.pushes().map((request) => request.headers['x-tenant-id'])).toEqual(['tenant-a']);
  });

  it('sends each tenant’s unsent changes with its own header before sign-out', async () => {
    await claimLtSyncOwner('user-1');
    await engine({ tenantId: 'tenant-a' }).create({ title: 'A' });
    await engine({ tenantId: 'tenant-b' }).create({ title: 'B' });
    // No engine registered any more (the pages are gone): the flush rebuilds them from the stored scopes,
    // with the configured fetch (`configureLtSync`)
    resetLtSyncEngines();

    await flushLtSyncBeforeSignOut('user-1', 1000);
    const sent = server.pushes().map((request) => [request.headers['x-tenant-id'], request.body.items[0].data.title]);
    expect(sent.sort((a, b) => String(a).localeCompare(String(b)))).toEqual([
      ['tenant-a', 'A'],
      ['tenant-b', 'B'],
    ]);
  });
});

describe('server answers', () => {
  it('restores the server’s state after a refused change to a record it has', async () => {
    const client = engine();
    const a = await client.create({ title: 'A' });
    await client.sync();
    await client.update(a.id, { title: '' });

    const result = await client.sync();
    expect(result.rejected).toMatchObject([{ code: 'VALIDATION_FAILED', id: a.id }]);
    // Never "saved" on the device while the server keeps the old value
    expect(await client.get(a.id)).toMatchObject({ data: { title: 'A' }, version: 1 });
  });

  it('drops the changes queued behind a refused one instead of sending them on their own', async () => {
    const client = engine();
    const a = await client.create({ title: 'A' });
    await client.sync();
    server.online = false;
    await client.update(a.id, { title: '' });
    // The failed push marks it carried: the next edit becomes its own change, baseVersion 2
    await client.sync();
    await client.update(a.id, { body: 'based on the refused title' });
    server.online = true;
    server.write(a.id, { title: 'theirs' });

    await client.sync();
    // Version 2 is the OTHER writer's: the follow-up must never reach the server on its own
    expect(server.records.get(a.id)).toMatchObject({ data: { title: 'theirs' }, version: 2 });
    expect(
      server
        .pushes()
        .flatMap((request) => request.body.items)
        .filter((item: { baseVersion?: number }) => item.baseVersion === 2),
    ).toEqual([]);
    expect(await client.pendingCount()).toBe(0);
    expect(await client.get(a.id)).toMatchObject({ data: { title: 'theirs' }, version: 2 });
  });

  it('brings a record back when the server refuses its delete', async () => {
    const client = engine();
    const a = await client.create({ title: 'A' });
    await client.sync();
    server.forbiddenIds.add(a.id);
    await client.remove(a.id);

    const result = await client.sync();
    expect(result.rejected).toMatchObject([{ code: 'FORBIDDEN' }]);
    expect((await client.list()).map((record) => record.id)).toEqual([a.id]);
  });

  it('reports a backoff on 429 with the Retry-After it asked for, losing nothing', async () => {
    const client = engine();
    await client.create({ title: 'A' });
    server.nextPush.push({ headers: { 'retry-after': '2' }, status: 429 });

    expect(await client.sync()).toMatchObject({ retryAfterMs: 2000 });
    expect(await client.pendingCount()).toBe(1);
  });

  it('drops a rejected change and a record the server never had', async () => {
    const client = engine();
    const bad = await client.create({ title: '' });

    const result = await client.sync();
    expect(result.rejected).toMatchObject([{ code: 'VALIDATION_FAILED', id: bad.id }]);
    expect(await client.get(bad.id)).toBeUndefined();
    expect(await client.pendingCount()).toBe(0);
  });

  it('drops the local record when the server answers not_found', async () => {
    const client = engine();
    const a = await client.create({ title: 'A' });
    await client.sync();
    server.records.delete(a.id);
    await client.update(a.id, { title: 'B' });

    await client.sync();
    expect(await client.get(a.id)).toBeUndefined();
  });

  it('throws an unexpected status instead of hiding it', async () => {
    const client = engine();
    await client.create({ title: 'A' });
    server.nextPush.push({ status: 500 });

    await expect(client.sync()).rejects.toThrow(/answered 500/);
    expect(await client.pendingCount()).toBe(1);
  });
});

describe('requests', () => {
  it('sends JSON pushes to the configured base path with the tenant header', async () => {
    configureLtSync({ basePath: '/offline' });
    const client = engine({ tenantId: 'tenant-1' });
    await client.create({ title: 'A' });

    await client.sync();
    const [push, pull] = server.requests;
    expect(push!.url.pathname).toBe('/offline/note');
    expect(push!.headers).toMatchObject({ 'content-type': 'application/json', 'x-tenant-id': 'tenant-1' });
    expect(pull!.url.pathname).toBe('/offline/note');
    expect(pull!.headers['x-tenant-id']).toBe('tenant-1');
    expect(pull!.headers['content-type']).toBeUndefined();
  });

  it('collapses sync calls during a running sync into one follow-up run', async () => {
    const client = engine();
    await client.create({ title: 'A' });

    await Promise.all([client.sync(), client.sync(), client.sync(), client.sync()]);
    expect(server.pulls()).toHaveLength(2);
  });
});

describe('ids', () => {
  it('creates ObjectId-hex ids with a timestamp head and a random tail', () => {
    const before = Math.floor(Date.now() / 1000);
    const ids = Array.from({ length: 50 }, () => ltSyncObjectId());
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{24}$/);
      expect(Math.abs(Number.parseInt(id.slice(0, 8), 16) - before)).toBeLessThanOrEqual(1);
    }
    expect(new Set(ids.map((id) => id.slice(8))).size).toBe(50);
  });

  it('creates uuidv7 mutation ids and record ids for a model declared with them', async () => {
    expect(ltSyncUuidV7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const record = await engine({ idFormat: 'uuidv7' }).create({ title: 'A' });
    expect(record.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect((await outbox())[0]!.mutationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });
});

/** A fetch whose answers the server has produced but the client receives only after `release()` */
function gated() {
  let release!: () => void;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  let answered!: () => void;
  const begun = new Promise<void>((resolve) => {
    answered = resolve;
  });
  const fetch = async (input: string, init: RequestInit) => {
    const response = await server.fetch(input, init);
    answered();
    await open;
    return response;
  };
  return { begun, fetch, release };
}

describe('sign-out and account switch', () => {
  it('pushes what is unsent before sign-out', async () => {
    await claimLtSyncOwner('user-1');
    const client = engine();
    await client.create({ title: 'A' });

    await flushLtSyncBeforeSignOut('user-1', 1000);
    expect(server.live()).toHaveLength(1);
  });

  it('gives up after the timeout when the server does not answer', async () => {
    await claimLtSyncOwner('user-1');
    const hanging = createLtSyncEngine<Note>({ fetch: () => new Promise<Response>(() => undefined), model: 'note' });
    await hanging.create({ title: 'A' });

    const started = Date.now();
    await flushLtSyncBeforeSignOut('user-1', 50);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('never sends another user’s unsent changes under the signing-out user’s session', async () => {
    // User 1's session expired: by design the outbox stays. User 2 signs in and out without a sync page
    await claimLtSyncOwner('user-1');
    await engine().create({ title: 'diary of user 1' });

    await flushLtSyncBeforeSignOut('user-2', 1000);
    await flushLtSyncBeforeSignOut(undefined, 1000);
    expect(server.pushes()).toEqual([]);

    await flushLtSyncBeforeSignOut('user-1', 1000);
    expect(server.live()).toHaveLength(1);
  });

  it('writes nothing when a pull is answered after sign-out deleted the data', async () => {
    server.write(ltSyncObjectId(), { title: 'private of user 1' });
    await claimLtSyncOwner('user-1');
    const { begun, fetch, release } = gated();
    const running = createLtSyncEngine<Note>({ fetch, model: 'note' }).sync();

    await begun;
    await deleteLtSyncDatabase();
    release();
    await running;

    // Nothing for the claim to wipe: the late answer was refused, not stored and wiped later
    expect(await claimLtSyncOwner('user-2')).toBe(false);
    expect(await engine().list()).toEqual([]);
    expect(await runLtSyncTx('note', (tx) => tx.getMeta('cursor:note'))).toBeUndefined();
  });

  it('writes nothing when the sign-out flush is answered after its timeout and the deletion', async () => {
    await claimLtSyncOwner('user-1');
    const client = engine();
    const a = await client.create({ title: 'A' });
    await client.sync();
    await client.update(a.id, { title: 'mine' });
    server.write(a.id, { title: 'theirs of user 1' });
    resetLtSyncEngines();
    const { begun, fetch, release } = gated();
    createLtSyncEngine<Note>({ fetch, model: 'note' });

    const flushing = flushLtSyncBeforeSignOut('user-1', 20);
    await begun;
    await flushing;
    await deleteLtSyncDatabase();
    release();
    await new Promise((resolve) => setTimeout(resolve, 30));

    // The `conflict` answer carried user 1's server record; it must not land in the next user's database
    expect(await claimLtSyncOwner('user-2')).toBe(false);
    expect(await engine().list()).toEqual([]);
  });

  it('lets another tab delete the database while this one holds it open (sign-out there)', async () => {
    await claimLtSyncOwner('user-1');

    // The other tab: a deletion waits until every open connection is closed. Without this tab
    // closing its connection, sign-out there would never return and the data would stay
    const deleted = await new Promise<'blocked' | 'deleted'>((resolve) => {
      indexedDB.deleteDatabase(LT_SYNC_DB_NAME).addEventListener('success', () => resolve('deleted'));
      setTimeout(() => resolve('blocked'), 1000);
    });
    expect(deleted).toBe('deleted');
    // And this tab opens a fresh, empty database on its next access
    expect(await getLtSyncOwner()).toBeUndefined();
  });

  it('treats data without an owner as foreign and wipes it on the first claim', async () => {
    await engine().create({ title: 'left behind' });

    expect(await claimLtSyncOwner('user-2')).toBe(true);
    expect(await engine().list()).toEqual([]);
    expect(await engine().pendingCount()).toBe(0);
  });

  it('binds the data to the first user and wipes every model for another one', async () => {
    expect(await claimLtSyncOwner('user-1')).toBe(false);
    await engine().create({ title: 'A' });
    await createLtSyncEngine({ fetch: server.fetch, model: 'task' }).create({ title: 'T' });

    expect(await claimLtSyncOwner('user-1')).toBe(false);
    expect(await engine().list()).toHaveLength(1);

    expect(await claimLtSyncOwner('user-2')).toBe(true);
    expect(await engine().list()).toEqual([]);
    expect(await runLtSyncTx('task', (tx) => tx.listRecords())).toEqual([]);
    expect(await engine().pendingCount()).toBe(0);
  });
});
