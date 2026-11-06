/**
 * `injectLtOfflineSync()` — the signal layer over the protocol engine: when it syncs, what it shows,
 * and who it shows it to.
 *
 * The protocol itself is proven in `sync-engine.spec.ts`. Here the server is the same in-memory
 * stand-in, reached through `provideLtSync()` and `LT_FETCH`, and IndexedDB is `fake-indexeddb`.
 * Each instance lives in its own environment injector, as it would in a component; destroying the
 * injector ends it. Ported from `nuxt-extensions/test/use-lt-offline-sync.test.ts`.
 */

import { createEnvironmentInjector, EnvironmentInjector, PLATFORM_ID, runInInjectionContext, signal, type Signal } from '@angular/core';
import { createWatch } from '@angular/core/primitives/signals';
import { TestBed } from '@angular/core/testing';
import { LT_FETCH, LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';
import { LtAuthStore } from '@lenne.tech/ng-base/auth/provide';

import { injectLtOfflineSync, type LtOfflineSync } from './offline-sync';
import { provideLtSync } from './provide-lt-sync';
import { resetLtSyncEngines } from './sync-engine';
import { deleteLtSyncDatabase } from './sync-store';
import type { LtOfflineSyncOptions } from './sync-types';
import { FakeSyncServer } from './testing/sync-server';

const currentUser = signal<{ id: string } | null>({ id: 'user-1' });

type Note = { title: string };

let server: FakeSyncServer;
let injectors: EnvironmentInjector[];

/** Create the instance in its own injection context, as a component would */
function mount(options: LtOfflineSyncOptions<Note> = {}, model = 'note'): LtOfflineSync<Note> {
  const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
  injectors.push(injector);
  return runInInjectionContext(injector, () => injectLtOfflineSync<Note>(model, options));
}

/** End the most recent instance, as destroying its component would */
const unmount = () => injectors.pop()!.destroy();

/** Let IndexedDB (fake-indexeddb answers on `setImmediate`) work while `setTimeout` may be fake */
const settle = async (rounds = 200) => {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setImmediate(resolve));
};

const until = async (condition: () => boolean, label = 'condition') => {
  for (let i = 0; i < 300 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(condition(), label).toBe(true);
};

/**
 * Every value `source` takes, also one replaced before an effect would see it (Vue's `flush: 'sync'`): the watch
 * runs in the microtask after each change, before the next IndexedDB answer (a macrotask) can replace the value.
 */
function recordValues<V>(source: Signal<V>, onValue: (value: V) => void): () => void {
  let first = true;
  const watcher = createWatch(
    () => {
      const value = source();
      if (!first) onValue(value);
      first = false;
    },
    (watch) => queueMicrotask(() => watch.run()),
    false,
  );
  watcher.run();
  return () => watcher.destroy();
}

const titles = (sync: LtOfflineSync<Note>) =>
  sync
    .records()
    .map((record) => record.data?.title ?? '')
    .sort((a, b) => a.localeCompare(b));

/** Pretend the tab is hidden or visible again and tell the page */
function setVisibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  server = new FakeSyncServer();
  currentUser.set({ id: 'user-1' });
  injectors = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.test' }) },
      { provide: LT_FETCH, useValue: (input: RequestInfo | URL, init?: RequestInit) => server.fetch(String(input), init) },
      { provide: LtAuthStore, useValue: { user: currentUser.asReadonly() } },
      provideLtSync(),
    ],
  });
});

afterEach(async () => {
  for (const injector of injectors) injector.destroy();
  delete (document as { visibilityState?: unknown }).visibilityState;
  resetLtSyncEngines();
  await deleteLtSyncDatabase();
});

