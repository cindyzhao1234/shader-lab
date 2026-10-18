import * as THREE from "three";
import { rgbToHex } from "../core/colour";

/**
 * Reads the three.js scene graph into plain rows and summaries for the UI.
 *
 * React never holds three objects in state; it holds these, rebuilt whenever
 * the workspace's scene revision moves. That keeps rendering and the panels
 * decoupled and means a panel can never accidentally keep a disposed mesh
 * alive.
 */

export type SceneRowKind = "mesh" | "group" | "light";
export type LightKind = "directional" | "point" | "spot" | "ambient" | "hemisphere" | "other";

export interface SceneRow {
  id: string;
  name: string;
  kind: SceneRowKind;
  lightKind?: LightKind;
  depth: number;
  visible: boolean;
  /** False when this object or any ancestor is hidden. */
  shown: boolean;
}

export interface MaterialSummary {
  type: string;
  colour?: string;
  roughness?: number;
  metalness?: number;
  hasColourTexture: boolean;
  hasNormalMap: boolean;
}

export interface ObjectSummary {
  id: string;
  name: string;
  kind: SceneRowKind;
  typeLabel: string;
  visible: boolean;
  position: [number, number, number];
  triangles?: number;
  vertices?: number;
  materials?: MaterialSummary[];
  light?: { colour: string; intensity: number; castsShadow: boolean };
}

export function displayName(object: THREE.Object3D): string {
  const name = object.name.trim();

  if (name) {
    return name;
  }

  if (isLight(object)) {
    return `Unnamed ${LIGHT_LABELS[lightKind(object)].toLowerCase()}`;
  }

  return (object as THREE.Mesh).isMesh ? "Unnamed mesh" : "Unnamed group";
}

/** Every user-facing object under `root`, depth first, excluding `root` itself. */
export function buildSceneRows(root: THREE.Object3D): SceneRow[] {
  const rows: SceneRow[] = [];
  const lightTargets = collectLightTargets(root);

  const visit = (object: THREE.Object3D, depth: number, parentShown: boolean) => {
    for (const child of object.children) {
      if (lightTargets.has(child)) {
        continue;
      }

      const kind = rowKind(child);

      if (!kind) {
        continue;
      }

      const shown = parentShown && child.visible;
      rows.push({
        id: child.uuid,
        name: displayName(child),
        kind,
        lightKind: kind === "light" ? lightKind(child as THREE.Light) : undefined,
        depth,
        visible: child.visible,
        shown,
      });
      visit(child, depth + 1, shown);
    }
  };

  visit(root, 0, true);
  return rows;
}

export function summariseObject(object: THREE.Object3D): ObjectSummary {
  const kind = rowKind(object) ?? "group";
  const summary: ObjectSummary = {
    id: object.uuid,
    name: displayName(object),
    kind,
    typeLabel: typeLabel(object),
    visible: object.visible,
    position: [object.position.x, object.position.y, object.position.z],
  };

  const mesh = object as THREE.Mesh;

  if (mesh.isMesh) {
    summary.triangles = triangleCount(mesh.geometry);
    summary.vertices = mesh.geometry.attributes.position?.count ?? 0;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    summary.materials = materials.map(summariseMaterial);
  }

  if (isLight(object)) {
    summary.light = {
      colour: rgbToHex(srgbTuple(object.color)),
      intensity: object.intensity,
      castsShadow: object.castShadow,
    };
  }

  return summary;
}

export function triangleCount(geometry: THREE.BufferGeometry): number {
  const count = geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0);
  return Math.floor(count / 3);
}

const LIGHT_LABELS: Record<LightKind, string> = {
  directional: "Sun light",
  point: "Point light",
  spot: "Spotlight",
  ambient: "Ambient light",
  hemisphere: "Sky light",
  other: "Light",
};

function typeLabel(object: THREE.Object3D): string {
  if (isLight(object)) {
    return LIGHT_LABELS[lightKind(object)];
  }

  return (object as THREE.Mesh).isMesh ? "Mesh" : "Group";
}

function rowKind(object: THREE.Object3D): SceneRowKind | undefined {
  if (isLight(object)) {
    return "light";
  }

  if ((object as THREE.Mesh).isMesh) {
    return "mesh";
  }

  // Bones, cameras and helpers are not things a beginner selects in a list.
  if ((object as THREE.Group).isGroup || object.type === "Object3D") {
    return "group";
  }

  return undefined;
}

function isLight(object: THREE.Object3D): object is THREE.Light {
  return (object as THREE.Light).isLight === true;
}

function lightKind(light: THREE.Light): LightKind {
  if ((light as THREE.DirectionalLight).isDirectionalLight) return "directional";
  if ((light as THREE.SpotLight).isSpotLight) return "spot";
  if ((light as THREE.PointLight).isPointLight) return "point";
  if ((light as THREE.AmbientLight).isAmbientLight) return "ambient";
  if ((light as THREE.HemisphereLight).isHemisphereLight) return "hemisphere";
  return "other";
}

/** Spot and directional lights aim at a helper object that is not part of the scene's content. */
function collectLightTargets(root: THREE.Object3D): Set<THREE.Object3D> {
  const targets = new Set<THREE.Object3D>();

  root.traverse((object) => {
    const target = (object as THREE.SpotLight | THREE.DirectionalLight).target;

    if (isLight(object) && target) {
      targets.add(target);
    }
  });

  return targets;
}

function summariseMaterial(material: THREE.Material): MaterialSummary {
  const standard = material as THREE.MeshStandardMaterial;
  const summary: MaterialSummary = {
    type: materialLabel(material),
    hasColourTexture: Boolean(standard.map),
    hasNormalMap: Boolean(standard.normalMap),
  };

  if (standard.color instanceof THREE.Color) {
    summary.colour = rgbToHex(srgbTuple(standard.color));
  }

  if (typeof standard.roughness === "number") {
    summary.roughness = standard.roughness;
  }

  if (typeof standard.metalness === "number") {
    summary.metalness = standard.metalness;
  }

  return summary;
}

function materialLabel(material: THREE.Material): string {
  if ((material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return "Physical";
  if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return "Standard";
  if ((material as THREE.MeshBasicMaterial).isMeshBasicMaterial) return "Unlit";
  if ((material as THREE.MeshPhongMaterial).isMeshPhongMaterial) return "Phong";
  if ((material as THREE.MeshLambertMaterial).isMeshLambertMaterial) return "Lambert";
  return material.type.replace(/^Mesh|Material$/g, "") || "Material";
}

/** Colours are stored linear; the UI shows them the way an artist picked them. */
function srgbTuple(colour: THREE.Color): [number, number, number] {
  const srgb = new THREE.Color();
  colour.getRGB(srgb, THREE.SRGBColorSpace);
  return [srgb.r, srgb.g, srgb.b];
}
