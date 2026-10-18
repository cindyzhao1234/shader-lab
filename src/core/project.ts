/**
 * The serialisable project.
 *
 * three.js owns the live scene. This module owns the part that has to survive a
 * browser restart, and it deliberately never references a three.js object.
 *
 * A project records what was imported (by content hash), what was instantiated
 * from it, and an edit layer of user overrides. Reopening re-imports the stored
 * bytes and replays the edits, which keeps project files small, keeps imported
 * data exact, and makes "reset to imported" a deletion rather than a snapshot
 * restore.
 */

import { z } from "zod";

export const PROJECT_FORMAT_VERSION = 1;

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const quat = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const transformSchema = z.object({
  position: vec3,
  /** Quaternion xyzw. Euler angles are a UI concern, not a storage format. */
  rotation: quat,
  scale: vec3,
});

export const assetRefSchema = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/, "asset hash must be a SHA-256 hex digest"),
  name: z.string(),
  mime: z.string(),
  byteLength: z.number().int().nonnegative(),
});

export const primitiveKindSchema = z.enum(["platform", "cube", "sphere", "rock"]);

export const sceneEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("imported"), assetHash: z.string() }),
    z.object({ kind: z.literal("primitive"), primitive: primitiveKindSchema }),
  ]),
  transform: transformSchema,
});

export const materialOverrideSchema = z.object({
  colour: vec3.optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  normalScale: z.number().optional(),
});

export const objectOverrideSchema = z.object({
  name: z.string().optional(),
  visible: z.boolean().optional(),
  transform: transformSchema.partial().optional(),
  material: materialOverrideSchema.optional(),
});

/**
 * Keyed by a stable path through the imported hierarchy rather than by three's
 * generated UUIDs, which differ on every re-import.
 */
export const editLayerSchema = z.record(z.string(), objectOverrideSchema);

export const lookStateSchema = z.object({
  lookId: z.string(),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
});

export const cameraStateSchema = z.object({
  position: vec3,
  target: vec3,
  fov: z.number().positive(),
});

export const projectManifestSchema = z.object({
  formatVersion: z.number().int().positive(),
  name: z.string().min(1),
  createdAt: z.string(),
  modifiedAt: z.string(),
  assets: z.array(assetRefSchema),
  entries: z.array(sceneEntrySchema),
  edits: editLayerSchema,
  look: lookStateSchema,
  camera: cameraStateSchema,
});

export type Transform = z.infer<typeof transformSchema>;
export type AssetRef = z.infer<typeof assetRefSchema>;
export type PrimitiveKind = z.infer<typeof primitiveKindSchema>;
export type SceneEntry = z.infer<typeof sceneEntrySchema>;
export type MaterialOverride = z.infer<typeof materialOverrideSchema>;
export type ObjectOverride = z.infer<typeof objectOverrideSchema>;
export type EditLayer = z.infer<typeof editLayerSchema>;
export type LookState = z.infer<typeof lookStateSchema>;
export type CameraState = z.infer<typeof cameraStateSchema>;
export type ProjectManifest = z.infer<typeof projectManifestSchema>;

export const identityTransform = (): Transform => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
});

export function createProject(name = "Untitled Project", at = new Date()): ProjectManifest {
  const timestamp = at.toISOString();

  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    name,
    createdAt: timestamp,
    modifiedAt: timestamp,
    assets: [],
    entries: [],
    edits: {},
    look: { lookId: "original", params: {} },
    camera: { position: [4.2, 2.6, 5.2], target: [0, 0.35, 0], fov: 50 },
  };
}

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFormatError";
  }
}

export function serialiseProject(manifest: ProjectManifest): string {
  // Validated on write as well as read: a project that cannot be loaded should
  // never reach the user's disk in the first place.
  const result = projectManifestSchema.safeParse(manifest);

  if (!result.success) {
    throw new ProjectFormatError(`Refusing to save an invalid project.\n${describe(result.error)}`);
  }

  return JSON.stringify(result.data, null, 2);
}

export function parseProject(text: string): ProjectManifest {
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFormatError("This file is not a readable Game Look Lab project.");
  }

  const result = projectManifestSchema.safeParse(raw);

  if (!result.success) {
    throw new ProjectFormatError(`This project file is damaged or unsupported.\n${describe(result.error)}`);
  }

  if (result.data.formatVersion > PROJECT_FORMAT_VERSION) {
    throw new ProjectFormatError(
      `This project was saved by a newer version of Game Look Lab (format ${result.data.formatVersion}; this build reads up to ${PROJECT_FORMAT_VERSION}).`,
    );
  }

  return result.data;
}

function describe(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}
