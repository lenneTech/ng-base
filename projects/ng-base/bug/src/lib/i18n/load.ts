import type { LtI18nMessages, LtI18nService } from '@lenne.tech/ng-base';

/**
 * The only texts needed before the dialog chunk is loaded: the floating button's label and its busy text. Kept equal to
 * `de.json` / `en.json` (checked by `i18n.spec.ts`).
 */
export const LT_BUG_EAGER_MESSAGES: Readonly<Record<'de' | 'en', LtI18nMessages>> = {
  de: { lt: { bug: { button: 'Fehler melden', capturing: 'Screenshot wird erstellt …' } } },
  en: { lt: { bug: { button: 'Report a bug', capturing: 'Taking screenshot …' } } },
};

const loaded = new WeakSet<LtI18nService>();
let messagesModule: Promise<typeof import('./messages')> | null = null;

/** Register the button texts (synchronously; texts the app configured keep priority). */
export function registerLtBugEagerMessages(i18n: LtI18nService, appMessages: Record<string, LtI18nMessages> = {}): void {
  for (const [locale, messages] of Object.entries(LT_BUG_EAGER_MESSAGES)) {
    const app = appMessages[locale];
    i18n.registerMessages(locale, app ? withAppTexts(messages, app) : messages);
  }
}

/** Load (lazy chunk) and register every `lt.bug.*` text once per `LtI18nService` instance. */
export async function loadLtBugMessages(i18n: LtI18nService, appMessages: Record<string, LtI18nMessages> = {}): Promise<void> {
  if (loaded.has(i18n)) {
    return;
  }
  messagesModule ??= import('./messages');
  try {
    (await messagesModule).registerLtBugMessages(i18n, appMessages);
    loaded.add(i18n);
  } catch {
    // Chunk failed to load: keep the keys, retry on the next call.
    messagesModule = null;
  }
}

function withAppTexts(base: LtI18nMessages, app: LtI18nMessages): LtI18nMessages {
  const result: LtI18nMessages = { ...base };
  for (const [key, value] of Object.entries(app)) {
    const current = result[key];
    if (current === undefined) {
      continue;
    }
    result[key] = typeof value === 'object' && typeof current === 'object' ? withAppTexts(current, value) : value;
  }
  return result;
}
