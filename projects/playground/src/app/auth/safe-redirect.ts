/** `?redirect=` of the sign-in flow: only app-internal paths (`/…`, never `//…` or `/\…`), else `fallback`. */
export function safeRedirect(value: unknown, fallback = '/app'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback;
  }
  return value;
}
