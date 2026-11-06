import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';

import { LT_BUG_INPUT_OPTIONS } from './bug-options';
import type { LtBugOptions } from './bug-types';

/**
 * Opt-in bug reporter (the Angular counterpart of the `@lenne.tech/bug.lt` Nuxt module): captures console output,
 * `fetch`/`XMLHttpRequest` calls, the user journey and errors, and lets the user send a report with screenshot to
 * Linear through `ltBugReport()` from `@lenne.tech/ng-base/bug/server`.
 *
 * Active only when the app env (`LT_RUNTIME_CONFIG.appEnv`, `NG_PUBLIC_APP_ENV`) is not `production`, decided at
 * runtime so one image serves every stage; without an app env only in dev mode (a production build fails closed).
 * `enabled` (or `NG_PUBLIC_LT_BUG_ENABLED`) overrides the decision.
 *
 * This provider carries only the options: nothing of the reporter is in the initial bundle. `<lt-bug-report>` (from
 * `@lenne.tech/ng-base/bug`) starts the capture when it is created, so render it deferred and only while
 * {@link LT_BUG_ACTIVE} is `true`: production then never loads the reporter, the other stages start capturing right
 * after the first render (`on immediate`).
 *
 * @example app.config.ts
 * import { provideLtBug } from '@lenne.tech/ng-base/bug/provide';
 * providers: [provideLtNgBase(), provideLtUi(), provideLtBug({ autoOpenOnError: true })]
 *
 * @example app.ts / app.html
 * protected readonly bugActive = inject(LT_BUG_ACTIVE);
 * @if (bugActive) { @defer (on immediate) { <lt-bug-report /> } }
 */
export function provideLtBug(options: LtBugOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: LT_BUG_INPUT_OPTIONS, useValue: options }]);
}
