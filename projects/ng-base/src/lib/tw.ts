/**
 * Identity function and tagged template for Tailwind class strings outside templates, so the Tailwind IntelliSense
 * extension recognises them (configure `"tailwindCSS.experimental.classRegex": ["tw`([^`]*)`", "tw\\(['\"]([^'\"]*)"]`).
 *
 * @example
 * const card = tw`rounded-lg border p-4`;
 * const active = tw('bg-primary text-primary-foreground');
 */
export function tw(strings: TemplateStringsArray | string, ...values: unknown[]): string {
  if (typeof strings === 'string') {
    return strings;
  }
  return strings.reduce((result, part, index) => result + part + (index < values.length ? String(values[index]) : ''), '');
}
