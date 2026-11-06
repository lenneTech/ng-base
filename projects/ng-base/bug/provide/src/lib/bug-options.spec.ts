import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';

import { isLtBugActive, LT_BUG_ACTIVE, LT_BUG_DEV_MODE } from './bug-options';
import { provideLtBug } from './provide-lt-bug';

describe('bug options — runtime decision', () => {
  it('isLtBugActive: an explicit enabled wins over app env and dev mode', () => {
    expect(isLtBugActive({ enabled: true }, 'production', false)).toBe(true);
    expect(isLtBugActive({ enabled: false }, 'development', true)).toBe(false);
  });

  it('isLtBugActive: off for app env production / prod, on for every other app env', () => {
    expect(isLtBugActive({}, 'production', true)).toBe(false);
    expect(isLtBugActive({}, ' Production ', true)).toBe(false);
    expect(isLtBugActive({}, 'prod', true)).toBe(false);
    for (const env of ['local', 'development', 'test', 'staging']) {
      expect(isLtBugActive({}, env, false), env).toBe(true);
    }
  });

  it('isLtBugActive fails closed: without app env only in dev mode', () => {
    for (const env of [undefined, null, '', '   ']) {
      expect(isLtBugActive({}, env, false), String(env)).toBe(false);
      expect(isLtBugActive({}, env, true), String(env)).toBe(true);
    }
  });
});

describe('LT_BUG_ACTIVE', () => {
  afterEach(() => TestBed.resetTestingModule());

  function active(options: { appEnv?: string; bug?: Parameters<typeof provideLtBug>[0] | null; platform?: 'browser' | 'server' } = {}): boolean {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: options.platform ?? 'browser' },
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { appEnv: options.appEnv }) },
        { provide: LT_BUG_DEV_MODE, useValue: false },
        ...(options.bug === null ? [] : [provideLtBug(options.bug ?? {})]),
      ],
    });
    return TestBed.inject(LT_BUG_ACTIVE);
  }

  it('is on outside production, off in production, without app env and without provideLtBug()', () => {
    expect(active({ appEnv: 'develop' })).toBe(true);
    TestBed.resetTestingModule();
    expect(active({ appEnv: 'production' })).toBe(false);
    TestBed.resetTestingModule();
    expect(active({})).toBe(false);
    TestBed.resetTestingModule();
    expect(active({ appEnv: 'develop', bug: null })).toBe(false);
    TestBed.resetTestingModule();
    expect(active({ appEnv: 'production', bug: { enabled: true } })).toBe(true);
  });

  it('follows NG_PUBLIC_LT_BUG_ENABLED (runtime lt.bug.enabled) over the code option', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { appEnv: 'production', lt: { bug: { enabled: true } } }) },
        { provide: LT_BUG_DEV_MODE, useValue: false },
        provideLtBug({ enabled: false }),
      ],
    });
    expect(TestBed.inject(LT_BUG_ACTIVE)).toBe(true);
  });

  it('is the same on the server, so an @if around the deferred button hydrates without mismatch', () => {
    expect(active({ appEnv: 'test', platform: 'server' })).toBe(true);
  });
});
