import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createDemoScene as createDemoSceneWithCanvas } from "../scenes/demo";
import { buildSceneRows, displayName, summariseObject, triangleCount } from "./sceneModel";

const createDemoScene = () =>
  createDemoSceneWithCanvas({ checker: new THREE.Texture(), rippleNormal: new THREE.Texture() });

describe("buildSceneRows", () => {
  it("lists the demo scene's objects and lights, without light targets", () => {
    const { root } = createDemoScene();
    const rows = buildSceneRows(root);

    expect(rows.map((row) => row.name)).toEqual([
      "Platform",
      "Cube",
      "Sphere",
      "Rock 1",
      "Rock 2",
      "Pebble",
      "Sun",
      "Warm Point",
      "Cool Spot",
    ]);
    expect(rows.filter((row) => row.kind === "light").map((row) => row.lightKind)).toEqual([
      "directional",
      "point",
      "spot",
    ]);
  });

  it("records nesting depth and inherited visibility", () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    parent.name = "Tree";
    const leaf = new THREE.Mesh(new THREE.BoxGeometry());
    leaf.name = "Leaf";
    parent.add(leaf);
    root.add(parent);

    parent.visible = false;
    const rows = buildSceneRows(root);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Tree", kind: "group", depth: 0, visible: false, shown: false });
    expect(rows[1]).toMatchObject({ name: "Leaf", kind: "mesh", depth: 1, visible: true, shown: false });
  });

  it("names unnamed objects by what they are", () => {
    expect(displayName(new THREE.Mesh())).toBe("Unnamed mesh");
    expect(displayName(new THREE.Group())).toBe("Unnamed group");
    expect(displayName(new THREE.PointLight())).toBe("Unnamed point light");
  });
});

describe("summariseObject", () => {
  it("describes a textured mesh and its material in sRGB", () => {
    const { objects } = createDemoScene();
    const cube = objects.find((object) => object.name === "Cube")!;
    const summary = summariseObject(cube);

    expect(summary.typeLabel).toBe("Mesh");
    expect(summary.triangles).toBe(12);
    expect(summary.materials).toHaveLength(1);
    expect(summary.materials![0]).toMatchObject({
      type: "Standard",
      hasColourTexture: true,
      hasNormalMap: false,
      roughness: 0.42,
      metalness: 0,
    });
    // Authored as sRGB (0.2, 0.45, 0.86); the summary must not show linear values.
    expect(summary.materials![0]!.colour).toBe("#3373db");
  });

  it("describes a light", () => {
    const { lights } = createDemoScene();
    const sun = summariseObject(lights[0]!);

    expect(sun.kind).toBe("light");
    expect(sun.typeLabel).toBe("Sun light");
    expect(sun.light).toMatchObject({ colour: "#fff1dd", intensity: 2.1, castsShadow: true });
  });
});

describe("triangleCount", () => {
  it("counts indexed and non-indexed geometry", () => {
    expect(triangleCount(new THREE.BoxGeometry())).toBe(12);
    expect(triangleCount(new THREE.BoxGeometry().toNonIndexed())).toBe(12);
  });
});
