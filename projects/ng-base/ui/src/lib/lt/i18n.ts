import { inject } from '@angular/core';
import { LtI18nService } from '@lenne.tech/ng-base';

import de from '../i18n/de.json';
import en from '../i18n/en.json';

/** The `lt.ui.*` texts (also shipped as `i18n/ui/{de,en}.json`). */
export const LT_UI_MESSAGES = { de, en } as const;

/** `LtI18nService` with the `lt.ui.*` texts registered; for the ui components and services (injection context). */
export function injectLtUiI18n(): LtI18nService {
  const i18n = inject(LtI18nService);
  i18n.registerLibraryMessages('ui', LT_UI_MESSAGES);
  return i18n;
}
