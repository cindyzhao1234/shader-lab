import { describe, expect, it } from "vitest";
import { AssetStore, hashBytes } from "./assets";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("hashBytes", () => {
  it("produces the known SHA-256 of an empty input", () => {
    return expect(hashBytes(new Uint8Array())).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is stable across calls and sensitive to a single bit", async () => {
    const a = await hashBytes(bytes(1, 2, 3));
    const b = await hashBytes(bytes(1, 2, 3));
    const c = await hashBytes(bytes(1, 2, 4));

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("AssetStore", () => {
  it("deduplicates identical bytes imported under different names", async () => {
    const store = new AssetStore();
    const first = await store.add("hero.glb", "model/gltf-binary", bytes(9, 9, 9));
    const second = await store.add("hero-copy.glb", "model/gltf-binary", bytes(9, 9, 9));

    expect(second.hash).toBe(first.hash);
    expect(second.name).toBe("hero.glb");
    expect(store.size).toBe(1);
    expect(store.byteLength).toBe(3);
  });

  it("stores distinct assets separately", async () => {
    const store = new AssetStore();
    await store.add("a.bin", "application/octet-stream", bytes(1));
    await store.add("b.bin", "application/octet-stream", bytes(2));

    expect(store.size).toBe(2);
    expect(store.byteLength).toBe(2);
  });

  it("retrieves by hash and reports membership", async () => {
    const store = new AssetStore();
    const asset = await store.add("tex.png", "image/png", bytes(4, 5));

    expect(store.has(asset.hash)).toBe(true);
    expect(store.get(asset.hash)?.bytes).toEqual(bytes(4, 5));
    expect(store.get("missing")).toBeUndefined();
  });

  it("drops unreferenced assets when retaining a subset", async () => {
    const store = new AssetStore();
    const keep = await store.add("keep.bin", "application/octet-stream", bytes(1));
    await store.add("drop.bin", "application/octet-stream", bytes(2));
    await store.add("drop2.bin", "application/octet-stream", bytes(3));

    expect(store.retainOnly([keep.hash])).toBe(2);
    expect(store.size).toBe(1);
    expect(store.has(keep.hash)).toBe(true);
  });

  it("clears completely", async () => {
    const store = new AssetStore();
    await store.add("a.bin", "application/octet-stream", bytes(1));
    store.clear();

    expect(store.size).toBe(0);
    expect(store.byteLength).toBe(0);
    expect(store.list()).toEqual([]);
  });
});
