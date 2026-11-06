/// <reference types="node" />
/**
 * Playwright Test Helpers for Angular Applications
 *
 * This module provides reusable test utilities for E2E testing
 * with Playwright in Angular (SSR) projects using @lenne.tech/ng-base.
 *
 * @example
 * ```typescript
 * import {
 *   waitForHydration,
 *   gotoAndWaitForHydration,
 *   fillInput,
 *   generateTestUser,
 *   generateTOTP,
 * } from '@lenne.tech/ng-base/testing';
 *
 * test('my test', async ({ page }) => {
 *   await gotoAndWaitForHydration(page, '/auth/login');
 *   await fillInput(page, 'input[name="email"]', 'test@example.com');
 * });
 * ```
 */

import type { Page } from '@playwright/test';
import * as crypto from 'node:crypto';

// =============================================================================
// Angular Hydration Helpers
// =============================================================================

/**
 * Default timeout for hydration waiting (in milliseconds)
 */
export const DEFAULT_HYDRATION_TIMEOUT = 15000;

/**
 * Wait for Angular hydration to complete
 *
 * `provideLtNgBase()` sets `window.__ltNgBaseHydrated = true` once the app is stable in the browser
 * (`ApplicationRef.whenStable()`), which is after hydration finished. Event replay (`withEventReplay()`) keeps
 * input made before that moment, but assertions on component state are only reliable afterwards.
 *
 * @param page - Playwright page object
 * @param options - Configuration options
 * @param options.timeout - Maximum time to wait (default: 15000ms)
 *
 * @example
 * ```typescript
 * await waitForHydration(page);
 * await page.click('button'); // Now safe to interact
 * ```
 */
export async function waitForHydration(page: Page, options: { timeout?: number } = {}): Promise<void> {
  const timeout = options.timeout ?? DEFAULT_HYDRATION_TIMEOUT;

  await page.waitForFunction(() => (window as unknown as Record<string, unknown>)['__ltNgBaseHydrated'] === true, {
    timeout,
  });
}

/**
 * Navigate to URL and wait for Angular hydration to complete
 *
 * Combines page.goto() with hydration waiting. Use this instead of
 * page.goto() when you need to interact with Vue components immediately.
 *
 * @param page - Playwright page object
 * @param url - URL to navigate to (relative or absolute)
 * @param options - Configuration options
 * @param options.timeout - Maximum time to wait for hydration (default: 15000ms)
 *
 * @example
 * ```typescript
 * await gotoAndWaitForHydration(page, '/auth/login');
 * // Page is now hydrated and ready for interaction
 * ```
 */
export async function gotoAndWaitForHydration(page: Page, url: string, options: { timeout?: number } = {}): Promise<void> {
  await gotoWithAbortRetry(page, url);
  await waitForHydration(page, options);
}

/**
 * `page.goto` that survives the page navigating away on its own while the goto is
 * still pending.
 *
 * Chromium lets a hard navigation the page starts itself (`location.reload()`,
 * `location.href`, `navigateTo(..., { external: true })`) cancel a pending
 * `page.goto` while the page holds user activation, which it does for a few
 * seconds after any Playwright `click()`. A test that clicks a button whose
 * handler reloads the app and then navigates on fails with
 * `page.goto: net::ERR_ABORTED at <url>`. A client-side `navigateTo` (a history
 * push) cancels nothing; without a preceding click, neither does a hard one.
 *
 * Re-issuing the goto is enough: the new navigation in turn cancels the page's
 * still-pending one, so the test lands where it asked to. There is nothing to
 * wait for in between — the competing navigation has not committed yet, so
 * `waitForLoadState('load')` would return at once on the old document.
 *
 * Only `net::ERR_ABORTED` is retried, at most `maxAttempts` times in total; every
 * other error propagates on the first attempt. A 204 response aborts the same way
 * and still fails, only after the retries. Measured in Chromium, the only engine
 * the lt starters test; other engines may word the abort differently.
 */
