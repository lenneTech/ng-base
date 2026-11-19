/**
 * An inline image (a `data:` URL) on the user is never kept in the auth state.
 *
 * Better Auth's Microsoft provider stores the user's 48x48 profile photo as a `data:image/jpeg;base64,…` URL in
 * `user.image` unless the API sets `disableProfilePhoto` (`@better-auth/core`, `social-providers/microsoft-entra-id`).
 * After a social sign-in the app calls `validateSession()`, and `setUser()` wrote the whole user into the
 * `lt-auth-state` cookie. A browser drops a cookie whose name and value exceed 4096 bytes, without an error: the session
 * was valid, but the next page load found no auth state, `ltAuthGuard` sent the user to the login page, and a login page
 * with a silent sign-in looped through app, API and provider.
 *
 * So every writer of the auth state leaves such an image out, whatever its size, and a reader never hands on one an
 * earlier version stored. An `http(s)` URL or a path stays. happy-dom keeps cookies of any size, so these tests emulate
 * the browser's limit and record every string written to `document.cookie`.
 */
import { PLATFORM_ID, REQUEST } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';

import { LT_AUTH_INPUT_OPTIONS } from './auth-options';
import { LtAuthStateService } from './auth-state';
import { LtAuthStore } from './auth-store';

/** A browser keeps a cookie only while its name and value together stay within 4096 bytes. */
const BROWSER_COOKIE_LIMIT = 4096;
const API = 'https://api.example.com';
const IAM = `${API}/iam`;
const JWT = 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiI2YTFmIn0.c2lnbmF0dXJl';

/** A user as Better Auth's session answer carries it after a sign-in through Microsoft Entra ID. */
const ENTRA_USER = {
  createdAt: '2026-11-18T16:00:00.000Z',
  email: 'erika.mustermann@example.com',
  emailVerified: true,
  id: '6a1f3c2e9b8d7f0011223344',
  name: 'Erika Mustermann',
  roles: [],
  updatedAt: '2026-11-18T16:00:00.000Z',
};

/** A JPEG of `bytes` bytes as a `data:` URL, the way Better Auth's Microsoft provider stores the photo. */
function inlinePhoto(bytes: number): string {
  const jpegStart = [0xff, 0xd8, 0xff, 0xe0];
  const raw = Array.from({ length: bytes }, (_, index) => String.fromCharCode(jpegStart[index] ?? (index * 37 + 11) % 256)).join('');
  return `data:image/jpeg;base64,${btoa(raw)}`;
}

/** About 3 KB as a URL. */
const PHOTO = inlinePhoto(2250);
/** A photo whose cookie a browser drops: the URL alone is above the limit once encoded. */
const PHOTO_OVER_LIMIT = inlinePhoto(3000);
/** A photo small enough that a cookie written by an earlier version survived in the browser. */
const LEGACY_PHOTO = inlinePhoto(900);
/** A cookie an earlier version wrote while the photo was small enough to survive. */
const LEGACY_STATE = { authMode: 'cookie', user: { ...ENTRA_USER, image: LEGACY_PHOTO } };

type Route = (url: string) => Response;
let route: Route;
/** Every string written to `document.cookie` in this test, in order. */
let written: string[] = [];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
const flush = async () => {
  for (let index = 0; index < 10; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

/** Records every cookie string written and drops one a browser would drop. Undone by {@link restoreDocumentCookie}. */
function emulateBrowserCookieLimit(): void {
  let owner: object | null = document;
  let native: PropertyDescriptor | undefined;
  while (owner && !native) {
    native = Object.getOwnPropertyDescriptor(owner, 'cookie');
    owner = Object.getPrototypeOf(owner) as object | null;
  }
  if (!native?.get || !native.set) {
    throw new Error('document.cookie has no accessor to wrap');
  }
  const { get, set } = native;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => get.call(document) as string,
    set: (value: string) => {
      written.push(value);
      if (new TextEncoder().encode(value.split(';')[0] ?? '').length > BROWSER_COOKIE_LIMIT) {
        return;
      }
      set.call(document, value);
    },
  });
}

function restoreDocumentCookie(): void {
  Reflect.deleteProperty(document, 'cookie');
}

