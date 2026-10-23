import * as THREE from "three";
import type { Pass } from "three/addons/postprocessing/Pass.js";
import type { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK_ID, EXPERIMENTAL_LOOK_ID } from "../looks/catalogue";
import { LookEngine, type ComposerLike } from "./lookEngine";

class FakeComposer implements ComposerLike {
  passes: Pass[] = [
    { enabled: true } as Pass, // RenderPass stand-in
    { enabled: true } as Pass, // OutputPass stand-in
  ];

  insertPass(pass: Pass, index: number): void {
    this.passes.splice(index, 0, pass);
  }

  removePass(pass: Pass): void {
    const idx = this.passes.indexOf(pass);
    if (idx !== -1) {
      this.passes.splice(idx, 1);
    }
  }
}

function buildTestScene() {
  const scene = new THREE.Scene();
  scene.environmentIntensity = 0.42;

  const diffuseMap = new THREE.Texture();
  diffuseMap.name = "AlbedoTex";
  const normalMap = new THREE.Texture();
  normalMap.name = "NormalTex";

  const sourceMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(0.2, 0.5, 0.8, THREE.SRGBColorSpace),
    roughness: 0.4,
    metalness: 0.1,
    map: diffuseMap,
    normalMap,
    transparent: true,
    opacity: 0.85,
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMat);
  mesh.name = "HeroCrate";

  const subMaterialA = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.6 });
  const subMaterialB = new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.2 });
  const multiMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [subMaterialA, subMaterialB]);
  multiMesh.name = "MultiMaterialPart";

  const group = new THREE.Group();
  group.add(mesh, multiMesh);
  scene.add(group);

  const sun = new THREE.DirectionalLight(0xfff1dd, 2.1);
  scene.add(sun);

  return {
    scene,
    group,
    mesh,
    multiMesh,
    sourceMat,
    subMaterialA,
    subMaterialB,
    diffuseMap,
    normalMap,
    sun,
  };
}

