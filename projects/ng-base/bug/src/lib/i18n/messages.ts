import type { LtI18nMessages, LtI18nService } from '@lenne.tech/ng-base';

import de from './de.json';
import en from './en.json';

/** The bug reporter's texts (`lt.bug.*`), shipped as `@lenne.tech/ng-base/i18n/bug/{de,en}.json` as well. */
export const LT_BUG_MESSAGES: Readonly<Record<'de' | 'en', LtI18nMessages>> = { de, en };

/**
 * Register the bug reporter's texts with `LtI18nService` (merged; registering twice is harmless). Texts the app passed
 * in `provideLtNgBase({ i18n: { messages } })` keep priority, and an `LT_I18N_ADAPTER` still wins over both.
 *
 * Lives in the lazily loaded part (imported by the dialog and by `loadLtBugMessages()`), so the texts stay out of the
 * initial bundle.
 */
export function registerLtBugMessages(i18n: LtI18nService, appMessages: Record<string, LtI18nMessages> = {}): void {
  for (const [locale, messages] of Object.entries(LT_BUG_MESSAGES)) {
    i18n.registerMessages(locale, ltMergeMessages(messages, appMessages[locale]));
  }
}

/** Deep merge of message trees; `override` wins. */
export function ltMergeMessages(base: LtI18nMessages, override: LtI18nMessages | undefined): LtI18nMessages {
  if (!override) {
    return base;
  }
  const result: LtI18nMessages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] = typeof value === 'object' && typeof current === 'object' ? ltMergeMessages(current, value) : value;
  }
  return result;
}
