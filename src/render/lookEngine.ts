import * as THREE from "three";
import type { Pass } from "three/addons/postprocessing/Pass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { DEFAULT_LOOK_ID, EXPERIMENTAL_LOOK_ID } from "../looks/catalogue";
import { DEFAULT_LOOK_REGISTRY, type LookRegistry } from "../looks/registry";
import type { LookParams } from "../looks/schema";

/**
 * The Modular Look Engine.
 *
 * Separates a Look into three composable runtime stages:
 *   1. Material treatment (`LookMaterialTreatment`) — non-destructive material
 *      cloning, property modulation and custom GLSL `onBeforeCompile` hooks.
 *   2. Lighting treatment (`LookLightingTreatment`) — non-destructive adjustments
 *      to scene lights and environment intensity relative to a captured baseline.
 *   3. Screen-space post-processing (`LookPostTreatment`) — linear-space passes
 *      inserted into `EffectComposer` before the final tone-mapping `OutputPass`.
 *
 * Asset Preservation Guarantee:
 * - Source materials, textures and geometries on scene meshes are NEVER mutated
 *   or disposed by the Look Engine.
 * - Switching back to `Original` restores the exact original `THREE.Material`
 *   instances (`===` reference equality) and original light intensities/colours,
 *   and disposes all temporary cloned materials and post-processing passes.
 */

export interface ComposerLike {
  passes: Pass[];
  insertPass(pass: Pass, index: number): void;
  removePass(pass: Pass): void;
}

export interface BaselineLightState {
  readonly light: THREE.Light;
  readonly color: THREE.Color;
  readonly intensity: number;
}

export interface LookLightingContext {
  readonly scene: THREE.Scene;
  readonly baselineEnvironmentIntensity: number;
  readonly lights: readonly BaselineLightState[];
}

export interface LookMaterialTreatment {
  /**
   * Creates a Look-owned clone of `sourceMaterial` configured for `params`.
   * Must never mutate `sourceMaterial` or its textures.
   */
  createMaterial(sourceMaterial: THREE.Material, params: Readonly<LookParams>): THREE.Material;
  /**
   * Updates `clonedMaterial` in-place when parameters change, avoiding shader
   * recompilation or material reallocation during slider drags.
   */
  updateMaterial(
    clonedMaterial: THREE.Material,
    sourceMaterial: THREE.Material,
    params: Readonly<LookParams>,
  ): void;
}

export interface LookLightingTreatment {
  applyLighting(context: LookLightingContext, params: Readonly<LookParams>): void;
}

export interface LookPostTreatment<TPass extends Pass = Pass> {
  createPasses(params: Readonly<LookParams>): TPass[];
  updatePasses(passes: readonly TPass[], params: Readonly<LookParams>): void;
  disposePasses?(passes: readonly TPass[]): void;
}

export interface LookPipelineHandler {
  readonly id: string;
  readonly isIdentity?: boolean;
  readonly material?: LookMaterialTreatment;
  readonly lighting?: LookLightingTreatment;
  readonly post?: LookPostTreatment;
}

interface MeshMaterialBinding {
  readonly mesh: THREE.Mesh;
  readonly original: THREE.Material | THREE.Material[];
  readonly cloned: THREE.Material | THREE.Material[];
}

interface BandShaderUniforms {
  uLookToneBands: { value: number };
}

/**
 * Installs a GLSL fragment hook onto a cloned standard/physical material that
 * quantises outgoing direct+indirect light into `uLookToneBands` discrete steps.
 * Because `uLookToneBands` is a uniform, dragging the Shading Bands slider
 * updates the GPU uniform in-place without recompiling the shader program.
 */
function attachBandShadingHook(material: THREE.Material, initialBands: number): void {
  const uniforms: BandShaderUniforms = {
    uLookToneBands: { value: initialBands },
  };
  material.userData = {
    ...material.userData,
    lookUniforms: uniforms,
  };

  material.customProgramCacheKey = () => "gll-stage3-band-shading-v1";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLookToneBands = uniforms.uLookToneBands;
    shader.fragmentShader =
      `uniform float uLookToneBands;\n` +
      shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `
        if (uLookToneBands > 1.0) {
          float luma = max(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)), 0.0001);
          float scaled = log2(1.0 + luma * 4.0);
          float quantised = (floor(scaled * uLookToneBands) + 0.5) / uLookToneBands;
          float targetLuma = (exp2(quantised) - 1.0) / 4.0;
          outgoingLight *= mix(1.0, targetLuma / luma, 0.72);
        }
        #include <opaque_fragment>
        `,
      );
  };
}