async function gotoWithAbortRetry(page: Page, url: string, maxAttempts = 3): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= maxAttempts || !message.includes('net::ERR_ABORTED')) {
        throw error;
      }
    }
  }
}

/**
 * Wait for URL navigation and then Angular hydration
 *
 * Use after form submissions or actions that trigger navigation.
 * Ensures both the navigation completes AND the new page is hydrated.
 *
 * @param page - Playwright page object
 * @param url - URL pattern to wait for (string or RegExp)
 * @param options - Configuration options
 * @param options.timeout - Maximum time to wait for URL (default: 30000ms)
 * @param options.hydrationTimeout - Maximum time to wait for hydration (default: 15000ms)
 *
 * @example
 * ```typescript
 * await page.click('button[type="submit"]');
 * await waitForURLAndHydration(page, /\/dashboard/);
 * ```
 */
export async function waitForURLAndHydration(page: Page, url: string | RegExp, options: { timeout?: number; hydrationTimeout?: number } = {}): Promise<void> {
  const { timeout = 30000, hydrationTimeout } = options;

  await page.waitForURL(url, { timeout });
  await waitForHydration(page, { timeout: hydrationTimeout });
}

// =============================================================================
// Vue Input Helpers
// =============================================================================

/**
 * Fill an input field with proper Vue 3 reactivity support
 *
 * Uses keyboard typing instead of Playwright's fill() to properly
 * trigger Vue's v-model updates. This is necessary because fill()
 * sets the value directly without firing input events in some cases.
 *
 * @param page - Playwright page object
 * @param selector - CSS selector for the input element
 * @param value - Value to type into the input
 * @param options - Configuration options
 * @param options.delay - Delay between keystrokes in ms (default: 5)
 * @param options.clear - Whether to clear existing content (default: true)
 *
 * @example
 * ```typescript
 * await fillInput(page, 'input[name="email"]', 'test@example.com');
 * await fillInput(page, '#password', 'secret', { delay: 10 });
 * ```
 */
export async function fillInput(page: Page, selector: string, value: string, options: { delay?: number; clear?: boolean } = {}): Promise<void> {
  const { delay = 5, clear = true } = options;
  const locator = page.locator(selector);

  // Click to focus the input
  await locator.click();

  // Clear existing content if requested
  if (clear) {
    // ControlOrMeta: Cmd+A on macOS, Ctrl+A elsewhere (Control+A only moves the caret on macOS).
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
  }

  // Type the value - real keyboard events, so Angular bindings and Signal Forms see every keystroke
  await page.keyboard.type(value, { delay });
}

/**
 * Fill multiple input fields at once
 *
 * Convenience function for filling multiple form fields.
 *
 * @param page - Playwright page object
 * @param fields - Object mapping selectors to values
 * @param options - Configuration options passed to fillInput
 *
 * @example
 * ```typescript
 * await fillInputs(page, {
 *   'input[name="email"]': 'test@example.com',
 *   'input[name="password"]': 'secret123',
 * });
 * ```
 */
export async function fillInputs(page: Page, fields: Record<string, string>, options: { delay?: number; clear?: boolean } = {}): Promise<void> {
  for (const [selector, value] of Object.entries(fields)) {
    await fillInput(page, selector, value, options);
  }
}

// =============================================================================
// Test Data Generators
// =============================================================================

/**
 * Test user credentials interface
 */
export interface TestUser {
  email: string;
  password: string;
  name: string;
}

/**
 * Generate unique test user credentials
 *
 * Creates unique email, password, and name for test isolation.
 * Each call generates different credentials to avoid test conflicts.
 *
 * @param prefix - Prefix for the email address (default: 'e2e')
 * @returns Object with email, password, and name
 *
 * @example
 * ```typescript
 * const user = generateTestUser('auth-test');
 * // { email: 'auth-test-abc123@test.com', password: 'TestPassabc123!', name: 'E2E Test User auth-test' }
 * ```
 */
