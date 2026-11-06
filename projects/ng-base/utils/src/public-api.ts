/*
 * Public API of `@lenne.tech/ng-base/utils` (no nest-server needed): SEO tags, prefixed storage, scrolling,
 * form helpers and model mapping (`LtStandard`).
 */
export { ltFirstInvalidControl, ltFocusFirstInvalid } from './lib/forms';
export { ltDeepFreeze, ltDelay, ltGetDiff, ltIsEqual, ltMap, ltSlug, LtStandard, ltUid } from './lib/mapping';
export type { LtMapOptions } from './lib/mapping';
export { LtScrollService } from './lib/scroll-service';
export type { LtScrollOptions } from './lib/scroll-service';
export { LtSeoService } from './lib/seo-service';
export type { LtSeoData } from './lib/seo-service';
export { LtStorageService } from './lib/storage-service';