function applyExperimentalMaterialParams(
  cloned: THREE.Material,
  source: THREE.Material,
  params: Readonly<LookParams>,
): void {
  const toneBands = typeof params.toneBands === "number" ? params.toneBands : 4;
  const warmth = typeof params.surfaceWarmth === "number" ? params.surfaceWarmth : 0.25;

  const uniforms = cloned.userData?.lookUniforms as BandShaderUniforms | undefined;
  if (uniforms?.uLookToneBands) {
    uniforms.uLookToneBands.value = toneBands;
  }

  const srcStd = source as THREE.MeshStandardMaterial;
  const dstStd = cloned as THREE.MeshStandardMaterial;

  if (srcStd.color instanceof THREE.Color && dstStd.color instanceof THREE.Color) {
    const tint =
      warmth >= 0
        ? new THREE.Color().setRGB(1.0, 0.91, 0.78, THREE.SRGBColorSpace)
        : new THREE.Color().setRGB(0.78, 0.88, 1.0, THREE.SRGBColorSpace);
    dstStd.color.copy(srcStd.color).lerp(tint, Math.abs(warmth) * 0.35);
  }

  if (typeof srcStd.roughness === "number" && typeof dstStd.roughness === "number") {
    dstStd.roughness = THREE.MathUtils.clamp(srcStd.roughness + 0.08, 0.05, 1.0);
  }
}

/**
 * Screen-space linear grading shader for the Stage 3 experimental Look.
 * Runs in linear HDR space before `OutputPass` applies ACES tone mapping.
 */
