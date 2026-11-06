/**
 * `provideLtSync()`: its options, how it wires the engine into DI, and what sign-out does with the local data
 * (DEV-3917, AC 3 and decision E3).
 *
 * With sync provided, sign-out first sends what is unsent — for a bounded time, while the session still exists — and
 * after signing out deletes the whole local database (nest-server `SECURITY.md`: records, cursors and unsent
 * changes). Without sync, and on the server, it touches none of it. The order of the hooks around
 * `POST /iam/sign-out` and the logging of a failing hook belong to `LtAuthService.signOut()`.
 *
 * Ported from `nuxt-extensions/test/sign-out-sync.test.ts` and `sync-module-options.test.ts`: the Nuxt module
 * options become `LT_SYNC_OPTIONS` (defaults ← code ← runtime `lt.sync`), the runtime-config flag `sync.enabled`
 * becomes "`provideLtSync()` is in the providers".
 */

import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LT_FETCH, LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig, type LtFetch, type LtRuntimeConfig } from '@lenne.tech/ng-base';
import { LT_AUTH_SIGN_OUT_HOOKS, type LtAuthSignOutHook } from '@lenne.tech/ng-base/auth/provide';
import type { Mock } from 'vitest';

import { LT_SYNC_OPTIONS, provideLtSync } from './provide-lt-sync';
import { buildLtSyncUrl, configureLtSync, createLtSyncEngine, getLtSyncBasePath, resetLtSyncEngines } from './sync-engine';
import { claimLtSyncOwner, deleteLtSyncDatabase, getLtSyncOwner } from './sync-store';
import type { LtSyncOptions } from './sync-types';
import { FakeSyncServer } from './testing/sync-server';

let server: FakeSyncServer;
let fetchSpy: Mock<LtFetch>;

const unexpectedFetch = async (input: string): Promise<Response> => {
  throw new Error(`unexpected fetch ${input}`);
};

function setup({
  options,
  platform = 'browser',
  runtime,
  sync = true,
}: { options?: LtSyncOptions; platform?: 'browser' | 'server'; runtime?: Partial<LtRuntimeConfig>; sync?: boolean } = {}) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platform },
      { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.test' }, runtime) },
      { provide: LT_FETCH, useValue: fetchSpy },
      ...(sync ? [provideLtSync(options)] : []),
    ],
  });
}

/** The hooks the providers registered; injecting them also runs the app initializers */
const hooks = (): LtAuthSignOutHook[] => TestBed.inject(LT_AUTH_SIGN_OUT_HOOKS);

beforeEach(() => {
  server = new FakeSyncServer();
  fetchSpy = vi.fn<LtFetch>((input, init) => server.fetch(String(input), init));
  // A neutral engine environment, so a spec sees what `provideLtSync()` changed in it
  configureLtSync({ basePath: '/sync', buildApiUrl: (path) => path, fetch: unexpectedFetch });
});

afterEach(async () => {
  resetLtSyncEngines();
  await deleteLtSyncDatabase();
});

describe('LT_SYNC_OPTIONS', () => {
  it('is on the nest-server base path by default', () => {
    setup();
    expect(TestBed.inject(LT_SYNC_OPTIONS)).toEqual({ basePath: '/sync' });
  });

  it('takes the base path given in code', () => {
    setup({ options: { basePath: '/offline' } });
    expect(TestBed.inject(LT_SYNC_OPTIONS).basePath).toBe('/offline');
  });

  it('lets the runtime override (`NG_PUBLIC_LT_SYNC_BASE_PATH`) win over code, but never an unset value', () => {
    setup({ options: { basePath: '/offline' }, runtime: { lt: { sync: { basePath: '/stage-sync' } } } });
    expect(TestBed.inject(LT_SYNC_OPTIONS).basePath).toBe('/stage-sync');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideLtSync({ basePath: '/offline' }), { provide: LT_RUNTIME_CONFIG, useValue: { ...LT_RUNTIME_CONFIG_DEFAULTS, lt: { sync: { basePath: undefined } } } }],
    });
    expect(TestBed.inject(LT_SYNC_OPTIONS).basePath).toBe('/offline');
  });

  it('works without a runtime configuration', () => {
    TestBed.configureTestingModule({ providers: [provideLtSync()] });
    expect(TestBed.inject(LT_SYNC_OPTIONS).basePath).toBe('/sync');
  });
});

