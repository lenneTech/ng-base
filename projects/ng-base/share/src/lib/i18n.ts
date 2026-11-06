import { inject } from '@angular/core';
import { LtI18nService } from '@lenne.tech/ng-base';

import de from './i18n/de.json';
import en from './i18n/en.json';

/** The `lt.share.*` texts (also shipped as `i18n/share/{de,en}.json`). */
export const LT_SHARE_MESSAGES = { de, en } as const;

/** `LtI18nService` with the `lt.share.*` texts registered (injection context). */
export function injectLtShareI18n(): LtI18nService {
  const i18n = inject(LtI18nService);
  i18n.registerLibraryMessages('share', LT_SHARE_MESSAGES);
  return i18n;
}