const EXPERIMENTAL_GRADING_SHADER = {
  name: "Stage3ExperimentalGradingShader",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 0.85 },
    uContrast: { value: 1.15 },
    uVignette: { value: 0.3 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = max(texel.rgb, vec3(0.0));

      // Saturation in linear Rec.709
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(luma), col, uSaturation), vec3(0.0));

      // Midtone contrast around 0.18 middle grey
      col = max(pow(col / 0.18, vec3(uContrast)) * 0.18, vec3(0.0));

      // Subtle frame vignette
      vec2 centered = vUv - 0.5;
      float distSq = dot(centered, centered) * 2.2;
      float vig = clamp(1.0 - distSq * uVignette, 0.15, 1.0);
      col *= vig;

      gl_FragColor = vec4(col, texel.a);
    }
  `,
};

export function createExperimentalLookHandler(): LookPipelineHandler {
  return {
    id: EXPERIMENTAL_LOOK_ID,
    isIdentity: false,
    material: {
      createMaterial(sourceMaterial, params) {
        const cloned = sourceMaterial.clone();
        const bands = typeof params.toneBands === "number" ? params.toneBands : 4;
        attachBandShadingHook(cloned, bands);
        applyExperimentalMaterialParams(cloned, sourceMaterial, params);
        return cloned;
      },
      updateMaterial(clonedMaterial, sourceMaterial, params) {
        applyExperimentalMaterialParams(clonedMaterial, sourceMaterial, params);
      },
    },
    lighting: {
      applyLighting(context, params) {
        const warmth = typeof params.surfaceWarmth === "number" ? params.surfaceWarmth : 0.25;
        const warmTint =
          warmth >= 0
            ? new THREE.Color().setRGB(1.0, 0.9, 0.76, THREE.SRGBColorSpace)
            : new THREE.Color().setRGB(0.76, 0.87, 1.0, THREE.SRGBColorSpace);

        context.scene.environmentIntensity =
          context.baselineEnvironmentIntensity * (1 + warmth * 0.15);

        for (const entry of context.lights) {
          entry.light.color.copy(entry.color).lerp(warmTint, Math.abs(warmth) * 0.4);
          entry.light.intensity = entry.intensity * (1 + warmth * 0.12);
        }
      },
    },
    post: {
      createPasses(params) {
        const pass = new ShaderPass(EXPERIMENTAL_GRADING_SHADER);
        this.updatePasses([pass], params);
        return [pass];
      },
      updatePasses(passes, params) {
        const pass = passes[0] as ShaderPass | undefined;
        if (!pass?.uniforms) return;
        if (pass.uniforms.uSaturation) {
          pass.uniforms.uSaturation.value =
            typeof params.saturation === "number" ? params.saturation : 0.85;
        }
        if (pass.uniforms.uContrast) {
          pass.uniforms.uContrast.value =
            typeof params.contrast === "number" ? params.contrast : 1.15;
        }
        if (pass.uniforms.uVignette) {
          pass.uniforms.uVignette.value =
            typeof params.vignette === "number" ? params.vignette : 0.3;
        }
      },
      disposePasses(passes) {
        for (const pass of passes) {
          const shaderPass = pass as ShaderPass;
          shaderPass.material?.dispose();
          shaderPass.fsQuad?.dispose();
        }
      },
    },
  };
}

export interface LookEngineOptions {
  readonly scene: THREE.Scene;
  readonly composer?: ComposerLike;
  readonly registry?: LookRegistry;
}

export class LookEngine {
  readonly registry: LookRegistry;

  private readonly scene: THREE.Scene;
  private readonly composer: ComposerLike | undefined;
  private readonly handlers = new Map<string, LookPipelineHandler>();

  private activeLookId = DEFAULT_LOOK_ID;
  private activeParams: LookParams = {};
  private readonly meshBindings = new Map<THREE.Mesh, MeshMaterialBinding>();
  private readonly knownOriginalMaterials = new WeakMap<
    THREE.Mesh,
    THREE.Material | THREE.Material[]
  >();
  private readonly knownOriginalLights = new WeakMap<
    THREE.Light,
    { color: THREE.Color; intensity: number }
  >();
  private readonly baselineLights = new Map<THREE.Light, BaselineLightState>();
  private baselineEnvironmentIntensity: number;
  private hasLightingBaseline = false;
  private activePasses: Pass[] = [];
  private disposedMaterialCount = 0;
  private disposedPassCount = 0;

  constructor(options: LookEngineOptions) {
    this.scene = options.scene;
    this.composer = options.composer;
    this.registry = options.registry ?? DEFAULT_LOOK_REGISTRY;
    this.baselineEnvironmentIntensity = options.scene.environmentIntensity ?? 1;

    this.registerHandler({ id: DEFAULT_LOOK_ID, isIdentity: true });
    this.registerHandler(createExperimentalLookHandler());
  }

  registerHandler(handler: LookPipelineHandler): void {
    this.handlers.set(handler.id, handler);
  }

  get currentLookId(): string {
    return this.activeLookId;
  }

  get currentParams(): Readonly<LookParams> {
    return this.activeParams;
  }

  /** Diagnostic counters used by tests to verify zero GPU leaks across switches. */
  get diagnostics(): {
    activeMeshClones: number;
    activePostPasses: number;
    disposedMaterialCount: number;
    disposedPassCount: number;
  } {
    return {
      activeMeshClones: this.meshBindings.size,
      activePostPasses: this.activePasses.length,
      disposedMaterialCount: this.disposedMaterialCount,
      disposedPassCount: this.disposedPassCount,
    };
  }

  /**
   * Switches to `lookId` with `rawParams` (validated against the Look's schema).
   * Always restores any previous Look's material clones, light adjustments and
   * post passes first so repeated switches never accumulate state or leak GPU
   * objects.
   */
  applyLook(
    lookId: string,
    rawParams?: Readonly<Record<string, unknown>>,
    targetRoot: THREE.Object3D = this.scene,
  ): { lookId: string; params: LookParams } {
    const resolvedId = this.registry.resolveId(lookId);
    const validatedParams = this.registry.validateParams(resolvedId, rawParams);

    // Tear down any currently active Look treatments and restore exact originals.
    this.restoreOriginalState();

    this.activeLookId = resolvedId;
    this.activeParams = validatedParams;

    const handler = this.handlers.get(resolvedId);
    if (!handler || handler.isIdentity) {
      return { lookId: resolvedId, params: validatedParams };
    }

    this.captureLightingBaseline(targetRoot);

    if (handler.material) {
      this.applyMaterialTreatment(targetRoot, handler.material, validatedParams);
    }

    if (handler.lighting) {
      handler.lighting.applyLighting(this.buildLightingContext(), validatedParams);
    }

    if (handler.post && this.composer) {
      const passes = handler.post.createPasses(validatedParams);
      // Insert before OutputPass (the last pass in the chain) so Look passes
      // operate in linear space prior to tone mapping.
      const insertIndex = Math.max(1, this.composer.passes.length - 1);
      for (let i = 0; i < passes.length; i += 1) {
        this.composer.insertPass(passes[i]!, insertIndex + i);
      }
      this.activePasses = passes;
    }

    return { lookId: resolvedId, params: validatedParams };
  }

  /**
   * Updates parameters of the currently active Look in-place without
   * rebuilding materials or recreating post-processing passes.
   */
  updateParams(
    rawParams: Readonly<Record<string, unknown>>,
    targetRoot: THREE.Object3D = this.scene,
  ): LookParams {
    const validated = this.registry.validateParams(this.activeLookId, {
      ...this.activeParams,
      ...rawParams,
    });
    this.activeParams = validated;

    const handler = this.handlers.get(this.activeLookId);
    if (!handler || handler.isIdentity) {
      return validated;
    }

    if (handler.material) {
      // Ensure any newly imported meshes are bound, then update in-place.
      this.syncScene(targetRoot);
      for (const binding of this.meshBindings.values()) {
        updateBindingMaterials(binding, handler.material, validated);
      }
    }

    if (handler.lighting) {
      this.captureLightingBaseline(targetRoot);
      handler.lighting.applyLighting(this.buildLightingContext(), validated);
    }

    if (handler.post && this.activePasses.length > 0) {
      handler.post.updatePasses(this.activePasses, validated);
    }

    return validated;
  }

  /**
   * Synchronises the active Look with the scene graph after models are imported
   * or removed. Any newly added meshes receive cloned Look materials; any
   * removed meshes have their temporary clones disposed and original materials
   * restored.
   */
  syncScene(targetRoot: THREE.Object3D = this.scene): void {
    const handler = this.handlers.get(this.activeLookId);
    if (!handler || handler.isIdentity) {
      return;
    }

    const liveMeshes = new Set<THREE.Mesh>();
    targetRoot.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        liveMeshes.add(mesh);
      }
    });

    // Clean up bindings for meshes that were removed from the scene.
    for (const [mesh, binding] of [...this.meshBindings.entries()]) {
      if (!liveMeshes.has(mesh)) {
        mesh.material = binding.original;
        this.disposeClonedMaterials(binding.cloned);
        this.meshBindings.delete(mesh);
      }
    }

    if (handler.material) {
      for (const mesh of liveMeshes) {
        if (!this.meshBindings.has(mesh)) {
          this.bindMesh(mesh, handler.material, this.activeParams);
        }
      }
    }

    if (handler.lighting) {
      this.captureLightingBaseline(targetRoot);
      handler.lighting.applyLighting(this.buildLightingContext(), this.activeParams);
    }
  }

  /**
   * Temporarily switches the scene and composer to the exact `Original`
   * (identity) state for the duration of `callback`, then restores the active
   * Look's cloned materials, lighting and post-processing passes without
   * allocating, cloning or disposing any GPU resources.
   *
   * Used by Stage 4 real-time Before/After comparison so the left (Original)
   * and right (Active Look) views render in the same frame with zero material
   * churn or shader recompilation.
   */
  withTemporaryOriginal<T>(callback: () => T): T {
    const handler = this.handlers.get(this.activeLookId);
    if (!handler || handler.isIdentity) {
      return callback();
    }

    const previousPassEnabled = this.activePasses.map((pass) => pass.enabled);

    for (const binding of this.meshBindings.values()) {
      binding.mesh.material = binding.original;
    }

    if (this.hasLightingBaseline) {
      this.scene.environmentIntensity = this.baselineEnvironmentIntensity;
      for (const state of this.baselineLights.values()) {
        state.light.color.copy(state.color);
        state.light.intensity = state.intensity;
      }
    }

    for (const pass of this.activePasses) {
      pass.enabled = false;
    }

    try {
      return callback();
    } finally {
      for (const binding of this.meshBindings.values()) {
        binding.mesh.material = binding.cloned;
      }

      if (handler.lighting && this.hasLightingBaseline) {
        handler.lighting.applyLighting(this.buildLightingContext(), this.activeParams);
      }

      for (let i = 0; i < this.activePasses.length; i += 1) {
        const pass = this.activePasses[i];
        if (pass) {
          pass.enabled = previousPassEnabled[i] ?? true;
        }
      }
    }
  }

  /**
   * Restores every mesh's exact original material, restores baseline light
   * colours/intensities, and removes and disposes all Look post-processing passes.
   */
  restoreOriginalState(): void {
    for (const binding of this.meshBindings.values()) {
      binding.mesh.material = binding.original;
      this.disposeClonedMaterials(binding.cloned);
    }
    this.meshBindings.clear();

    if (this.hasLightingBaseline) {
      this.scene.environmentIntensity = this.baselineEnvironmentIntensity;
      for (const state of this.baselineLights.values()) {
        state.light.color.copy(state.color);
        state.light.intensity = state.intensity;
      }
      this.baselineLights.clear();
      this.hasLightingBaseline = false;
    }

    if (this.activePasses.length > 0) {
      const handler = this.handlers.get(this.activeLookId);
      if (this.composer) {
        for (const pass of this.activePasses) {
          this.composer.removePass(pass);
        }
      }
      if (handler?.post?.disposePasses) {
        handler.post.disposePasses(this.activePasses);
      } else {
        for (const pass of this.activePasses) {
          (pass as ShaderPass).material?.dispose();
        }
      }
      this.disposedPassCount += this.activePasses.length;
      this.activePasses = [];
    }
  }

  dispose(): void {
    this.restoreOriginalState();
  }

  private applyMaterialTreatment(
    root: THREE.Object3D,
    treatment: LookMaterialTreatment,
    params: Readonly<LookParams>,
  ): void {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) {
        return;
      }
      this.bindMesh(mesh, treatment, params);
    });
  }

  private bindMesh(
    mesh: THREE.Mesh,
    treatment: LookMaterialTreatment,
    params: Readonly<LookParams>,
  ): void {
    let original = this.knownOriginalMaterials.get(mesh);
    if (!original) {
      original = mesh.material;
      this.knownOriginalMaterials.set(mesh, original);
    }

    const cloned = Array.isArray(original)
      ? original.map((mat) => treatment.createMaterial(mat, params))
      : treatment.createMaterial(original, params);

    mesh.material = cloned;
    this.meshBindings.set(mesh, { mesh, original, cloned });
  }

  private captureLightingBaseline(root: THREE.Object3D): void {
    if (!this.hasLightingBaseline) {
      this.baselineEnvironmentIntensity = this.scene.environmentIntensity ?? 1;
      this.hasLightingBaseline = true;
    }

    const recordLight = (object: THREE.Object3D) => {
      const light = object as THREE.Light;
      if (!light.isLight || this.baselineLights.has(light)) {
        return;
      }
      let known = this.knownOriginalLights.get(light);
      if (!known) {
        known = { color: light.color.clone(), intensity: light.intensity };
        this.knownOriginalLights.set(light, known);
      }
      this.baselineLights.set(light, {
        light,
        color: known.color.clone(),
        intensity: known.intensity,
      });
    };

    this.scene.traverse(recordLight);
    if (root !== this.scene) {
      root.traverse(recordLight);
    }
  }

  private buildLightingContext(): LookLightingContext {
    return {
      scene: this.scene,
      baselineEnvironmentIntensity: this.baselineEnvironmentIntensity,
      lights: [...this.baselineLights.values()],
    };
  }

  private disposeClonedMaterials(cloned: THREE.Material | THREE.Material[]): void {
    const list = Array.isArray(cloned) ? cloned : [cloned];
    for (const mat of list) {
      mat.dispose();
      this.disposedMaterialCount += 1;
    }
  }
}

function updateBindingMaterials(
  binding: MeshMaterialBinding,
  treatment: LookMaterialTreatment,
  params: Readonly<LookParams>,
): void {
  if (Array.isArray(binding.cloned) && Array.isArray(binding.original)) {
    for (let i = 0; i < binding.cloned.length; i += 1) {
      const clonedMat = binding.cloned[i];
      const origMat = binding.original[i];
      if (clonedMat && origMat) {
        treatment.updateMaterial(clonedMat, origMat, params);
      }
    }
  } else if (!Array.isArray(binding.cloned) && !Array.isArray(binding.original)) {
    treatment.updateMaterial(binding.cloned, binding.original, params);
  }
}