export function generateTestUser(prefix: string = 'e2e'): TestUser {
  const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  return {
    email: `${prefix}-${testId}@test.com`,
    password: `TestPass${testId}!`,
    name: `E2E Test User ${prefix}`,
  };
}

/**
 * Generate a random string for test data
 *
 * @param length - Length of the string (default: 8)
 * @param charset - Characters to use (default: alphanumeric)
 *
 * @example
 * ```typescript
 * const id = generateRandomString(12);
 * const code = generateRandomString(6, '0123456789');
 * ```
 */
export function generateRandomString(length: number = 8, charset: string = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

// =============================================================================
// TOTP / 2FA Helpers
// =============================================================================

/**
 * Generate a TOTP code from a secret (RFC 6238)
 *
 * Implements the Time-based One-Time Password algorithm for testing
 * 2FA functionality. Compatible with Google Authenticator and similar apps.
 *
 * @param secret - Base32-encoded TOTP secret
 * @param options - Configuration options
 * @param options.digits - Number of digits in the code (default: 6)
 * @param options.period - Time period in seconds (default: 30)
 * @param options.algorithm - Hash algorithm (default: 'sha1')
 * @returns 6-digit TOTP code as string
 *
 * @example
 * ```typescript
 * const secret = 'JBSWY3DPEHPK3PXP';
 * const code = generateTOTP(secret);
 * await page.fill('input[name="code"]', code);
 * ```
 */
export function generateTOTP(secret: string, options: { digits?: number; period?: number; algorithm?: 'sha1' | 'sha256' | 'sha512' } = {}): string {
  const { digits = 6, period = 30, algorithm = 'sha1' } = options;

  // Decode Base32 secret
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';

  for (const char of secret.toUpperCase().replace(/=/g, '')) {
    const val = base32Chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }

  const keyBytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < keyBytes.length; i++) {
    keyBytes[i] = parseInt(bits.slice(i * 8, (i + 1) * 8), 2);
  }

  // Calculate counter based on current time
  const counter = Math.floor(Date.now() / 1000 / period);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  // Generate HMAC
  const hmac = crypto.createHmac(algorithm, keyBytes);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  // Dynamic truncation
  const offset = (hash[hash.length - 1] ?? 0) & 0x0f;
  const code = (((hash[offset] ?? 0) & 0x7f) << 24) | (((hash[offset + 1] ?? 0) & 0xff) << 16) | (((hash[offset + 2] ?? 0) & 0xff) << 8) | ((hash[offset + 3] ?? 0) & 0xff);

  // Generate code with correct number of digits
  const mod = Math.pow(10, digits);
  return (code % mod).toString().padStart(digits, '0');
}

/**
 * Extract TOTP secret from otpauth:// URL
 *
 * Parses the secret parameter from a TOTP QR code URL.
 *
 * @param otpauthUrl - The otpauth:// URL (or data URL containing it)
 * @returns The extracted secret, or null if not found
 *
 * @example
 * ```typescript
 * const qrSrc = await page.locator('img[alt="QR Code"]').getAttribute('src');
 * const secret = extractTOTPSecret(qrSrc);
 * const code = generateTOTP(secret);
 * ```
 */
