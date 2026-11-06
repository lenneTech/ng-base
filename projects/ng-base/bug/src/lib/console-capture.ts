import type { LtConsoleLogEntry } from './bug-types';
import { redactLtText, truncateLt } from './redact';
import { LtRingBuffer } from './ring-buffer';

const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;
const MAX_PART_LENGTH = 2000;
const MAX_STACK_LENGTH = 5000;

type ConsoleMethod = (...args: unknown[]) => void;

/**
 * Wraps `console.log/info/warn/error/debug` and records every call in a ring buffer: `%c` placeholders and their CSS
 * arguments are dropped, objects
 * serialised, secrets redacted (see `redactLtText`). Uncaught errors and unhandled rejections are recorded as well,
 * unless another listener (Angular's global error listeners) already logged them through `console.error`.
 * The original methods keep running unchanged.
 */
export class LtConsoleCapture {
  private readonly buffer: LtRingBuffer<LtConsoleLogEntry>;
  private originals: Partial<Record<(typeof LEVELS)[number], ConsoleMethod>> | null = null;
  private wrappers: Partial<Record<(typeof LEVELS)[number], ConsoleMethod>> = {};
  private removeListeners: (() => void) | null = null;

  constructor(
    capacity: number,
    private readonly target: Pick<Console, (typeof LEVELS)[number]> = console,
  ) {
    this.buffer = new LtRingBuffer(capacity);
  }

  /** Whether the console is currently wrapped. */
  get installed(): boolean {
    return this.originals !== null;
  }

  /** Wrap the console (idempotent) and listen for uncaught errors on `view`. */
  install(view?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null): void {
    if (this.originals) {
      return;
    }
    const target = this.target as unknown as Record<string, ConsoleMethod>;
    this.originals = {};
    for (const level of LEVELS) {
      const original = target[level];
      if (typeof original !== 'function') {
        continue;
      }
      this.originals[level] = original;
      const wrapper: ConsoleMethod = (...args: unknown[]) => {
        original.apply(this.target, args);
        try {
          this.record(level, args);
        } catch {
          // Capturing must never break logging.
        }
      };
      this.wrappers[level] = wrapper;
      target[level] = wrapper;
    }
    if (view) {
      const onError = (event: ErrorEvent) =>
        queueMicrotask(() => {
          if (!event.defaultPrevented) {
            this.push({ level: 'error', message: [redactLtText(truncateLt(event.message || 'Error', MAX_PART_LENGTH))], stack: stackOf(event.error), timestamp: now() });
          }
        });
      const onRejection = (event: PromiseRejectionEvent) =>
        queueMicrotask(() => {
          if (!event.defaultPrevented) {
            this.push({ level: 'error', message: [serialize(event.reason)], stack: stackOf(event.reason), timestamp: now() });
          }
        });
      view.addEventListener('error', onError as EventListener);
      view.addEventListener('unhandledrejection', onRejection as EventListener);
      this.removeListeners = () => {
        view.removeEventListener('error', onError as EventListener);
        view.removeEventListener('unhandledrejection', onRejection as EventListener);
      };
    }
  }

  /** Restore the original console methods (only those still wrapped by this instance) and remove the listeners. */
  uninstall(): void {
    if (!this.originals) {
      return;
    }
    const target = this.target as unknown as Record<string, ConsoleMethod>;
    for (const level of LEVELS) {
      const original = this.originals[level];
      if (original && target[level] === this.wrappers[level]) {
        target[level] = original;
      }
    }
    this.originals = null;
    this.wrappers = {};
    this.removeListeners?.();
    this.removeListeners = null;
  }

  /** The newest `limit` entries, oldest first. */
  entries(limit?: number): LtConsoleLogEntry[] {
    return this.buffer.toArray(limit);
  }

  /** Number of stored entries. */
  get size(): number {
    return this.buffer.size;
  }

  /** Remove every entry. */
  clear(): void {
    this.buffer.clear();
  }

  private record(level: LtConsoleLogEntry['level'], args: unknown[]): void {
    const message = withoutStyleArguments(args)
      .map((arg) => serialize(arg))
      .filter((part) => part.length > 0);
    const entry: LtConsoleLogEntry = { level, message, timestamp: now() };
    if (level === 'error') {
      const error = args.find((arg) => arg instanceof Error);
      if (error) {
        entry.stack = stackOf(error);
      }
    }
    this.push(entry);
  }

  private push(entry: LtConsoleLogEntry): void {
    this.buffer.push(entry);
  }
}

/** Serialise one console argument: strings without `%c` and collapsed whitespace, errors by message, objects as JSON. */
function serialize(arg: unknown): string {
  let text: string;
  if (typeof arg === 'string') {
    text = arg.replace(/%c/g, '').replace(/\s+/g, ' ').trim();
  } else if (arg instanceof Error) {
    text = arg.message;
  } else {
    try {
      text = JSON.stringify(arg, null, 2) ?? String(arg);
    } catch {
      text = String(arg);
    }
  }
  return truncateLt(redactLtText(text.length > 20_000 ? text.slice(0, 20_000) : text), MAX_PART_LENGTH);
}

/** Drop the CSS arguments that belong to `%c` placeholders of the first argument (`console.log('%cHi', 'color: red')`). */
function withoutStyleArguments(args: unknown[]): unknown[] {
  const [first, ...rest] = args;
  if (typeof first !== 'string' || !first.includes('%c')) {
    return args;
  }
  const styles = first.match(/%c/g)?.length ?? 0;
  return [first, ...rest.filter((arg, index) => index >= styles || typeof arg !== 'string')];
}

function stackOf(error: unknown): string | undefined {
  const stack = (error as { stack?: unknown } | null | undefined)?.stack;
  return typeof stack === 'string' ? truncateLt(redactLtText(stack), MAX_STACK_LENGTH) : undefined;
}

function now(): string {
  return new Date().toISOString();
}
