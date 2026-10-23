import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { AssetStore, StoredAsset } from "../core/assets";

/**
 * Local `.glb` and `.gltf` model import.
 *
 * Handles single-file `.glb`, self-contained `.gltf` (embedded data URIs), and
 * multi-file `.gltf` bundles where the user selects or drops the `.gltf`
 * alongside its companion `.bin` and texture files.
 */

export class ModelImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelImportError";
  }
}

export interface ImportFileInput {
  readonly name: string;
  readonly mime?: string;
  /** Relative path when dropped as a folder or selected with webkitRelativePath. */
  readonly path?: string;
  readonly bytes: Uint8Array;
}

export interface ImportedModelResult {
  /** The root object added to the scene graph. */
  readonly root: THREE.Group;
  /** Display name derived from the file or root node. */
  readonly name: string;
  /** Primary `.glb` or `.gltf` asset stored in `AssetStore`. */
  readonly primaryAsset: StoredAsset;
  /** Companion `.bin` or texture assets stored in `AssetStore` for `.gltf` bundles. */
  readonly companionAssets: readonly StoredAsset[];
  /** Non-fatal warnings (for example, unsupported extensions that were ignored). */
  readonly warnings: readonly string[];
}

const GLB_MAGIC = 0x46546c67; // "glTF" in little-endian ASCII
const JSON_CHUNK_TYPE = 0x4e4f534a; // "JSON"

const SUPPORTED_MODEL_EXTENSIONS = new Set([".glb", ".gltf"]);
const UNSUPPORTED_3D_EXTENSIONS: Record<string, string> = {
  ".obj": "Wavefront OBJ (.obj) is not supported yet. Export or convert the model to .glb or .gltf.",
  ".fbx": "Autodesk FBX (.fbx) is not supported. Export the model as .glb or .gltf from Blender or your 3D tool.",
  ".blend": "Blender project files (.blend) cannot be opened directly. In Blender, use File → Export → glTF 2.0 (.glb).",
  ".dae": "Collada (.dae) is not supported. Convert or export the model to .glb or .gltf.",
  ".stl": "STL (.stl) is not supported. Export the model to .glb or .gltf.",
  ".ply": "PLY (.ply) is not supported. Export the model to .glb or .gltf.",
  ".usd": "USD (.usd/.usdz) is not supported. Export the model to .glb or .gltf.",
  ".usdz": "USDZ (.usdz) is not supported. Export the model to .glb or .gltf.",
  ".3ds": "3DS (.3ds) is not supported. Export the model to .glb or .gltf.",
};

interface GltfJsonShape {
  asset?: { version?: string; minVersion?: string };
  buffers?: Array<{ uri?: string; byteLength?: number }>;
  images?: Array<{ uri?: string; bufferView?: number; mimeType?: string }>;
  extensionsRequired?: string[];
}

const UNSUPPORTED_REQUIRED_EXTENSIONS: Record<string, string> = {
  KHR_draco_mesh_compression:
    "This model requires Draco mesh decompression (KHR_draco_mesh_compression). Re-export as uncompressed .glb/.gltf.",
  EXT_meshopt_compression:
    "This model requires Meshopt decompression (EXT_meshopt_compression). Re-export as standard .glb/.gltf.",
  KHR_texture_basisu:
    "This model requires KTX2/BasisU textures (KHR_texture_basisu). Re-export with PNG, JPEG or WebP textures.",
};

export function fileExtension(filename: string): string {
  const clean = filename.trim().toLowerCase();
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot) : "";
}

export function stemName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  const raw = (dot > 0 ? base.slice(0, dot) : base).trim();
  return raw || "Imported Model";
}

export function inferMimeType(filename: string, provided?: string): string {
  const ext = fileExtension(filename);
  switch (ext) {
    case ".glb":
      return "model/gltf-binary";
    case ".gltf":
      return "model/gltf+json";
    case ".bin":
      return "application/octet-stream";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return provided && provided.trim() ? provided : "application/octet-stream";
  }
}

