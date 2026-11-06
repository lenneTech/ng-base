/*
 * Public API of `@lenne.tech/ng-base/ui/provide`: the UI providers, kept apart from the component barrel so
 * `app.config.ts` does not pull the helm layer into the initial bundle.
 */
export { ltSonnerToastAdapter, provideLtUi } from './lib/provide-lt-ui';
export type { LtUiOptions } from './lib/provide-lt-ui';
export { LT_COLOR_MODE_COOKIE, LT_COLOR_MODE_SCRIPT, LtColorModeService } from './lib/color-mode';
export type { LtColorMode } from './lib/color-mode';
