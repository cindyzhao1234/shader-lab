/**
 * Content-addressed storage for imported files.
 *
 * Every GLB, OBJ and image a user imports is kept here as raw bytes, keyed by
 * the SHA-256 of its contents. Two consequences matter: importing the same
 * asset twice costs nothing, and a saved project can reference assets by hash
 * instead of by a browser object URL that dies when the tab closes.
 */

export interface StoredAsset {
  readonly hash: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: Uint8Array;
}

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class AssetStore {
  private readonly assets = new Map<string, StoredAsset>();

  /**
   * Returns the existing entry when the same bytes are already stored, so the
   * caller can treat add as idempotent. The first name wins; a later import of
   * identical bytes under a different filename does not rename the asset.
   */
  async add(name: string, mime: string, bytes: Uint8Array): Promise<StoredAsset> {
    const hash = await hashBytes(bytes);
    const existing = this.assets.get(hash);

    if (existing) {
      return existing;
    }

    const asset: StoredAsset = { hash, name, mime, bytes };
    this.assets.set(hash, asset);
    return asset;
  }

  get(hash: string): StoredAsset | undefined {
    return this.assets.get(hash);
  }

  has(hash: string): boolean {
    return this.assets.has(hash);
  }

  delete(hash: string): boolean {
    return this.assets.delete(hash);
  }

  clear(): void {
    this.assets.clear();
  }

  list(): StoredAsset[] {
    return [...this.assets.values()];
  }

  get size(): number {
    return this.assets.size;
  }

  /** Total stored bytes, for the diagnostics panel and save-size estimates. */
  get byteLength(): number {
    let total = 0;

    for (const asset of this.assets.values()) {
      total += asset.bytes.byteLength;
    }

    return total;
  }

  /** Drops anything not referenced by the given hashes. Used before saving. */
  retainOnly(hashes: Iterable<string>): number {
    const keep = new Set(hashes);
    let removed = 0;

    for (const hash of [...this.assets.keys()]) {
      if (!keep.has(hash)) {
        this.assets.delete(hash);
        removed += 1;
      }
    }

    return removed;
  }
}