describe('injectLtOfflineSync — start and local changes', () => {
  it('pulls at start and shows the records', async () => {
    server.write('6720c0aaaaaaaaaaaaaaaaaa', { title: 'from server' });
    const notes = mount();

    await until(() => notes.records().length === 1, 'pulled record');
    expect(titles(notes)).toEqual(['from server']);
    expect(notes.lastSyncedAt()).toBeInstanceOf(Date);
    expect(notes.syncing()).toBe(false);
  });

  it('shows a change at once and sends it shortly after', async () => {
    const notes = mount();
    await until(() => notes.lastSyncedAt() !== null);

    await notes.create({ title: 'A' });
    expect(titles(notes)).toEqual(['A']);
    expect(notes.pendingCount()).toBe(1);
    await until(() => server.live().length === 1, 'pushed');
    await until(() => notes.pendingCount() === 0);
  });

  it('keeps changes while offline and sends them on `online`', async () => {
    const notes = mount();
    await until(() => notes.lastSyncedAt() !== null);
    server.online = false;

    await notes.create({ title: 'offline' });
    await notes.sync();
    expect(notes.offline()).toBe(true);
    expect(notes.pendingCount()).toBe(1);

    server.online = true;
    window.dispatchEvent(new Event('online'));
    await until(() => server.live().length === 1, 'sent on online');
    expect(notes.offline()).toBe(false);
  });

  it('syncs on focus', async () => {
    const notes = mount();
    await until(() => notes.lastSyncedAt() !== null);
    server.write('6720c0aaaaaaaaaaaaaaaaab', { title: 'later' });

    window.dispatchEvent(new Event('focus'));
    await until(() => notes.records().length === 1, 'pulled on focus');
  });

  it('leaves syncing to the app with `auto: false`', async () => {
    server.write('6720c0aaaaaaaaaaaaaaaaac', { title: 'x' });
    const notes = mount({ auto: false });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.pulls()).toHaveLength(0);

    await notes.sync();
    expect(titles(notes)).toEqual(['x']);
  });

  it('reports a 401 without losing anything', async () => {
    const notes = mount({ auto: false });
    await notes.create({ title: 'A' });
    server.authorized = false;

    await notes.sync();
    expect(notes.needsLogin()).toBe(true);
    expect(notes.pendingCount()).toBe(1);
  });

  it('reports an unexpected server answer as error and clears it with the next good sync', async () => {
    const notes = mount({ auto: false });
    await notes.create({ title: 'A' });
    server.nextPush.push({ status: 500 });

    await expect(notes.sync()).rejects.toThrow(/answered 500/);
    expect(notes.error()?.message).toMatch(/answered 500/);
    expect(notes.syncing()).toBe(false);

    await notes.sync();
    expect(notes.error()).toBeNull();
    expect(notes.pendingCount()).toBe(0);
  });

  it('stops syncing when its injection context is destroyed', async () => {
    const notes = mount();
    await until(() => notes.lastSyncedAt() !== null);
    await notes.create({ title: 'A' });
    // Destroyed within the 300 ms after the change: the scheduled push never goes out
    unmount();

    await new Promise((resolve) => setTimeout(resolve, 400));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.pushes()).toEqual([]);
  });
});

