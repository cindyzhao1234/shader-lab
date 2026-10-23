import { describe, expect, it } from "vitest";
import { AssetStore } from "../core/assets";
import {
  ModelImportError,
  importGltfFiles,
  listExternalUris,
  normaliseRelativePath,
  parseAndValidateGltfJson,
  resolveCompanionFiles,
  selectPrimaryModelFile,
  validateGlbBytes,
} from "./gltfImport";

/**
 * Builds a minimal, standards-compliant glTF 2.0 document with a parent node
 * ("Crate") and a child mesh node ("Lid") using a PBR material and a single
 * triangle geometry buffer.
 */
function createTestTriangleBuffer(): Uint8Array {
  // 3 vertices * 3 floats (36 bytes) + 3 uint16 indices padded to 4-byte boundary (8 bytes) = 44 bytes
  const buffer = new ArrayBuffer(44);
  const floats = new Float32Array(buffer, 0, 9);
  floats.set([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const indices = new Uint16Array(buffer, 36, 3);
  indices.set([0, 1, 2]);
  return new Uint8Array(buffer);
}

function createGltfDocument(options: { bufferUri: string }) {
  return {
    asset: { version: "2.0", generator: "Game Look Lab Test" },
    scene: 0,
    scenes: [{ name: "Scene", nodes: [0] }],
    nodes: [
      {
        name: "Crate",
        translation: [1.5, 0.25, -0.5],
        rotation: [0, 0.70710678, 0, 0.70710678],
        scale: [2, 2, 2],
        children: [1],
      },
      {
        name: "Lid",
        translation: [0, 0.5, 0],
        mesh: 0,
      },
    ],
    meshes: [
      {
        name: "LidMesh",
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: "BrushedSteel",
        pbrMetallicRoughness: {
          baseColorFactor: [0.8, 0.2, 0.1, 1.0],
          metallicFactor: 0.75,
          roughnessFactor: 0.35,
        },
      },
    ],
    buffers: [
      {
        uri: options.bufferUri,
        byteLength: 44,
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5123,
        count: 3,
        type: "SCALAR",
      },
    ],
  };
}

/**
 * Packs a glTF JSON object and binary buffer chunk into a valid `.glb` byte array.
 */
function buildGlbBytes(gltfJson: Record<string, unknown>, binChunk: Uint8Array): Uint8Array {
  const jsonClone = structuredClone(gltfJson) as { buffers?: Array<{ uri?: string; byteLength: number }> };
  if (jsonClone.buffers?.[0]) {
    delete jsonClone.buffers[0].uri;
    jsonClone.buffers[0].byteLength = binChunk.byteLength;
  }

  const rawJson = new TextEncoder().encode(JSON.stringify(jsonClone));
  const jsonPadding = (4 - (rawJson.byteLength % 4)) % 4;
  const jsonLength = rawJson.byteLength + jsonPadding;

  const binPadding = (4 - (binChunk.byteLength % 4)) % 4;
  const binLength = binChunk.byteLength + binPadding;

  const totalLength = 12 + 8 + jsonLength + 8 + binLength;
  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer);

  // Header
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true); // version 2
  view.setUint32(8, totalLength, true);

  // JSON chunk
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(rawJson, 20);
  out.fill(0x20, 20 + rawJson.byteLength, 20 + jsonLength); // space padding

  // BIN chunk
  const binOffset = 20 + jsonLength;
  view.setUint32(binOffset, binLength, true);
  view.setUint32(binOffset + 4, 0x004e4942, true); // "BIN\0"
  out.set(binChunk, binOffset + 8);

  return out;
}