/**
 * Normalises a relative URI or file path so `"./textures/wood.png"`,
 * `"textures\\wood.png"` and `"textures%201/wood.png"` match reliably.
 */
export function normaliseRelativePath(rawPath: string): string {
  let decoded = rawPath.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep raw string if percent-encoding is malformed.
  }
  const parts = decoded.replace(/\\/g, "/").split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join("/").toLowerCase();
}

export function isDataOrBlobUri(uri: string): boolean {
  return /^(data:|blob:)/i.test(uri.trim());
}

/**
 * Inspects a `.glb` byte buffer and validates its binary header and JSON chunk.
 */
export function validateGlbBytes(bytes: Uint8Array, filename = "model.glb"): GltfJsonShape {
  if (bytes.byteLength < 20) {
    throw new ModelImportError(`"${filename}" is too small to be a valid .glb file.`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    throw new ModelImportError(`"${filename}" is not a valid binary glTF (.glb) file.`);
  }

  const version = view.getUint32(4, true);
  if (version !== 2) {
    throw new ModelImportError(
      `"${filename}" uses glTF version ${version}. Only glTF 2.0 (.glb/.gltf) is supported.`,
    );
  }

  const declaredLength = view.getUint32(8, true);
  if (declaredLength > bytes.byteLength || declaredLength < 20) {
    throw new ModelImportError(`"${filename}" appears to be truncated or corrupted.`);
  }

  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== JSON_CHUNK_TYPE || 20 + chunkLength > bytes.byteLength) {
    throw new ModelImportError(`"${filename}" is missing a valid glTF JSON header chunk.`);
  }

  const jsonBytes = bytes.subarray(20, 20 + chunkLength);
  const jsonText = new TextDecoder().decode(jsonBytes);
  return parseAndValidateGltfJson(jsonText, filename);
}

/**
 * Parses and validates a `.gltf` JSON document and checks required extensions.
 */
export function parseAndValidateGltfJson(text: string, filename = "model.gltf"): GltfJsonShape {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ModelImportError(`"${filename}" is not valid glTF JSON.`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ModelImportError(`"${filename}" does not contain a glTF 2.0 document.`);
  }

  const doc = parsed as GltfJsonShape;
  const version = doc.asset?.version;
  if (typeof version !== "string" || !version.startsWith("2.")) {
    throw new ModelImportError(
      `"${filename}" is missing a valid glTF 2.0 asset header${version ? ` (found version "${version}")` : ""}.`,
    );
  }

  if (Array.isArray(doc.extensionsRequired)) {
    for (const ext of doc.extensionsRequired) {
      const explanation = UNSUPPORTED_REQUIRED_EXTENSIONS[ext];
      if (explanation) {
        throw new ModelImportError(explanation);
      }
    }
  }

  return doc;
}

/**
 * Lists external relative URIs referenced by a glTF JSON document (excluding
 * `data:` and `blob:` URIs).
 */
export function listExternalUris(doc: GltfJsonShape): string[] {
  const uris: string[] = [];

  for (const buffer of doc.buffers ?? []) {
    if (typeof buffer?.uri === "string" && buffer.uri.trim() && !isDataOrBlobUri(buffer.uri)) {
      uris.push(buffer.uri.trim());
    }
  }

  for (const image of doc.images ?? []) {
    if (typeof image?.uri === "string" && image.uri.trim() && !isDataOrBlobUri(image.uri)) {
      uris.push(image.uri.trim());
    }
  }

  return uris;
}

/**
 * Chooses the primary `.glb` or `.gltf` file from a batch of user-selected or
 * dropped files, or throws a clear `ModelImportError`.
 */
