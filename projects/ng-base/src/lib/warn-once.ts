const warnedKeys = new Set<string>();

/**
 * Log `message` the first time `key` is seen; ignore later calls. The conditions behind these messages (missing API
 * URL, implicit dev proxy) are constant for the process, so repeating them only drowns other output.
 */
export function warnLtOnce(key: string, message: string, level: 'error' | 'warn' = 'warn'): void {
  if (warnedKeys.has(key)) {
    return;
  }
  warnedKeys.add(key);
  console[level](message);
}

/** Test only: forget which one-shot messages were emitted. */
export function resetLtWarnOnceState(): void {
  warnedKeys.clear();
}
