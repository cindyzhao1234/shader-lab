import { describe, expect, it } from "vitest";
import {
  PROJECT_FORMAT_VERSION,
  ProjectFormatError,
  createProject,
  identityTransform,
  parseProject,
  serialiseProject,
  type ProjectManifest,
} from "./project";

const HASH = "a".repeat(64);

function populated(): ProjectManifest {
  const project = createProject("Forest Prototype", new Date("2026-01-02T03:04:05.000Z"));

  return {
    ...project,
    assets: [{ hash: HASH, name: "tree.glb", mime: "model/gltf-binary", byteLength: 2048 }],
    entries: [
      {
        id: "entry-1",
        name: "Tree",
        source: { kind: "imported", assetHash: HASH },
        transform: { position: [1, 0, -2], rotation: [0, 0.7071, 0, 0.7071], scale: [1, 1, 1] },
      },
      {
        id: "entry-2",
        name: "Ground",
        source: { kind: "primitive", primitive: "platform" },
        transform: identityTransform(),
      },
    ],
    edits: {
      "Tree/Trunk": { visible: false, material: { roughness: 0.8, colour: [0.3, 0.2, 0.1] } },
    },
    look: { lookId: "cartoon", params: { outlineThickness: 0.4, palette: "gameboy", bloom: true } },
    camera: { position: [3, 2, 4], target: [0, 0.5, 0], fov: 45 },
  };
}

describe("createProject", () => {
  it("produces a manifest that validates and starts on Original", () => {
    const project = createProject();

    expect(project.formatVersion).toBe(PROJECT_FORMAT_VERSION);
    expect(project.look.lookId).toBe("original");
    expect(() => serialiseProject(project)).not.toThrow();
  });
});

describe("round-trip", () => {
  it("survives serialise then parse unchanged", () => {
    const project = populated();
    expect(parseProject(serialiseProject(project))).toEqual(project);
  });

  it("preserves quaternion rotation and non-uniform scale exactly", () => {
    const project = populated();
    project.entries[0]!.transform = {
      position: [0.1, -0.2, 0.3],
      rotation: [0.183, 0.365, 0.548, 0.73],
      scale: [1, 2.5, 0.25],
    };

    const parsed = parseProject(serialiseProject(project));
    expect(parsed.entries[0]!.transform).toEqual(project.entries[0]!.transform);
  });

  it("keeps mixed-type Look parameters typed", () => {
    const parsed = parseProject(serialiseProject(populated()));

    expect(parsed.look.params["outlineThickness"]).toBe(0.4);
    expect(parsed.look.params["palette"]).toBe("gameboy");
    expect(parsed.look.params["bloom"]).toBe(true);
  });
});

describe("validation", () => {
  it("refuses to save a manifest that could not be loaded back", () => {
    const broken = { ...populated(), name: "" };
    expect(() => serialiseProject(broken)).toThrow(ProjectFormatError);
  });

  it("rejects an asset hash that is not a SHA-256 digest", () => {
    const broken = populated();
    broken.assets = [{ hash: "nope", name: "x", mime: "y", byteLength: 1 }];

    expect(() => serialiseProject(broken)).toThrow(/SHA-256/);
  });

  it("rejects a roughness outside 0..1", () => {
    const broken = populated();
    broken.edits["Tree/Trunk"] = { material: { roughness: 4 } };

    expect(() => serialiseProject(broken)).toThrow(ProjectFormatError);
  });

  it("reports unreadable JSON in plain language", () => {
    expect(() => parseProject("{ not json")).toThrow(/not a readable Game Look Lab project/);
  });

  it("reports a structurally wrong file as damaged", () => {
    expect(() => parseProject(JSON.stringify({ formatVersion: 1 }))).toThrow(/damaged or unsupported/);
  });

  it("refuses a project saved by a newer build instead of silently dropping data", () => {
    const future = JSON.parse(serialiseProject(populated()));
    future.formatVersion = PROJECT_FORMAT_VERSION + 1;

    expect(() => parseProject(JSON.stringify(future))).toThrow(/newer version/);
  });

  it("names the offending field so the error is actionable", () => {
    const broken = populated();
    broken.camera = { ...broken.camera, fov: -10 };

    expect(() => serialiseProject(broken)).toThrow(/camera\.fov/);
  });
});