describe('injectLtOfflineSync — whose data it is', () => {
  it('wipes the previous user’s data before showing anything to another user', async () => {
    const notes = mount({ auto: false });
    await notes.create({ title: 'private of user 1' });
    await until(() => notes.records().length === 1);

    currentUser.set({ id: 'user-2' });
    await until(() => notes.records().length === 0, 'wiped on account switch');
    expect(notes.pendingCount()).toBe(0);
    expect(await notes.get(notes.records()[0]?.id ?? 'none')).toBeUndefined();
  });

  it('never shows the previous user’s records while the claim for a new user is still running', async () => {
    const first = mount({ auto: false });
    await first.create({ title: 'private of user 1' });
    unmount();

    const seen: string[] = [];
    const notes = mount({ auto: false });
    const stop = recordValues(notes.records, (records) => seen.push(...records.map((record) => record.data?.title ?? '')));
    // The account changes while the start-up claim for user 1 is still on its way
    currentUser.set({ id: 'user-2' });

    try {
      await until(() => notes.pendingCount() === 0 && seen.length === 0, 'settled for user 2');
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(seen).not.toContain('private of user 1');
      expect(notes.records()).toEqual([]);
    } finally {
      stop();
    }
  });

  it('never shows the previous user’s records before the user change reached the instance', async () => {
    const first = mount({ auto: false });
    await first.create({ title: 'private of user 1' });
    unmount();

    // Hold back change detection, which runs effects: the instance learns of the new user only by reading it
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const seen: string[] = [];
    let stop: () => void = () => undefined;
    try {
      const notes = mount({ auto: false });
      stop = recordValues(notes.records, (records) => seen.push(...records.map((record) => record.data?.title ?? '')));
      currentUser.set({ id: 'user-2' });

      // The start-up read finishes while its effect still waits: it must claim for user 2, not show user 1's note
      await settle();
      expect(seen).not.toContain('private of user 1');
      expect(notes.records()).toEqual([]);

      await vi.runOnlyPendingTimersAsync();
      await settle();
      expect(seen).not.toContain('private of user 1');
      expect(notes.records()).toEqual([]);
    } finally {
      stop();
      vi.useRealTimers();
    }
  });

  it('shows nothing and refuses changes while nobody is signed in', async () => {
    currentUser.set(null);
    const notes = mount({ auto: false });

    await expect(notes.create({ title: 'A' })).rejects.toThrow(/no signed-in user/);
    await expect(notes.update('6720c0aaaaaaaaaaaaaaaaaa', { title: 'B' })).rejects.toThrow(/no signed-in user/);
    await expect(notes.remove('6720c0aaaaaaaaaaaaaaaaaa')).rejects.toThrow(/no signed-in user/);
    expect(await notes.sync()).toMatchObject({ needsLogin: true });
    expect(notes.needsLogin()).toBe(true);
    expect(notes.records()).toEqual([]);
  });

  it('keeps the data when the same user signs in again after the session ended', async () => {
    const notes = mount({ auto: false });
    await notes.create({ title: 'kept' });

    currentUser.set(null);
    await until(() => notes.records().length === 0);
    currentUser.set({ id: 'user-1' });
    await until(() => notes.records().length === 1, 'kept for the same user');
    expect(notes.pendingCount()).toBe(1);
  });

  it('keeps each tenant’s records and unsent changes to that tenant', async () => {
    const tenantA = mount({ auto: false, tenantId: 'tenant-a' });
    const tenantB = mount({ auto: false, tenantId: 'tenant-b' });
    await tenantA.create({ title: 'internal note of tenant a' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(tenantB.records()).toEqual([]);
    expect(tenantB.pendingCount()).toBe(0);
    // The server stamps a create into the tenant of its header: B must not send A's note
    await tenantB.sync();
    expect(server.pushes()).toEqual([]);
    await tenantA.sync();
    expect(server.pushes().map((request) => request.headers['x-tenant-id'])).toEqual(['tenant-a']);
  });

  it('empties when another tab deletes the database (sign-out there)', async () => {
    const notes = mount({ auto: false });
    await notes.create({ title: 'A' });

    await deleteLtSyncDatabase();
    await until(() => notes.records().length === 0, 'cleared by the other tab');
  });
});

describe('injectLtOfflineSync — tabs and hints', () => {
  it('shows a change made in another tab', async () => {
    const tabA = mount({ auto: false });
    const tabB = mount({ auto: false });
    // Let both finish their start-up read, or B's first read would see A's record by itself
    await tabB.get('none');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(tabB.records()).toEqual([]);

    await tabA.create({ title: 'from A' });
    await until(() => tabB.records().length === 1, 'B refreshed');
    expect(titles(tabB)).toEqual(['from A']);
  });

  it('pulls on a hint and again on every reconnect of the stream', async () => {
    server.hintsEnabled = true;
    const notes = mount();
    await until(() => server.openHintStreams() === 1, 'stream open');
    const pullsAfterStart = server.pulls().length;

    server.write('6720c0aaaaaaaaaaaaaaaaad', { title: 'hinted' });
    server.hint('note');
    await until(() => notes.records().length === 1, 'pulled on hint');

    // The planned end of a stream: the hint sent in between is never replayed, so the reconnect pulls
    server.write('6720c0aaaaaaaaaaaaaaaaae', { title: 'missed hint' });
    const pullsBefore = server.pulls().length;
    server.endHintStreams();
    await until(() => notes.records().length === 2, 'pulled on reconnect');
    expect(server.pulls().length).toBeGreaterThan(pullsBefore);
    expect(pullsBefore).toBeGreaterThan(pullsAfterStart);
  });

  it('shares one stream between every instance on the page', async () => {
    server.hintsEnabled = true;
    mount();
    mount();
    mount({}, 'task');

    await until(
      () =>
        server.requests
          .filter((request) => request.url.pathname.endsWith('/hints'))
          .at(-1)
          ?.url.searchParams.get('models') === 'note,task',
    );
    await until(() => server.openHintStreams() === 1, 'one stream left open');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(server.openHintStreams()).toBe(1);
  });

  it('closes the stream when the injection context is destroyed', async () => {
    server.hintsEnabled = true;
    mount();
    await until(() => server.openHintStreams() === 1);

    unmount();
    await until(() => server.openHintStreams() === 0, 'stream closed');
  });

  it('closes the stream while the tab is hidden and pulls when it is visible again', async () => {
    server.hintsEnabled = true;
    const notes = mount();
    await until(() => server.openHintStreams() === 1, 'stream open');

    setVisibility('hidden');
    await until(() => server.openHintStreams() === 0, 'closed while hidden');
    server.write('6720c0aaaaaaaaaaaaaaaaaf', { title: 'while hidden' });

    setVisibility('visible');
    await until(() => server.openHintStreams() === 1, 'reopened');
    await until(() => notes.records().length === 1, 'pulled on return');
  });

  it('opens no stream with `hints: false`', async () => {
    server.hintsEnabled = true;
    const notes = mount({ hints: false });
    await until(() => notes.lastSyncedAt() !== null);
    expect(server.requests.some((request) => request.url.pathname.endsWith('/hints'))).toBe(false);
  });
});

describe('injectLtOfflineSync — backoff', () => {
  it('waits 1 s after a failed sync and doubles the wait up to 60 s', async () => {
    // Only the timers are fake: IndexedDB (fake-indexeddb) answers on `setImmediate`, which keeps running
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      server.online = false;
      mount({ hints: false });
      await settle();
      expect(server.pulls()).toHaveLength(1);

      const waits: number[] = [];
      for (let attempt = 0; attempt < 8; attempt++) {
        const before = server.pulls().length;
        let waited = 0;
        while (server.pulls().length === before && waited < 120_000) {
          await vi.advanceTimersByTimeAsync(500);
          waited += 500;
          await settle();
        }
        waits.push(waited);
      }
      // Measured in 500 ms steps; under load an IndexedDB callback can land one step late, so allow exactly one step.
      const expected = [1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000];
      waits.forEach((wait, index) => {
        expect(wait).toBeGreaterThanOrEqual(expected[index] ?? 0);
        expect(wait).toBeLessThanOrEqual((expected[index] ?? 0) + 500);
      });
    } finally {
      vi.useRealTimers();
    }
    // Simulates about two minutes in 500 ms steps with real IndexedDB callbacks: on a loaded machine that takes
    // longer than the default 5 s test timeout.
  }, 30_000);
});

describe('injectLtOfflineSync — server-side rendering', () => {
  it('renders an empty list and touches no storage', async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const notes = mount();

    expect(notes.records()).toEqual([]);
    await expect(notes.create({ title: 'A' })).rejects.toThrow(/browser only/);
    await expect(notes.update('x', { title: 'B' })).rejects.toThrow(/browser only/);
    await expect(notes.remove('x')).rejects.toThrow(/browser only/);
    expect(await notes.get('x')).toBeUndefined();
    expect(await notes.sync()).toMatchObject({ applied: 0 });
    expect(server.requests).toEqual([]);
  });

  it('must be called in an injection context', () => {
    expect(() => injectLtOfflineSync('note')).toThrow(/injection context/);
  });
});