export function selectPrimaryModelFile(files: readonly ImportFileInput[]): {
  primary: ImportFileInput;
  companions: ImportFileInput[];
} {
  if (files.length === 0) {
    throw new ModelImportError("No files were provided to import.");
  }

  const models = files.filter((file) => SUPPORTED_MODEL_EXTENSIONS.has(fileExtension(file.name)));

  if (models.length === 0) {
    const first = files[0]!;
    const ext = fileExtension(first.name);
    const knownMessage = UNSUPPORTED_3D_EXTENSIONS[ext];
    if (knownMessage) {
      throw new ModelImportError(knownMessage);
    }
    throw new ModelImportError(
      `Unsupported file "${first.name}". Please choose a glTF 2.0 file (.glb or .gltf).`,
    );
  }

  // Prefer .glb if both are present, otherwise the first .gltf.
  const primary = models.find((file) => fileExtension(file.name) === ".glb") ?? models[0]!;
  const companions = files.filter((file) => file !== primary);
  return { primary, companions };
}

/**
 * Matches external URIs required by a `.gltf` or `.glb` against the companion
 * files provided by the user. Matches by normalised relative path first, then
 * falls back to basename.
 */
export function resolveCompanionFiles(
  externalUris: readonly string[],
  companions: readonly ImportFileInput[],
  primaryFileName: string,
): { matched: Map<string, ImportFileInput>; missing: string[] } {
  const byPath = new Map<string, ImportFileInput>();
  const byBase = new Map<string, ImportFileInput>();

  for (const file of companions) {
    const rel = normaliseRelativePath(file.path ?? file.name);
    const base = normaliseRelativePath(file.name);
    byPath.set(rel, file);
    byBase.set(base, file);
  }

  const matched = new Map<string, ImportFileInput>();
  const missing: string[] = [];

  for (const uri of externalUris) {
    const normUri = normaliseRelativePath(uri);
    const baseUri = normUri.split("/").pop() ?? normUri;
    const found = byPath.get(normUri) ?? byBase.get(baseUri);

    if (found) {
      matched.set(normUri, found);
      matched.set(baseUri, found);
    } else {
      missing.push(uri);
    }
  }

  if (missing.length > 0) {
    const list = missing.slice(0, 4).join(", ") + (missing.length > 4 ? ` (+${missing.length - 4} more)` : "");
    throw new ModelImportError(
      `"${primaryFileName}" references external files that were not included: ${list}. Select or drop the .gltf together with its .bin and texture files, or export a single self-contained .glb.`,
    );
  }

  return { matched, missing };
}

/**
 * Prepares an imported glTF root group for the workspace:
 * - ensures a meaningful root name
 * - enables shadow casting & receiving on meshes
 * - converts non-standard materials gracefully while preserving PBR properties
 *   and texture colour spaces
 */
export function prepareImportedScene(scene: THREE.Group, fallbackName: string): THREE.Group {
  const rootName = scene.name.trim();
  const isGenericName = !rootName || /^(scene|root|rootnode|auxscene)$/i.test(rootName);

  // If the glTF scene has a single top-level child and the scene wrapper itself
  // has identity transform, keep the hierarchy clean and name the root after the file.
  if (isGenericName) {
    scene.name = fallbackName;
  }

  let meshCount = 0;

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }

    meshCount += 1;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (mesh.geometry && !mesh.geometry.attributes.normal) {
      mesh.geometry.computeVertexNormals();
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const mat of materials) {
      const std = mat as THREE.MeshStandardMaterial;
      if (std.map) {
        std.map.colorSpace = THREE.SRGBColorSpace;
      }
      if (std.emissiveMap) {
        std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      }
    }
  });

  if (meshCount === 0 && scene.children.length === 0) {
    throw new ModelImportError(`"${fallbackName}" does not contain any 3D meshes or scene objects.`);
  }

  return scene;
}

/**
 * Imports a batch of user-supplied files (`.glb`, or `.gltf` + companion
 * `.bin`/textures), stores their bytes in `assetStore`, and parses the 3D
 * hierarchy via Three.js `GLTFLoader`.
 */