describe('provideLtSync — engine environment', () => {
  it('points the engine at the API URL and the base path, through the auth-aware `LT_FETCH`', async () => {
    setup({ runtime: { lt: { sync: { basePath: '/offline' } } } });
    hooks();

    expect(getLtSyncBasePath()).toBe('/offline');
    expect(buildLtSyncUrl('/note')).toBe('https://api.test/offline/note');
    await claimLtSyncOwner('user-1');
    await createLtSyncEngine({ model: 'note' }).sync();
    expect(fetchSpy).toHaveBeenCalled();
    expect(server.pulls().map((request) => request.url.href)).toEqual(['https://api.test/offline/note?limit=200']);
  });

  it('leaves the engine alone on the server', () => {
    setup({ options: { basePath: '/offline' }, platform: 'server' });
    hooks();

    expect(getLtSyncBasePath()).toBe('/sync');
    expect(buildLtSyncUrl('/note')).toBe('/sync/note');
  });
});

describe('sign-out and the offline-sync data', () => {
  it('sends what is unsent before sign-out and deletes the local data after it', async () => {
    setup();
    const [hook] = hooks();
    await claimLtSyncOwner('user-1');
    await createLtSyncEngine({ model: 'note' }).create({ title: 'A' });

    // Sending needs the session, so it comes first; the data stays until the user is signed out
    await hook!.beforeSignOut?.('user-1');
    expect(server.live()).toHaveLength(1);
    expect(await getLtSyncOwner()).toBe('user-1');

    await hook!.afterSignOut?.();
    expect(await getLtSyncOwner()).toBeUndefined();
    expect(await createLtSyncEngine({ model: 'note' }).list()).toEqual([]);
  });

  it('never sends another user’s unsent changes under the signing-out session', async () => {
    setup();
    const [hook] = hooks();
    // User 1's session expired: by design the outbox stays. User 2 (or nobody known) signs out
    await claimLtSyncOwner('user-1');
    await createLtSyncEngine({ model: 'note' }).create({ title: 'diary of user 1' });

    await hook!.beforeSignOut?.('user-2');
    await hook!.beforeSignOut?.(null);
    expect(server.pushes()).toEqual([]);
  });

  it('gives up sending after 5 s when the server does not answer', async () => {
    fetchSpy.mockImplementation(() => new Promise<Response>(() => undefined));
    setup();
    const [hook] = hooks();
    await claimLtSyncOwner('user-1');
    await createLtSyncEngine({ model: 'note' }).create({ title: 'A' });

    // Only the timers are fake: IndexedDB (fake-indexeddb) answers on `setImmediate`, which keeps running
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let done = false;
      void Promise.resolve(hook!.beforeSignOut?.('user-1')).then(() => (done = true));
      await vi.waitUntil(() => fetchSpy.mock.calls.length > 0, { interval: 0 });
      const settle = () => new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(4999);
      await settle();
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await settle();
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('touches no sync data when the app did not provide sync', () => {
    setup({ sync: false });
    expect(hooks()).toEqual([]);
  });

  it('touches no sync data on the server', async () => {
    setup({ platform: 'server' });
    const [hook] = hooks();
    await claimLtSyncOwner('user-1');
    await createLtSyncEngine({ model: 'note' }).create({ title: 'A' });

    await hook!.beforeSignOut?.('user-1');
    await hook!.afterSignOut?.();
    expect(server.requests).toEqual([]);
    expect(await getLtSyncOwner()).toBe('user-1');
    expect(await createLtSyncEngine({ model: 'note' }).list()).toHaveLength(1);
  });
});
