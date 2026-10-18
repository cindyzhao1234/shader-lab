/**
 * Remembers rendered Look thumbnails so the gallery only re-renders what has
 * actually gone stale.
 *
 * A preview is valid for one scene revision. The revision moves forward
 * whenever something visible changes (an edit, or the camera coming to rest
 * somewhere new), and a lookup for a newer revision misses. Old entries are
 * kept until evicted so the gallery can keep showing the last good image
 * while a fresh one renders, rather than flashing back to a skeleton.
 */

export interface PreviewEntry<T> {
  value: T;
  revision: number;
}

export class PreviewCache<T> {
  private readonly entries = new Map<string, PreviewEntry<T>>();

  constructor(private readonly capacity = 32) {}

  /** The preview for this exact revision, or undefined if it is stale or missing. */
  get(lookId: string, revision: number): T | undefined {
    const entry = this.entries.get(lookId);

    if (!entry || entry.revision !== revision) {
      return undefined;
    }

    this.touch(lookId, entry);
    return entry.value;
  }

  /** The newest preview held for this Look, whatever its revision. */
  latest(lookId: string): PreviewEntry<T> | undefined {
    return this.entries.get(lookId);
  }

  isFresh(lookId: string, revision: number): boolean {
    return this.entries.get(lookId)?.revision === revision;
  }

  set(lookId: string, revision: number, value: T): void {
    const existing = this.entries.get(lookId);

    // A slow render finishing after a newer one must not overwrite it.
    if (existing && existing.revision > revision) {
      return;
    }

    this.touch(lookId, { value, revision });

    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      this.entries.delete(oldest);
    }
  }

  delete(lookId: string): void {
    this.entries.delete(lookId);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  /** Re-inserting moves the key to the end, which makes Map order an LRU. */
  private touch(lookId: string, entry: PreviewEntry<T>): void {
    this.entries.delete(lookId);
    this.entries.set(lookId, entry);
  }
}
