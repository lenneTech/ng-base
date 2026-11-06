/** Options of {@link ltMap}. */
export interface LtMapOptions {
  /** Convert ISO date strings into `Date` (all keys, or only the listed ones). Default `false`. */
  dateStringToDate?: boolean | string[];
  /** Copy function values too (default `false`). */
  funcAllowed?: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Copy the properties of `source` that exist on `target` (keys of `target` decide, unknown keys are ignored).
 * Ported from ng-base 18 `Helper.map` without its defects (the function check was always true, dates were parsed by
 * default and silently turned any string into an invalid `Date`).
 */
export function ltMap<T extends object>(source: unknown, target: T, options: LtMapOptions = {}): T {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return target;
  }
  const values = source as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    const value = values[key];
    if (value === undefined || (typeof value === 'function' && !options.funcAllowed)) {
      continue;
    }
    const convert = options.dateStringToDate === true || (Array.isArray(options.dateStringToDate) && options.dateStringToDate.includes(key));
    (target as Record<string, unknown>)[key] = convert && typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value;
  }
  return target;
}

/** Deep equality of JSON-like values (functions ignored, `Date` compared by time). */
export function ltIsEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const keys = (value: object) => Object.keys(value).filter((key) => typeof (value as Record<string, unknown>)[key] !== 'function');
  const keysA = keys(a);
  const keysB = keys(b);
  return keysA.length === keysB.length && keysA.every((key) => ltIsEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** First-level properties of `a` that differ from `b` (changed arrays/objects are returned as a whole). */
export function ltGetDiff<T extends object>(a: T, b: Partial<T> | Record<string, unknown>): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(a)) {
    if (typeof value !== 'function' && !ltIsEqual(value, (b as Record<string, unknown>)[key])) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}

/**
 * Base class for client-side models with `map`, `clone` and `getDiff` (the `Standard` idea of ng-base 18). Declare
 * the properties with initial values (`id = ''`), only declared keys are mapped.
 *
 * @example
 * class Contact extends LtStandard { id = ''; name = ''; createdAt?: Date = undefined; }
 * const contact = Contact.map({ id: '1', name: 'Ada', role: 'ignored' });
 */
export class LtStandard {
  /** Create an instance and map `data` onto it. */
  static map<T extends LtStandard>(this: new () => T, data: unknown, options?: LtMapOptions): T {
    return ltMap(data, new this(), options);
  }

  /** Map an array (or one item) of plain objects. */
  static maps<T extends LtStandard>(this: new () => T, data: unknown, options?: LtMapOptions): T[] {
    const items = Array.isArray(data) ? data : data ? [data] : [];
    return items.map((item) => ltMap(item, new this(), options));
  }

  /** Map `data` onto this instance. */
  map(data: unknown, options?: LtMapOptions): this {
    return ltMap(data, this, options);
  }

  /** Deep copy (structuredClone), optionally with changes. */
  clone(changes?: Partial<this>): this {
    const copy = Object.assign(Object.create(Object.getPrototypeOf(this)) as this, structuredClone(Object.fromEntries(Object.entries(this))));
    return changes ? Object.assign(copy, changes) : copy;
  }

  /** First-level properties that differ from `compare`. */
  getDiff(compare: Record<string, unknown>): Partial<this> {
    return ltGetDiff(this, compare);
  }
}

/**
 * URL slug: lower case, umlauts transliterated (`ä` → `ae`, `ß` → `ss`), whitespace → `-`, other characters removed,
 * repeated hyphens collapsed.
 */
export function ltSlug(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/** Random id of hex characters (default 24, like a MongoDB ObjectId). */
export function ltUid(length = 24): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/** Promise that resolves after `ms` milliseconds. */
export function ltDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Recursively freeze an object (cycle-safe). */
export function ltDeepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) {
      ltDeepFreeze(child, seen);
    }
    Object.freeze(value);
  }
  return value;
}
