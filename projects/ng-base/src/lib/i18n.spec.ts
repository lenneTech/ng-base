import { TestBed } from '@angular/core/testing';

import { LT_I18N_MESSAGES, LT_I18N_OPTIONS, LtI18nService } from './i18n';

describe('LtI18nService — library texts of the entry points', () => {
  afterEach(() => TestBed.resetTestingModule());

  const UI = { de: { lt: { ui: { close: 'Schließen', only: 'nur deutsch' } } }, en: { lt: { ui: { close: 'Close' } } } };

  it('the core ships only lt.error; the entry points bring their own texts', () => {
    expect(Object.keys(LT_I18N_MESSAGES.de['lt'] as object)).toEqual(['error']);
    expect(Object.keys(LT_I18N_MESSAGES.en['lt'] as object)).toEqual(['error']);
  });

  it('answers registered texts in the active locale, falls back to German, else the key', () => {
    const i18n = TestBed.inject(LtI18nService);
    i18n.setLocale('en');
    expect(i18n.t('lt.ui.close')).toBe('lt.ui.close');
    i18n.registerLibraryMessages('ui', UI);
    expect(i18n.t('lt.ui.close')).toBe('Close');
    expect(i18n.t('lt.ui.only')).toBe('nur deutsch');
    expect(i18n.t('lt.ui.missing')).toBe('lt.ui.missing');
  });

  it('ranks them below the app texts, whenever the app registers its own', () => {
    TestBed.configureTestingModule({ providers: [{ provide: LT_I18N_OPTIONS, useValue: { messages: { de: { lt: { ui: { close: 'Zumachen' } } } } } }] });
    const i18n = TestBed.inject(LtI18nService);
    i18n.setLocale('de');
    i18n.registerLibraryMessages('ui', UI);
    expect(i18n.t('lt.ui.close')).toBe('Zumachen');
    i18n.registerMessages('de', { lt: { ui: { only: 'App-Text' } } });
    expect(i18n.t('lt.ui.only')).toBe('App-Text');
  });

  it('registers each entry once (a later call with the same id changes nothing)', () => {
    const i18n = TestBed.inject(LtI18nService);
    i18n.setLocale('de');
    i18n.registerLibraryMessages('ui', UI);
    i18n.registerLibraryMessages('ui', { de: { lt: { ui: { close: 'anders' } } } });
    expect(i18n.t('lt.ui.close')).toBe('Schließen');
  });
});
