import { isPlatformBrowser } from '@angular/common';
import { computed, inject, InjectionToken, PLATFORM_ID, Service, signal, type Signal } from '@angular/core';

import de from './i18n/de.json';
import en from './i18n/en.json';

/** Nested message tree as in the shipped `i18n/de.json` / `i18n/en.json`. */
export interface LtI18nMessages {
  [key: string]: LtI18nMessages | string;
}

/**
 * Bridge to the app's translation library (Transloco, ngx-translate, …).
 *
 * Bind it when the app already has an i18n setup, so library texts follow the app language and can be overridden
 * in the app's own translation files (keys `lt.error.*` of the core and `lt.<entry>.*` of the entry points: `lt.auth.*`,
 * `lt.files.*`, `lt.share.*`, `lt.ui.*`, `lt.bug.*`; shipped as `i18n/{de,en}.json` and `i18n/<entry>/{de,en}.json`).
 *
 * @example Transloco
 * { provide: LT_I18N_ADAPTER, useFactory: () => {
 *   const transloco = inject(TranslocoService);
 *   const lang = toSignal(transloco.langChanges$, { initialValue: transloco.getActiveLang() });
 *   return { locale: lang, translate: (key, params) => transloco.translate(key, params) };
 * } }
 */
export interface LtI18nAdapter {
  /** Active locale (`de`, `en`, …). */
  readonly locale: Signal<string>;
  /** Translate a key; return `null` (or the key itself) when the app has no translation, then the library text is used. */
  translate(key: string, params?: Record<string, unknown>): string | null;
}

/** Optional adapter to the app's i18n library. */
export const LT_I18N_ADAPTER = new InjectionToken<LtI18nAdapter>('LT_I18N_ADAPTER');

/** Options of the built-in i18n (part of `provideLtNgBase({ i18n })`). */
export interface LtI18nOptions {
  /** Locale used when neither the adapter nor the browser language (de/en) decides. Default `de`. */
  defaultLocale?: string;
  /** Additional or overriding messages per locale, merged over the shipped de/en texts. */
  messages?: Record<string, LtI18nMessages>;
}

/** i18n options token (set by `provideLtNgBase`). */
export const LT_I18N_OPTIONS = new InjectionToken<LtI18nOptions>('LT_I18N_OPTIONS', { factory: () => ({}) });

/** The core's shipped messages (`lt.error.*`); the entry points register theirs with `registerLibraryMessages()`. */
export const LT_I18N_MESSAGES: Readonly<Record<'de' | 'en', LtI18nMessages>> = { de, en };

/**
 * Signal-based translations for library texts, with an optional adapter to the app's i18n library.
 *
 * Lookup order for `t(key)`: adapter → messages of the active locale → German messages → the key.
 * Locale order: adapter → `setLocale()` → browser language (de/en, browser only) → `defaultLocale` → `de`.
 */
@Service()
export class LtI18nService {
  private readonly adapter = inject(LT_I18N_ADAPTER, { optional: true });
  private readonly options = inject(LT_I18N_OPTIONS);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly explicitLocale = signal<string | null>(null);
  private readonly extraMessages = signal<Record<string, LtI18nMessages>>(this.options.messages ?? {});
  /**
   * Texts of the entry points (`lt.ui.*`, `lt.auth.*` …) registered by {@link registerLibraryMessages}. A plain object:
   * every entry registers its texts before its own components read them, so nothing has to react to a registration.
   */
  private readonly libraryMessages: Record<string, LtI18nMessages> = {};
  private readonly libraryIds = new Set<string>();

  /** Active locale. */
  readonly locale = computed(() => this.adapter?.locale() || this.explicitLocale() || this.detectBrowserLocale() || this.options.defaultLocale || 'de');

  /** Set the locale (ignored for lookups while an adapter provides one). */
  setLocale(locale: string): void {
    this.explicitLocale.set(locale);
  }

  /** Merge messages for a locale over the shipped ones. */
  registerMessages(locale: string, messages: LtI18nMessages): void {
    this.extraMessages.update((current) => ({ ...current, [locale]: deepMerge(current[locale] ?? {}, messages) }));
  }

  /**
   * Register the default texts of an entry point once per `id` (`ui`, `auth`, `files` …). They rank below the app's
   * own texts (`provideLtNgBase({ i18n: { messages } })`, `registerMessages()`, the adapter), like the shipped core
   * texts. Entry points call it when they are first used (synchronously, on the server and in the browser alike), so
   * their texts travel with their code instead of the initial bundle.
   */
  registerLibraryMessages(id: string, messages: Readonly<Record<string, LtI18nMessages>>): void {
    if (this.libraryIds.has(id)) {
      return;
    }
    this.libraryIds.add(id);
    for (const [locale, tree] of Object.entries(messages)) {
      this.libraryMessages[locale] = deepMerge(this.libraryMessages[locale] ?? {}, tree);
    }
  }

  /** Translate `key`, interpolating `{name}` placeholders from `params`. */
  t(key: string, params?: Record<string, unknown>): string {
    const fromAdapter = this.adapter?.translate(key, params);
    if (fromAdapter && fromAdapter !== key) {
      return fromAdapter;
    }
    const locale = this.locale();
    const message =
      lookup(this.extraMessages()[locale], key) ??
      lookup((LT_I18N_MESSAGES as Record<string, LtI18nMessages>)[locale], key) ??
      lookup(this.libraryMessages[locale], key) ??
      lookup(this.extraMessages()['de'], key) ??
      lookup(LT_I18N_MESSAGES.de, key) ??
      lookup(this.libraryMessages['de'], key) ??
      key;
    return interpolate(message, params);
  }

  private detectBrowserLocale(): string | null {
    if (!this.isBrowser || typeof navigator === 'undefined' || !navigator.language) {
      return null;
    }
    const language = navigator.language.split('-')[0]?.toLowerCase() ?? '';
    return language === 'de' || language === 'en' ? language : null;
  }
}

function lookup(messages: LtI18nMessages | undefined, key: string): string | null {
  let node: LtI18nMessages | string | undefined = messages;
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string') {
      return null;
    }
    node = node[part];
  }
  return typeof node === 'string' ? node : null;
}

function interpolate(message: string, params?: Record<string, unknown>): string {
  if (!params) {
    return message;
  }
  return message.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

function deepMerge(target: LtI18nMessages, source: LtI18nMessages): LtI18nMessages {
  const result: LtI18nMessages = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const current = result[key];
    result[key] = typeof value === 'object' && typeof current === 'object' ? deepMerge(current, value) : value;
  }
  return result;
}
