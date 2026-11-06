/*
 * Public API of `@lenne.tech/ng-base/testing`: Playwright helpers for Angular SSR apps (hydration wait via
 * `window.__ltNgBaseHydrated`), input, test data, TOTP and auth helpers. Node / Playwright only.
 */
export { createTestUser, hashTestPassword, loginTestUser, loginTestUserViaApi } from './lib/auth-helpers';
export type { CreatedTestUser, CreateTestUserOptions, LoginTestUserOptions } from './lib/auth-helpers';
export {
  DEFAULT_HYDRATION_TIMEOUT,
  extractTOTPSecret,
  fillInput,
  fillInputs,
  generateRandomString,
  generateTestUser,
  generateTOTP,
  getAllText,
  gotoAndWaitForHydration,
  hasText,
  parseTOTPUrl,
  waitForElement,
  waitForHydration,
  waitForNetworkIdle,
  waitForURLAndHydration,
} from './lib/playwright-helpers';
export type { TestUser } from './lib/playwright-helpers';
