import { inject } from '@angular/core';
import { LtI18nService } from '@lenne.tech/ng-base';

import de from './i18n/de.json';
import en from './i18n/en.json';

/** The `lt.files.*` texts (also shipped as `i18n/files/{de,en}.json`). */
export const LT_FILES_MESSAGES = { de, en } as const;

/** `LtI18nService` with the `lt.files.*` texts registered (injection context). */
export function injectLtFilesI18n(): LtI18nService {
  const i18n = inject(LtI18nService);
  i18n.registerLibraryMessages('files', LT_FILES_MESSAGES);
  return i18n;
}
