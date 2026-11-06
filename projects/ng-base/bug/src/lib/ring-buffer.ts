/** Fixed-size buffer that keeps the newest entries (the oldest drops out when full). */
export class LtRingBuffer<T> {
  private items: T[] = [];

  constructor(private readonly capacity: number) {}

  /** Number of stored entries. */
  get size(): number {
    return this.items.length;
  }

  /** Append an entry; drops the oldest one when the buffer is full. */
  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) {
      this.items.splice(0, this.items.length - this.capacity);
    }
  }

  /** The newest `limit` entries (default all), oldest first, as shallow copies. */
  toArray(limit = this.capacity): T[] {
    return this.items.slice(-Math.max(0, limit)).map((item) => (item && typeof item === 'object' ? { ...item } : item));
  }

  /** The newest entry (live reference, for later enrichment), `undefined` when empty. */
  last(): T | undefined {
    return this.items[this.items.length - 1];
  }

  /** Remove every entry. */
  clear(): void {
    this.items = [];
  }
}
