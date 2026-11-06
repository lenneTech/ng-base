import { inject } from '@angular/core';
import { LtI18nService } from '@lenne.tech/ng-base';

import de from './i18n/de.json';
import en from './i18n/en.json';

/** The `lt.auth.*` texts (also shipped as `i18n/auth/{de,en}.json`). */
export const LT_AUTH_MESSAGES = { de, en } as const;

/** `LtI18nService` with the `lt.auth.*` texts registered (injection context). */
export function injectLtAuthI18n(): LtI18nService {
  const i18n = inject(LtI18nService);
  i18n.registerLibraryMessages('auth', LT_AUTH_MESSAGES);
  return i18n;
}
