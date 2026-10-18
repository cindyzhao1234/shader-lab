import { describe, expect, it } from "vitest";
import { PreviewCache } from "./previewCache";

describe("PreviewCache", () => {
  it("returns a preview only for the revision it was rendered at", () => {
    const cache = new PreviewCache<string>();
    cache.set("original", 3, "a.webp");

    expect(cache.get("original", 3)).toBe("a.webp");
    expect(cache.get("original", 4)).toBeUndefined();
    expect(cache.isFresh("original", 3)).toBe(true);
    expect(cache.isFresh("original", 4)).toBe(false);
  });

  it("keeps the last good preview available while a new one is pending", () => {
    const cache = new PreviewCache<string>();
    cache.set("original", 1, "old.webp");

    expect(cache.get("original", 2)).toBeUndefined();
    expect(cache.latest("original")).toEqual({ value: "old.webp", revision: 1 });
  });

  it("ignores a late result for an older revision", () => {
    const cache = new PreviewCache<string>();
    cache.set("cartoon", 5, "new.webp");
    cache.set("cartoon", 4, "late.webp");

    expect(cache.latest("cartoon")).toEqual({ value: "new.webp", revision: 5 });
  });

  it("replaces a preview at the same or a newer revision", () => {
    const cache = new PreviewCache<string>();
    cache.set("retro", 2, "first.webp");
    cache.set("retro", 2, "second.webp");
    expect(cache.get("retro", 2)).toBe("second.webp");

    cache.set("retro", 3, "third.webp");
    expect(cache.get("retro", 3)).toBe("third.webp");
  });

  it("evicts the least recently used Look when over capacity", () => {
    const cache = new PreviewCache<string>(2);
    cache.set("a", 1, "a");
    cache.set("b", 1, "b");

    // Reading "a" makes "b" the least recently used.
    cache.get("a", 1);
    cache.set("c", 1, "c");

    expect(cache.size).toBe(2);
    expect(cache.latest("a")).toBeDefined();
    expect(cache.latest("b")).toBeUndefined();
    expect(cache.latest("c")).toBeDefined();
  });

  it("deletes and clears", () => {
    const cache = new PreviewCache<string>();
    cache.set("a", 1, "a");
    cache.set("b", 1, "b");

    cache.delete("a");
    expect(cache.latest("a")).toBeUndefined();

    cache.clear();
    expect(cache.size).toBe(0);
  });
});