export async function importGltfFiles(
  files: readonly ImportFileInput[],
  assetStore: AssetStore,
): Promise<ImportedModelResult> {
  const { primary, companions } = selectPrimaryModelFile(files);
  const ext = fileExtension(primary.name);
  const warnings: string[] = [];

  if (primary.bytes.byteLength === 0) {
    throw new ModelImportError(`"${primary.name}" is empty (0 bytes).`);
  }

  let doc: GltfJsonShape;
  let gltfText: string | undefined;

  if (ext === ".glb") {
    doc = validateGlbBytes(primary.bytes, primary.name);
  } else {
    gltfText = new TextDecoder().decode(primary.bytes);
    doc = parseAndValidateGltfJson(gltfText, primary.name);
  }

  const externalUris = listExternalUris(doc);
  const { matched } = resolveCompanionFiles(externalUris, companions, primary.name);

  // Store the primary asset and any matched companion assets in the content-addressed AssetStore.
  const primaryMime = inferMimeType(primary.name, primary.mime);
  const primaryAsset = await assetStore.add(primary.name, primaryMime, primary.bytes);

  const companionAssets: StoredAsset[] = [];
  const seenCompanions = new Set<ImportFileInput>();
  for (const companion of matched.values()) {
    if (seenCompanions.has(companion)) continue;
    seenCompanions.add(companion);
    const stored = await assetStore.add(
      companion.name,
      inferMimeType(companion.name, companion.mime),
      companion.bytes,
    );
    companionAssets.push(stored);
  }

  const objectUrls: string[] = [];
  const cacheKeys: string[] = [];
  const urlByKey = new Map<string, string>();
  const previousCacheEnabled = THREE.Cache.enabled;

  try {
    THREE.Cache.enabled = true;

    for (const [key, file] of matched.entries()) {
      let existingUrl = urlByKey.get(file.name.toLowerCase());
      if (!existingUrl) {
        const mime = inferMimeType(file.name, file.mime);
        const blob = new Blob([file.bytes as unknown as BlobPart], { type: mime });
        existingUrl = URL.createObjectURL(blob);
        objectUrls.push(existingUrl);
        urlByKey.set(file.name.toLowerCase(), existingUrl);

        // Pre-seed Three's FileLoader cache with the ArrayBuffer so binary
        // buffers resolve directly from memory without a second fetch copy.
        const cacheKey = `file:${existingUrl}`;
        THREE.Cache.add(cacheKey, file.bytes.slice().buffer);
        cacheKeys.push(cacheKey);
      }
      urlByKey.set(key, existingUrl);
    }

    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (isDataOrBlobUri(url)) {
        return url;
      }
      const norm = normaliseRelativePath(url);
      const base = norm.split("/").pop() ?? norm;
      return urlByKey.get(norm) ?? urlByKey.get(base) ?? url;
    });

    const loader = new GLTFLoader(manager);
    const bufferCopy = primary.bytes.slice().buffer as ArrayBuffer;
    const parseInput: ArrayBuffer | string = ext === ".glb" ? bufferCopy : (gltfText ?? "");

    let gltf: GLTF;
    try {
      gltf = await loader.parseAsync(parseInput, "");
    } catch (error) {
      const detail = error instanceof Error && error.message ? error.message : "unknown parser error";
      throw new ModelImportError(`Could not load "${primary.name}": ${detail}`);
    }

    const name = stemName(primary.name);
    const root = prepareImportedScene(gltf.scene, name);

    return {
      root,
      name: root.name,
      primaryAsset,
      companionAssets,
      warnings,
    };
  } finally {
    for (const key of cacheKeys) {
      THREE.Cache.remove(key);
    }
    THREE.Cache.enabled = previousCacheEnabled;
    for (const url of objectUrls) {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Browser helper: converts a `FileList` or `File[]` into `ImportFileInput[]`.
 */
export async function readBrowserFiles(fileList: Iterable<File>): Promise<ImportFileInput[]> {
  const inputs: ImportFileInput[] = [];
  for (const file of fileList) {
    const buffer = await file.arrayBuffer();
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    inputs.push({
      name: file.name,
      mime: file.type,
      path: relPath && relPath.trim() ? relPath : file.name,
      bytes: new Uint8Array(buffer),
    });
  }
  return inputs;
}