describe("LookEngine", () => {
  it("treats Original as a true identity no-op without cloning materials or adding passes", () => {
    const { scene, mesh, sourceMat, sun } = buildTestScene();
    const composer = new FakeComposer();
    const engine = new LookEngine({ scene, composer });

    const initialSunHex = sun.color.getHexString();
    engine.applyLook(DEFAULT_LOOK_ID);

    expect(engine.currentLookId).toBe(DEFAULT_LOOK_ID);
    expect(mesh.material).toBe(sourceMat);
    expect(sun.intensity).toBe(2.1);
    expect(sun.color.getHexString()).toBe(initialSunHex);
    expect(composer.passes).toHaveLength(2);
    expect(engine.diagnostics.activeMeshClones).toBe(0);
  });

  it("applies the experimental Look across materials, lights and post-processing without mutating source assets", () => {
    const {
      scene,
      mesh,
      multiMesh,
      sourceMat,
      subMaterialA,
      subMaterialB,
      diffuseMap,
      normalMap,
      sun,
    } = buildTestScene();
    const composer = new FakeComposer();
    const engine = new LookEngine({ scene, composer });

    const originalColourHex = sourceMat.color.getHexString();
    const originalRoughness = sourceMat.roughness;
    const originalSunHex = sun.color.getHexString();

    engine.applyLook(EXPERIMENTAL_LOOK_ID, {
      toneBands: 5,
      surfaceWarmth: 0.6,
      saturation: 1.2,
      contrast: 1.25,
      vignette: 0.4,
    });

    // 1. Source materials are completely unmutated
    expect(sourceMat.color.getHexString()).toBe(originalColourHex);
    expect(sourceMat.roughness).toBe(originalRoughness);
    expect(sourceMat.map).toBe(diffuseMap);
    expect(sourceMat.normalMap).toBe(normalMap);

    // 2. Mesh now wears a cloned material that preserves textures & transparency
    const clonedMat = mesh.material as THREE.MeshStandardMaterial;
    expect(clonedMat).not.toBe(sourceMat);
    expect(clonedMat.map).toBe(diffuseMap);
    expect(clonedMat.normalMap).toBe(normalMap);
    expect(clonedMat.transparent).toBe(true);
    expect(clonedMat.opacity).toBe(0.85);
    expect(clonedMat.color.getHexString()).not.toBe(originalColourHex);

    // 3. GLSL onBeforeCompile hook injects the band-quantisation shader code and uniform
    const fakeShader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "void main() {}",
      fragmentShader: "void main() {\n#include <opaque_fragment>\n}",
    };
    clonedMat.onBeforeCompile(fakeShader as any, {} as any);
    expect(fakeShader.uniforms.uLookToneBands?.value).toBe(5);
    expect(fakeShader.fragmentShader).toContain("uniform float uLookToneBands;");
    expect(fakeShader.fragmentShader).toContain("targetLuma");

    // 4. Multi-material meshes are also cloned per slot
    const clonedMulti = multiMesh.material as THREE.Material[];
    expect(Array.isArray(clonedMulti)).toBe(true);
    expect(clonedMulti[0]).not.toBe(subMaterialA);
    expect(clonedMulti[1]).not.toBe(subMaterialB);

    // 5. Lights and environment intensity are modulated
    expect(sun.intensity).not.toBe(2.1);
    expect(sun.color.getHexString()).not.toBe(originalSunHex);
    expect(scene.environmentIntensity).not.toBe(0.42);

    // 6. Linear post-processing pass is inserted between RenderPass and OutputPass
    expect(composer.passes).toHaveLength(3);
    const gradingPass = composer.passes[1] as ShaderPass;
    expect(gradingPass.uniforms.uSaturation?.value).toBe(1.2);
    expect(gradingPass.uniforms.uContrast?.value).toBe(1.25);
    expect(gradingPass.uniforms.uVignette?.value).toBe(0.4);
  });

  it("updates parameters in-place without reallocating or recompiling cloned materials", () => {
    const { scene, mesh } = buildTestScene();
    const composer = new FakeComposer();
    const engine = new LookEngine({ scene, composer });

    engine.applyLook(EXPERIMENTAL_LOOK_ID);
    const clonedBefore = mesh.material as THREE.MeshStandardMaterial;
    const passBefore = composer.passes[1] as ShaderPass;

    engine.updateParams({
      toneBands: 9,
      surfaceWarmth: -0.5,
      saturation: 0.4,
      contrast: 1.4,
      vignette: 0.75,
    });

    // Exact same cloned Material and ShaderPass instances are updated in-place
    expect(mesh.material).toBe(clonedBefore);
    expect(composer.passes[1]).toBe(passBefore);
    expect(engine.diagnostics.disposedMaterialCount).toBe(0);
    expect((clonedBefore.userData.lookUniforms as any).uLookToneBands.value).toBe(9);
    expect(passBefore.uniforms.uSaturation?.value).toBe(0.4);
    expect(passBefore.uniforms.uContrast?.value).toBe(1.4);
    expect(passBefore.uniforms.uVignette?.value).toBe(0.75);
  });

  it("restores exact original materials and lights and disposes clones when switching back to Original", () => {
    const {
      scene,
      mesh,
      multiMesh,
      sourceMat,
      subMaterialA,
      subMaterialB,
      diffuseMap,
      sun,
    } = buildTestScene();
    const composer = new FakeComposer();
    const engine = new LookEngine({ scene, composer });

    const originalSunHex = sun.color.getHexString();

    for (let cycle = 0; cycle < 3; cycle += 1) {
      engine.applyLook(EXPERIMENTAL_LOOK_ID, { toneBands: 3 + cycle, surfaceWarmth: 0.5 });
      expect(mesh.material).not.toBe(sourceMat);
      expect(composer.passes).toHaveLength(3);

      engine.applyLook(DEFAULT_LOOK_ID);
      expect(mesh.material).toBe(sourceMat);
      expect(multiMesh.material).toEqual([subMaterialA, subMaterialB]);
      expect(sun.intensity).toBe(2.1);
      expect(sun.color.getHexString()).toBe(originalSunHex);
      expect(scene.environmentIntensity).toBe(0.42);
      expect(composer.passes).toHaveLength(2);
      expect(engine.diagnostics.activeMeshClones).toBe(0);
      expect(engine.diagnostics.activePostPasses).toBe(0);
    }

    // 3 cycles * (1 single-mat mesh + 2 multi-mat slots) = 9 cloned materials disposed, 3 passes disposed
    expect(engine.diagnostics.disposedMaterialCount).toBe(9);
    expect(engine.diagnostics.disposedPassCount).toBe(3);
    // Source texture is untouched
    expect(sourceMat.map).toBe(diffuseMap);
  });

  it("synchronises newly imported and removed meshes while a Look is active", () => {
    const { scene, group } = buildTestScene();
    const composer = new FakeComposer();
    const engine = new LookEngine({ scene, composer });

    engine.applyLook(EXPERIMENTAL_LOOK_ID);
    expect(engine.diagnostics.activeMeshClones).toBe(2);

    const importedMat = new THREE.MeshStandardMaterial({ color: 0x336699 });
    const importedMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5), importedMat);
    group.add(importedMesh);

    engine.syncScene(scene);
    expect(engine.diagnostics.activeMeshClones).toBe(3);
    expect(importedMesh.material).not.toBe(importedMat);

    group.remove(importedMesh);
    engine.syncScene(scene);
    expect(engine.diagnostics.activeMeshClones).toBe(2);
    expect(importedMesh.material).toBe(importedMat);
  });
});