export function extractTOTPSecret(otpauthUrl: string): string | null {
  // Handle URL-encoded strings (e.g., from QR code image src)
  const decoded = decodeURIComponent(otpauthUrl);

  // Extract secret parameter
  const match = decoded.match(/secret=([A-Z2-7]+)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

/**
 * Extract all parameters from otpauth:// URL
 *
 * @param otpauthUrl - The otpauth:// URL
 * @returns Object with issuer, account, secret, algorithm, digits, period
 *
 * @example
 * ```typescript
 * const params = parseTOTPUrl(otpauthUrl);
 * console.log(params.issuer, params.secret);
 * ```
 */
export function parseTOTPUrl(otpauthUrl: string): {
  issuer: string | null;
  account: string | null;
  secret: string | null;
  algorithm: string;
  digits: number;
  period: number;
} {
  const decoded = decodeURIComponent(otpauthUrl);

  // Extract account from path: otpauth://totp/Issuer:account@example.com
  const pathMatch = decoded.match(/otpauth:\/\/totp\/(?:([^:]+):)?([^?]+)/);

  // Extract query parameters
  const getParam = (name: string): string | null => {
    const match = decoded.match(new RegExp(`${name}=([^&]+)`, 'i'));
    return match?.[1] ?? null;
  };

  return {
    issuer: getParam('issuer') ?? pathMatch?.[1] ?? null,
    account: pathMatch?.[2] ?? null,
    secret: getParam('secret')?.toUpperCase() ?? null,
    algorithm: getParam('algorithm') || 'SHA1',
    digits: parseInt(getParam('digits') || '6', 10),
    period: parseInt(getParam('period') || '30', 10),
  };
}

// =============================================================================
// Wait Helpers
// =============================================================================

/**
 * Wait for an element to be visible and stable
 *
 * Useful for waiting for animations to complete or elements to settle.
 *
 * @param page - Playwright page object
 * @param selector - CSS selector for the element
 * @param options - Configuration options
 * @param options.timeout - Maximum time to wait (default: 10000ms)
 * @param options.stable - Wait for element to be stable (default: true)
 *
 * @example
 * ```typescript
 * await waitForElement(page, '.modal-content');
 * ```
 */
export async function waitForElement(page: Page, selector: string, options: { timeout?: number; stable?: boolean } = {}): Promise<void> {
  const { timeout = 10000, stable = true } = options;
  const locator = page.locator(selector);

  await locator.waitFor({ state: 'visible', timeout });

  if (stable) {
    // Wait for element to be stable (no longer animating)
    await locator.evaluate((el) => {
      return new Promise<void>((resolve) => {
        if (!el.getAnimations || el.getAnimations().length === 0) {
          resolve();
          return;
        }
        // allSettled, not all: `finished` REJECTS (AbortError) when an animation is cancelled
        // instead of finishing, and with `all` this promise then never resolved, so the test
        // hung until Playwright's timeout. A cancelled animation is not running either.
        void Promise.allSettled(el.getAnimations().map((a) => a.finished)).then(() => resolve());
      });
    });
  }
}

/**
 * Wait for network to be idle
 *
 * Useful for waiting for all API calls to complete.
 *
 * @param page - Playwright page object
 * @param options - Configuration options
 * @param options.timeout - Maximum time to wait (default: 30000ms)
 *
 * @example
 * ```typescript
 * await page.click('button[type="submit"]');
 * await waitForNetworkIdle(page);
 * ```
 */
export async function waitForNetworkIdle(page: Page, options: { timeout?: number } = {}): Promise<void> {
  const { timeout = 30000 } = options;
  await page.waitForLoadState('networkidle', { timeout });
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Check if an element contains specific text
 *
 * @param page - Playwright page object
 * @param selector - CSS selector for the element
 * @param text - Text to search for
 * @returns true if text is found
 *
 * @example
 * ```typescript
 * const hasError = await hasText(page, '.error', 'Invalid email');
 * ```
 */
export async function hasText(page: Page, selector: string, text: string): Promise<boolean> {
  const locator = page.locator(selector);
  const content = await locator.textContent();
  return content?.includes(text) ?? false;
}

/**
 * Get all text content from matching elements
 *
 * @param page - Playwright page object
 * @param selector - CSS selector for the elements
 * @returns Array of text content
 *
 * @example
 * ```typescript
 * const errors = await getAllText(page, '.error-message');
 * ```
 */
export async function getAllText(page: Page, selector: string): Promise<string[]> {
  const locators = page.locator(selector);
  const count = await locators.count();
  const texts: string[] = [];

  for (let i = 0; i < count; i++) {
    const text = await locators.nth(i).textContent();
    if (text) texts.push(text.trim());
  }

  return texts;
}
