import { TestBed } from '@angular/core/testing';
import { LT_I18N_MESSAGES, LtI18nService, type LtI18nMessages } from '@lenne.tech/ng-base';

import { injectLtFilesI18n, LT_FILES_MESSAGES } from './i18n';

/** Every leaf key of a message tree. */
function keys(tree: LtI18nMessages, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => (typeof value === 'string' ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`)));
}

describe('lt.files.* texts', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('have the same keys in de and en and are not part of the core messages', () => {
    expect(keys(LT_FILES_MESSAGES.en).sort()).toEqual(keys(LT_FILES_MESSAGES.de).sort());
    expect(keys(LT_FILES_MESSAGES.de).every((key) => key.startsWith('lt.files.'))).toBe(true);
    expect((LT_I18N_MESSAGES.de['lt'] as LtI18nMessages)['files']).toBeUndefined();
  });

  it('are registered by injectLtFilesI18n() (the entry registers them on first use)', () => {
    const [first] = keys(LT_FILES_MESSAGES.de);
    const i18n = TestBed.runInInjectionContext(() => injectLtFilesI18n());
    expect(i18n).toBe(TestBed.inject(LtI18nService));
    i18n.setLocale('de');
    expect(i18n.t(first ?? '')).not.toBe(first);
  });
});
