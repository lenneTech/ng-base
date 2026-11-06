import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LT_I18N_ADAPTER, LT_I18N_MESSAGES, LtI18nService, type LtI18nMessages } from '@lenne.tech/ng-base';

import de from './de.json';
import en from './en.json';
import { LT_BUG_EAGER_MESSAGES, loadLtBugMessages, registerLtBugEagerMessages } from './load';
import { registerLtBugMessages } from './messages';

/** Every leaf key of a message tree (`lt.bug.types.bug` …). */
function keys(tree: LtI18nMessages, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => (typeof value === 'string' ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`)));
}

function leaf(tree: LtI18nMessages, path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as LtI18nMessages)[part] : undefined), tree);
}

describe('bug reporter texts', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('are not part of the core messages (no eager lt.bug in every app)', () => {
    expect(leaf(LT_I18N_MESSAGES.de, 'lt.bug')).toBeUndefined();
    expect(leaf(LT_I18N_MESSAGES.en, 'lt.bug')).toBeUndefined();
  });

  it('have the same keys in de and en, and the eager button texts equal the JSON files', () => {
    expect(keys(en).sort()).toEqual(keys(de).sort());
    expect(keys(de).length).toBeGreaterThan(50);
    for (const [locale, messages] of Object.entries(LT_BUG_EAGER_MESSAGES)) {
      for (const key of keys(messages)) {
        expect(leaf(messages, key), `${locale} ${key}`).toBe(leaf(locale === 'de' ? de : en, key));
      }
    }
  });

  it('are available after registration, in both languages', () => {
    const i18n = TestBed.inject(LtI18nService);
    i18n.setLocale('de');
    expect(i18n.t('lt.bug.submit')).toBe('lt.bug.submit');
    registerLtBugMessages(i18n);
    expect(i18n.t('lt.bug.submit')).toBe('Senden');
    expect(i18n.t('lt.bug.types.enhancement')).toBe('Verbesserung');
    i18n.setLocale('en');
    expect(i18n.t('lt.bug.submit')).toBe('Send');
  });

  it('register the button texts eagerly and the rest lazily (once per service)', async () => {
    const i18n = TestBed.inject(LtI18nService);
    i18n.setLocale('de');
    registerLtBugEagerMessages(i18n);
    expect(i18n.t('lt.bug.button')).toBe('Fehler melden');
    expect(i18n.t('lt.bug.successTitle')).toBe('lt.bug.successTitle');
    await loadLtBugMessages(i18n);
    await loadLtBugMessages(i18n);
    expect(i18n.t('lt.bug.successTitle')).toBe('Fehlerbericht gesendet');
  });

  it('keep texts the app configured and let an app adapter override them', () => {
    const i18n = TestBed.inject(LtI18nService);
    i18n.setLocale('de');
    const appMessages = { de: { lt: { bug: { button: 'Problem melden', submit: 'Abschicken' } } } };
    registerLtBugEagerMessages(i18n, appMessages);
    registerLtBugMessages(i18n, appMessages);
    expect(i18n.t('lt.bug.button')).toBe('Problem melden');
    expect(i18n.t('lt.bug.submit')).toBe('Abschicken');
    expect(i18n.t('lt.bug.cancel')).toBe('Abbrechen');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: LT_I18N_ADAPTER, useValue: { locale: signal('de'), translate: (key: string) => (key === 'lt.bug.submit' ? 'Via Adapter' : null) } }],
    });
    const adapted = TestBed.inject(LtI18nService);
    registerLtBugMessages(adapted);
    expect(adapted.t('lt.bug.submit')).toBe('Via Adapter');
    expect(adapted.t('lt.bug.cancel')).toBe('Abbrechen');
  });
});