describe("glTF / GLB validation and path helpers", () => {
  it("normalises relative paths and percent-encoded URIs", () => {
    expect(normaliseRelativePath("./textures\\wood%20plank.png")).toBe("textures/wood plank.png");
    expect(normaliseRelativePath("models/../textures/albedo.jpg")).toBe("textures/albedo.jpg");
  });

  it("rejects unsupported 3D formats with actionable guidance", () => {
    expect(() =>
      selectPrimaryModelFile([{ name: "hero.fbx", bytes: new Uint8Array([1, 2, 3]) }]),
    ).toThrow(/FBX \(\.fbx\) is not supported/);

    expect(() =>
      selectPrimaryModelFile([{ name: "level.blend", bytes: new Uint8Array([1, 2, 3]) }]),
    ).toThrow(/Blender project files \(\.blend\)/);

    expect(() =>
      selectPrimaryModelFile([{ name: "statue.obj", bytes: new Uint8Array([1, 2, 3]) }]),
    ).toThrow(/OBJ \(\.obj\) is not supported yet/);

    expect(() =>
      selectPrimaryModelFile([{ name: "notes.txt", bytes: new Uint8Array([1, 2, 3]) }]),
    ).toThrow(/Unsupported file "notes\.txt"/);
  });

  it("rejects truncated or non-GLB binary files", () => {
    expect(() => validateGlbBytes(new Uint8Array([1, 2, 3]), "tiny.glb")).toThrow(/too small/);
    expect(() => validateGlbBytes(new Uint8Array(32), "bad.glb")).toThrow(/not a valid binary glTF/);
  });

  it("rejects malformed JSON, non-2.0 glTF and unsupported required extensions", () => {
    expect(() => parseAndValidateGltfJson("{broken", "bad.gltf")).toThrow(/not valid glTF JSON/);
    expect(() =>
      parseAndValidateGltfJson(JSON.stringify({ asset: { version: "1.0" } }), "old.gltf"),
    ).toThrow(/missing a valid glTF 2\.0 asset header/);
    expect(() =>
      parseAndValidateGltfJson(
        JSON.stringify({
          asset: { version: "2.0" },
          extensionsRequired: ["KHR_draco_mesh_compression"],
        }),
        "compressed.gltf",
      ),
    ).toThrow(/Draco mesh decompression/);
  });

  it("identifies external buffer and texture URIs and ignores data URIs", () => {
    const uris = listExternalUris({
      asset: { version: "2.0" },
      buffers: [
        { uri: "data:application/octet-stream;base64,AAAA" },
        { uri: "geometry/mesh.bin" },
      ],
      images: [
        { uri: "textures/albedo.png" },
        { uri: "data:image/png;base64,iVBOR" },
      ],
    });

    expect(uris).toEqual(["geometry/mesh.bin", "textures/albedo.png"]);
  });

  it("reports missing external companion files clearly", () => {
    expect(() =>
      resolveCompanionFiles(["mesh.bin", "textures/albedo.png"], [], "shrine.gltf"),
    ).toThrow(/references external files that were not included: mesh\.bin, textures\/albedo\.png/);
  });
});

describe("importGltfFiles", () => {
  it("imports a binary .glb, preserving hierarchy, names, transforms and PBR material", async () => {
    const bin = createTestTriangleBuffer();
    const doc = createGltfDocument({ bufferUri: "unused.bin" });
    const glbBytes = buildGlbBytes(doc, bin);
    const store = new AssetStore();

    const result = await importGltfFiles(
      [{ name: "supply-crate.glb", bytes: glbBytes }],
      store,
    );

    expect(result.name).toBe("supply-crate");
    expect(result.primaryAsset.name).toBe("supply-crate.glb");
    expect(result.primaryAsset.mime).toBe("model/gltf-binary");
    expect(store.has(result.primaryAsset.hash)).toBe(true);

    const crate = result.root.getObjectByName("Crate");
    expect(crate).toBeDefined();
    expect(crate!.position.toArray()).toEqual([1.5, 0.25, -0.5]);
    expect(crate!.scale.toArray()).toEqual([2, 2, 2]);
    expect(crate!.quaternion.y).toBeCloseTo(0.70710678, 4);

    const lid = crate!.getObjectByName("Lid") as any;
    expect(lid).toBeDefined();
    expect(lid.isMesh).toBe(true);
    expect(lid.castShadow).toBe(true);
    expect(lid.receiveShadow).toBe(true);
    expect(lid.material.name).toBe("BrushedSteel");
    expect(lid.material.metalness).toBeCloseTo(0.75, 4);
    expect(lid.material.roughness).toBeCloseTo(0.35, 4);
  });

  it("imports a multi-file .gltf with an external .bin companion buffer", async () => {
    const bin = createTestTriangleBuffer();
    const doc = createGltfDocument({ bufferUri: "buffers/crate.bin" });
    const gltfBytes = new TextEncoder().encode(JSON.stringify(doc));
    const store = new AssetStore();

    const result = await importGltfFiles(
      [
        { name: "crate.gltf", bytes: gltfBytes },
        { name: "crate.bin", path: "buffers/crate.bin", bytes: bin },
      ],
      store,
    );

    expect(result.name).toBe("crate");
    expect(result.companionAssets).toHaveLength(1);
    expect(result.companionAssets[0]!.name).toBe("crate.bin");
    expect(store.size).toBe(2);

    const lid = result.root.getObjectByName("Lid") as any;
    expect(lid?.isMesh).toBe(true);
    expect(lid.geometry.attributes.position.count).toBe(3);
  });

  it("fails gracefully when a .gltf is imported without its external .bin", async () => {
    const doc = createGltfDocument({ bufferUri: "crate.bin" });
    const gltfBytes = new TextEncoder().encode(JSON.stringify(doc));
    const store = new AssetStore();

    await expect(
      importGltfFiles([{ name: "crate.gltf", bytes: gltfBytes }], store),
    ).rejects.toThrow(ModelImportError);
    expect(store.size).toBe(0);
  });
});