function clearCookies(): void {
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; path=/; max-age=0`;
      document.cookie = `${name}=; path=/; domain=${location.hostname}; max-age=0`;
    }
  }
}

function storeCookie(state: unknown): void {
  document.cookie = `lt-auth-state=${encodeURIComponent(JSON.stringify(state))}; path=/`;
}

/** The `lt-auth-state` value the last write put into `document.cookie`, still encoded. */
function lastWrittenAuthState(): string | undefined {
  const entry = written.filter((cookie) => cookie.startsWith('lt-auth-state=')).at(-1);
  return entry?.split(';')[0]?.slice('lt-auth-state='.length);
}

function decode(encoded: string | undefined): { authMode?: string; user?: Record<string, unknown> | null } | null {
  return encoded === undefined ? null : JSON.parse(decodeURIComponent(encoded));
}

/** What the browser kept: the `lt-auth-state` cookie a reload reads. */
function keptAuthState(): { authMode?: string; user?: Record<string, unknown> | null } | null {
  const raw = document.cookie
    .split(/;\s*/)
    .find((entry) => entry.startsWith('lt-auth-state='))
    ?.slice('lt-auth-state='.length);
  return raw ? JSON.parse(decodeURIComponent(raw)) : null;
}

function configure(platform: 'browser' | 'server' = 'browser'): void {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: platform },
      { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: API }) },
      { provide: LT_AUTH_INPUT_OPTIONS, useValue: {} },
      { provide: REQUEST, useValue: { headers: { get: () => null } } },
    ],
  });
}

function store(platform: 'browser' | 'server' = 'browser'): LtAuthStore {
  configure(platform);
  return TestBed.inject(LtAuthStore);
}

/** The next page load: a fresh app that knows only what the browser kept. */
function reload(): LtAuthStore {
  TestBed.resetTestingModule();
  return store();
}

beforeEach(() => {
  clearCookies();
  written = [];
  // The JWT prefetch after a sign-in stays in cookie mode unless a test answers with a JWT.
  route = () => json({}, 401);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => route(String(input instanceof Request ? input.url : input))),
  );
  emulateBrowserCookieLimit();
});

afterEach(async () => {
  await flush();
  restoreDocumentCookie();
  clearCookies();
  vi.unstubAllGlobals();
});

describe('setUser() leaves an inline image out of the auth state', () => {
  it('writes the cookie without a data: image, keeps every other field, and user() is the stored user', () => {
    const auth = store();

    auth.setUser({ ...ENTRA_USER, image: PHOTO });

    const encoded = lastWrittenAuthState();
    expect(encoded).toBeDefined();
    expect(encoded!.length).toBeLessThan(1024);
    const stored = decode(encoded);
    expect(stored?.user).not.toHaveProperty('image');
    expect(stored).toEqual({ authMode: 'cookie', user: ENTRA_USER });
    expect(keptAuthState()?.user).toEqual(ENTRA_USER);
    expect(auth.user()).toEqual(ENTRA_USER);
    expect(auth.user()?.image).toBeUndefined();
  });

  it.each([
    ['upper case', `DATA:${PHOTO.slice('data:'.length)}`],
    ['mixed case', `Data:${PHOTO.slice('data:'.length)}`],
    ['leading whitespace', ` \n\t${PHOTO}`],
    ['another media type', 'data:image/png;base64,iVBORw0KGgo='],
  ])('leaves out a data: URL in %s', (_label, image) => {
    const auth = store();

    auth.setUser({ ...ENTRA_USER, image });

    expect(decode(lastWrittenAuthState())?.user).not.toHaveProperty('image');
    expect(auth.user()?.image).toBeUndefined();
  });

  it.each([
    ['an https URL', 'https://graph.microsoft.com/v1.0/me/photos/48x48/$value'],
    ['an http URL', 'http://localhost:3000/files/avatar.jpg'],
    ['a path', '/files/6a1f3c2e9b8d7f0011223344/avatar.jpg'],
    ['a URL that only mentions data:', 'https://cdn.example.com/data:avatar.jpg'],
  ])('keeps %s unchanged', (_label, image) => {
    const auth = store();

    auth.setUser({ ...ENTRA_USER, image });

    expect(decode(lastWrittenAuthState())?.user?.['image']).toBe(image);
    expect(auth.user()?.image).toBe(image);
  });

  it('still stores image: null as no image', () => {
    const auth = store();

    auth.setUser({ ...ENTRA_USER, image: null });

    expect(decode(lastWrittenAuthState())?.user).not.toHaveProperty('image');
    expect(auth.user()?.image).toBeUndefined();
  });

  it('matches only strings: a value that is not a string passes as before', () => {
    const auth = store();
    // An array whose string form is a data: URL, so only the type check tells it apart.
    const image = ['data:image/png;base64,iVBORw0KGgo='];

    auth.setUser({ ...ENTRA_USER, image } as unknown as Parameters<LtAuthStore['setUser']>[0]);

    expect(decode(lastWrittenAuthState())?.user?.['image']).toEqual(image);
  });

  it('leaves it out of the user signal during SSR too, where nothing is written', () => {
    const auth = store('server');

    auth.setUser({ ...ENTRA_USER, image: PHOTO });

    expect(auth.user()).toEqual(ENTRA_USER);
    expect(written).toEqual([]);
  });
});

describe('validateSession() after a sign-in through Microsoft Entra ID', () => {
  it('ends with a stored auth state that survives a reload, and the user signed in', async () => {
    // Without the rule this photo alone pushes the cookie over the limit, and the browser drops it.
    expect(encodeURIComponent(PHOTO_OVER_LIMIT).length).toBeGreaterThan(BROWSER_COOKIE_LIMIT);
    route = (url) => (url === `${IAM}/get-session` ? json({ session: { id: 's1' }, user: { ...ENTRA_USER, image: PHOTO_OVER_LIMIT } }) : json({}, 401));
    const auth = store();

    expect(await auth.validateSession()).toBe(true);

    expect(auth.isAuthenticated()).toBe(true);
    expect(keptAuthState()?.user).toEqual(ENTRA_USER);
    expect(auth.user()).toEqual(ENTRA_USER);

    await flush();
    const reloaded = reload();
    expect(reloaded.isAuthenticated()).toBe(true);
    expect(reloaded.user()).toEqual(ENTRA_USER);
  });

  it('drops an inline image the merge carries over from the cached user', async () => {
    storeCookie(LEGACY_STATE);
    // The session answer has no `image` key at all, so the merge keeps the cached one.
    route = (url) => (url === `${IAM}/get-session` ? json({ session: { id: 's1' }, user: { ...ENTRA_USER } }) : json({}, 401));
    const auth = store();

    expect(await auth.validateSession()).toBe(true);

    expect(decode(lastWrittenAuthState())?.user).toEqual(ENTRA_USER);
    expect(keptAuthState()?.user).toEqual(ENTRA_USER);
    expect(auth.user()?.image).toBeUndefined();
  });
});

describe('the other readers and writers of the auth state agree', () => {
  it('a cookie an earlier version wrote is read without the inline image', () => {
    storeCookie(LEGACY_STATE);

    const auth = store();

    expect(auth.user()).toEqual(ENTRA_USER);
    expect(TestBed.inject(LtAuthStateService).readUser()).toEqual(ENTRA_USER);
  });

  it('setAuthMode() rewrites the cookie without the inline image and keeps an https image', () => {
    storeCookie(LEGACY_STATE);
    configure();
    const state = TestBed.inject(LtAuthStateService);

    state.setAuthMode('jwt');

    expect(decode(lastWrittenAuthState())).toEqual({ authMode: 'jwt', user: ENTRA_USER });

    const image = 'https://cdn.example.com/avatar.jpg';
    storeCookie({ authMode: 'cookie', user: { ...ENTRA_USER, image } });
    state.setAuthMode('jwt');
    expect(decode(lastWrittenAuthState())?.user?.['image']).toBe(image);
  });

  it('writeState() leaves the inline image out for any caller', () => {
    configure();

    TestBed.inject(LtAuthStateService).writeState({ authMode: 'cookie', user: { ...ENTRA_USER, image: PHOTO } });

    expect(decode(lastWrittenAuthState())).toEqual({ authMode: 'cookie', user: ENTRA_USER });
  });

  it('switchToJwtMode() stores the JWT mode without the inline image', async () => {
    storeCookie(LEGACY_STATE);
    route = (url) => (url === `${IAM}/token` ? json({ token: JWT }) : json({}, 401));
    const auth = store();

    expect(await auth.switchToJwtMode()).toBe(true);

    expect(decode(lastWrittenAuthState())).toEqual({ authMode: 'jwt', user: ENTRA_USER });
  });

  it('the purge of an opaque token in the JWT cookie rewrites the state without the inline image', () => {
    storeCookie({ ...LEGACY_STATE, authMode: 'jwt' });
    document.cookie = 'lt-jwt-token=opaque-session-token; path=/';

    store();

    expect(decode(lastWrittenAuthState())).toEqual({ authMode: 'cookie', user: ENTRA_USER });
  });
});
