import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { DEFAULT_LOOK_ID } from "../looks/catalogue";
import type { LookParams } from "../looks/schema";
import {
  SPLIT_BOUNDS,
  clampSplitRatio,
  computeSideBySideRegions,
  computeSplitRegions,
  type ComparisonMode,
} from "./comparison";
import { LookEngine } from "./lookEngine";

/**
 * The rendering stage: renderer, scene, camera, controls and the post chain
 * that every Look will later plug into.
 *
 * Colour handling is the important part. The scene is lit and composited in
 * linear space inside a half-float target, and only the final OutputPass
 * applies tone mapping and encodes to sRGB. Getting this wrong is invisible
 * until bloom and grading arrive, at which point every tuned value is wrong.
 */

/** Frames excluded from the timing average while shaders compile. */
const WARMUP_FRAMES = 3;

/** Consecutive still frames before the camera counts as settled. */
const SETTLE_FRAMES = 8;

const FOCUS_DURATION_MS = 520;

/** The three-quarter view the demo scene was composed for. */
const DEFAULT_VIEW_DIRECTION = new THREE.Vector3(4.2, 2.6, 5.2).normalize();

export const FOV_RANGE = { min: 20, max: 80 } as const;

interface CameraTween {
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  startedAt: number;
  duration: number;
}

export interface FrameOptions {
  padding?: number;
  animate?: boolean;
  /** View direction from the target towards the camera. Defaults to the current one. */
  direction?: THREE.Vector3;
}

export interface StageCapabilities {
  /** False when the GPU cannot render to a half-float target. */
  highPrecision: boolean;
  /** Multisample count actually in use. Zero means no MSAA. */
  samples: number;
  maxTextureSize: number;
}

export interface StageStats {
  /**
   * Milliseconds spent in the last rendered frame. Reported instead of fps
   * because rendering is on demand: a static scene renders a few times a
   * second, and an fps counter would read as terrible performance when
   * nothing is actually wrong.
   *
   * NaN until enough frames have rendered to give an honest figure; the
   * first few are dominated by shader compilation.
   */
  frameMs: number;
  triangles: number;
  drawCalls: number;
  programs: number;
}

export interface StageOptions {
  canvas: HTMLCanvasElement;
  /** Clamped device pixel ratio. Above 2 the cost rarely buys visible quality. */
  maxPixelRatio?: number;
}

export class RenderStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly composer: EffectComposer;
  readonly capabilities: StageCapabilities;
  readonly lookEngine: LookEngine;

  private readonly renderPass: RenderPass;
  private readonly outputPass: OutputPass;
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly environment: THREE.Texture;
  private readonly resizeObserver: ResizeObserver;
  private readonly maxPixelRatio: number;

  private statsListener: ((stats: StageStats) => void) | undefined;
  private frameHandle = 0;
  private needsRender = true;
  private disposed = false;
  private smoothedFrameMs = 0;
  private framesRendered = 0;
  private readonly settledListeners = new Set<() => void>();
  private readonly firstFrameListeners = new Set<() => void>();
  private cameraMoving = false;
  private quietFrames = 0;
  private tween: CameraTween | undefined;
  private comparisonMode: ComparisonMode = "off";
  private splitRatio: number = SPLIT_BOUNDS.default;
  private viewportWidth = 1;
  private viewportHeight = 1;

  constructor(options: StageOptions) {
    const { canvas } = options;
    this.maxPixelRatio = options.maxPixelRatio ?? 2;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // MSAA is configured on the composer target instead.
      alpha: false,
      powerPreference: "high-performance",
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // The composer issues several draws per frame and three resets its
    // counters on each one. Resetting manually at the top of the frame makes
    // the readout cover the whole pass chain rather than just the last pass.
    this.renderer.info.autoReset = false;

    this.capabilities = probeCapabilities(this.renderer);

    // Colour management is on, so a hex literal is read as sRGB and converted
    // to the linear working space automatically. Converting again here would
    // darken it a second time.
    //
    // This is lighter than the intended backdrop because it passes through
    // ACES tone mapping on the way out, which pulls dark values down.
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#1f2125");

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.camera.position.set(4.2, 2.6, 5.2);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.35, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener("change", () => this.requestRender());
    this.controls.update();

    // Image-based lighting from a neutral room. This is what makes imported
    // PBR materials read correctly rather than looking plastic and flat.
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();
    this.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = 0.42;

    this.composer = new EffectComposer(this.renderer, this.createTarget(1, 1));
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.outputPass);

    this.lookEngine = new LookEngine({
      scene: this.scene,
      composer: this.composer,
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.start();
  }

  /**
   * Renders on demand rather than continuously. Damped controls keep
   * requesting frames while they settle, so interaction still feels smooth
   * without burning GPU on a static scene.
   */
  requestRender(): void {
    this.needsRender = true;
  }

  onStats(listener: (stats: StageStats) => void): () => void {
    this.statsListener = listener;
    return () => {
      this.statsListener = undefined;
    };
  }

  /**
   * Called once each time the camera comes to rest after moving, whether from
   * the user orbiting or from an animated focus. Expensive work that depends
   * on the view, such as preview thumbnails, waits for this.
   */
  onCameraSettled(listener: () => void): () => void {
    this.settledListeners.add(listener);
    return () => {
      this.settledListeners.delete(listener);
    };
  }

  /** Called once, after the first frame reaches the screen. */
  onFirstFrame(listener: () => void): () => void {
    if (this.framesRendered > 0) {
      queueMicrotask(listener);
      return () => {};
    }

    this.firstFrameListeners.add(listener);
    return () => {
      this.firstFrameListeners.delete(listener);
    };
  }

  get fov(): number {
    return this.camera.fov;
  }

  setFov(degrees: number): void {
    this.camera.fov = THREE.MathUtils.clamp(degrees, FOV_RANGE.min, FOV_RANGE.max);
    this.camera.updateProjectionMatrix();
    this.requestRender();
    this.emitSettled();
  }

  /** Moves the camera so the given object, or the whole scene, fills the view. */
  frameAll(target: THREE.Object3D = this.scene, padding = 1.3): void {
    this.frame(target, { padding });
  }

  /** Returns to the default three-quarter view of the given content. */
  resetView(target: THREE.Object3D = this.scene): void {
    this.frame(target, { animate: true, direction: DEFAULT_VIEW_DIRECTION });
  }

  frame(target: THREE.Object3D, options: FrameOptions = {}): void {
    const box = new THREE.Box3().setFromObject(target);

    if (box.isEmpty()) {
      return;
    }

    const padding = options.padding ?? 1.3;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.05);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const rawDistance = (radius / Math.sin(fov * 0.5)) * padding;
    this.controls.maxDistance = Math.max(40, rawDistance * 4);
    const distance = THREE.MathUtils.clamp(
      rawDistance,
      this.controls.minDistance,
      this.controls.maxDistance,
    );

    this.fitDirectionalShadows();

    const direction = (options.direction?.clone() ?? this.camera.position.clone().sub(this.controls.target))
      .normalize();

    if (direction.lengthSq() < 1e-6) {
      direction.copy(DEFAULT_VIEW_DIRECTION);
    }

    const toPosition = centre.clone().addScaledVector(direction, distance);

    // Near and far follow the content being framed. They are never tightened
    // below the whole scene's needs, so focusing a pebble does not clip the
    // platform behind it.
    const sceneRadius = new THREE.Box3().setFromObject(this.scene).getSize(new THREE.Vector3()).length();
    this.camera.near = Math.max(Math.min(distance / 1000, 0.05), 0.005);
    this.camera.far = Math.max(distance * 10, sceneRadius * 4, 50);
    this.camera.updateProjectionMatrix();

    if (!options.animate) {
      this.tween = undefined;
      this.controls.enabled = true;
      this.controls.target.copy(centre);
      this.camera.position.copy(toPosition);
      this.controls.update();
      this.requestRender();
      return;
    }

    this.stopControlMomentum();
    this.controls.enabled = false;
    this.tween = {
      fromPosition: this.camera.position.clone(),
      toPosition,
      fromTarget: this.controls.target.clone(),
      toTarget: centre,
      startedAt: performance.now(),
      duration: FOCUS_DURATION_MS,
    };
    this.requestRender();
  }

  /**
   * Fits directional shadow frustums to the current visible scene bounds so
   * imported models of any scale cast shadows without clipping.
   */
  fitDirectionalShadows(target: THREE.Object3D = this.scene): void {
    const box = new THREE.Box3().setFromObject(target);
    if (box.isEmpty()) {
      return;
    }

    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z, 3) * 0.65;

    this.scene.traverse((object) => {
      const light = object as THREE.DirectionalLight;
      if (!light.isDirectionalLight || !light.castShadow) {
        return;
      }

      const dir = light.position.clone().sub(light.target.position).normalize();
      if (dir.lengthSq() < 1e-6) {
        dir.set(0.45, 1, 0.2).normalize();
      }

      const dist = Math.max(extent * 2.5, 8);
      light.position.copy(centre).addScaledVector(dir, dist);
      light.target.position.copy(centre);
      light.target.updateMatrixWorld();

      const cam = light.shadow.camera;
      cam.left = -extent;
      cam.right = extent;
      cam.top = extent;
      cam.bottom = -extent;
      cam.near = Math.max(0.1, dist - extent * 2.2);
      cam.far = dist + extent * 2.5;
      cam.updateProjectionMatrix();
    });
  }

  /**
   * Applies a Look and its parameters through the modular Look Engine.
   */
  applyLook(
    lookId: string,
    params?: Readonly<LookParams>,
    contentRoot: THREE.Object3D = this.scene,
  ): void {
    this.lookEngine.applyLook(lookId, params, contentRoot);
    this.requestRender();
  }

  /**
   * Updates the active Look's parameters in-place without rebuilding scene materials.
   */
  updateLookParams(
    params: Readonly<LookParams>,
    contentRoot: THREE.Object3D = this.scene,
  ): void {
    this.lookEngine.updateParams(params, contentRoot);
    this.requestRender();
  }

  /**
   * Synchronises the active Look with newly imported or removed scene objects.
   */
  syncLookScene(contentRoot: THREE.Object3D = this.scene): void {
    this.lookEngine.syncScene(contentRoot);
    this.requestRender();
  }

  get comparison(): { mode: ComparisonMode; splitRatio: number } {
    return { mode: this.comparisonMode, splitRatio: this.splitRatio };
  }

  /**
   * Configures Before/After comparison mode (`"off"`, `"split"`, or
   * `"side-by-side"`) and the normalised divider position (`0.08..0.92`).
   */
  setComparison(mode: ComparisonMode, splitRatio = this.splitRatio): void {
    const nextRatio = clampSplitRatio(splitRatio);
    if (this.comparisonMode === mode && Math.abs(this.splitRatio - nextRatio) < 1e-6) {
      return;
    }
    this.comparisonMode = mode;
    this.splitRatio = nextRatio;
    this.requestRender();
  }

  /**
   * Renders a preview thumbnail for a specific Look and parameter set, then
   * restores the active Look and (when comparison mode is active) re-renders
   * the split/side-by-side composite so the visible viewport is never left
   * showing a single-view thumbnail render.
   */
  captureLookPreview(
    lookId: string,
    params: Readonly<LookParams>,
    width: number,
    contentRoot: THREE.Object3D = this.scene,
    aspect = 16 / 10,
  ): string {
    const previousId = this.lookEngine.currentLookId;
    const previousParams = { ...this.lookEngine.currentParams };

    try {
      if (lookId === previousId) {
        return this.captureSingleViewFrame(width, aspect);
      }

      if (lookId === DEFAULT_LOOK_ID) {
        return this.lookEngine.withTemporaryOriginal(() =>
          this.captureSingleViewFrame(width, aspect),
        );
      }

      try {
        this.lookEngine.applyLook(lookId, params, contentRoot);
        return this.captureSingleViewFrame(width, aspect);
      } finally {
        this.lookEngine.applyLook(previousId, previousParams, contentRoot);
      }
    } finally {
      if (this.comparisonMode !== "off") {
        this.renderCompositeFrame();
      }
    }
  }

  /**
   * Renders a fresh single-viewport frame and copies the centre of it into a
   * small image. Always renders un-split so Look gallery thumbnails never
   * show a comparison divider.
   */
  captureFrame(width: number, aspect = 16 / 10): string {
    const output = this.captureSingleViewFrame(width, aspect);
    if (this.comparisonMode !== "off") {
      // Re-render the comparison composite onto the visible canvas immediately
      // in the same task so the user never sees a single-frame flicker.
      this.renderCompositeFrame();
    }
    return output;
  }

  private captureSingleViewFrame(width: number, aspect = 16 / 10): string {
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.viewportWidth, this.viewportHeight);
    this.camera.aspect = this.viewportWidth / this.viewportHeight;
    this.camera.updateProjectionMatrix();
    this.composer.render();

    const source = this.renderer.domElement;
    const sourceAspect = source.width / source.height;
    let cropWidth = source.width;
    let cropHeight = source.height;

    if (sourceAspect > aspect) {
      cropWidth = Math.round(source.height * aspect);
    } else {
      cropHeight = Math.round(source.width / aspect);
    }

    const output = document.createElement("canvas");
    output.width = Math.round(width);
    output.height = Math.round(width / aspect);

    const context = output.getContext("2d");

    if (!context) {
      return "";
    }

    context.imageSmoothingQuality = "high";
    context.drawImage(
      source,
      (source.width - cropWidth) / 2,
      (source.height - cropHeight) / 2,
      cropWidth,
      cropHeight,
      0,
      0,
      output.width,
      output.height,
    );

    return output.toDataURL("image/webp", 0.86);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.settledListeners.clear();
    this.firstFrameListeners.clear();
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.lookEngine.dispose();
    this.composer.dispose();
    this.environment.dispose();
    this.pmrem.dispose();
    disposeSceneResources(this.scene);
    this.renderer.dispose();
  }

  private createTarget(width: number, height: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(width, height, {
      type: this.capabilities.highPrecision ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: this.capabilities.samples,
      depthBuffer: true,
      stencilBuffer: false,
    });
  }

  private resize(): void {
    const canvas = this.renderer.domElement;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    this.viewportWidth = width;
    this.viewportHeight = height;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio));
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /**
   * Renders the current frame according to `this.comparisonMode`:
   * - `"off"`: single full-viewport pass with the active Look.
   * - `"split"`: left scissor region renders `Original`, right scissor region
   *   renders the active Look using the identical full-viewport camera matrix
   *   so geometry and screen-space UVs align seamlessly across the divider.
   * - `"side-by-side"`: left half-viewport renders `Original`, right
   *   half-viewport renders the active Look with synchronized half-width aspect.
   */
  private renderCompositeFrame(): void {
    const width = this.viewportWidth;
    const height = this.viewportHeight;

    if (this.comparisonMode === "off") {
      this.composer.render();
      return;
    }

    try {
      this.renderer.setScissorTest(true);

      if (this.comparisonMode === "split") {
        const { left, right } = computeSplitRegions(width, height, this.splitRatio);

        // Both halves share the full-viewport camera projection and viewport.
        this.renderer.setViewport(0, 0, width, height);

        // Left half: Original (identity)
        this.renderer.setScissor(left.x, left.y, left.width, left.height);
        this.lookEngine.withTemporaryOriginal(() => {
          this.composer.render();
        });

        // Right half: Active Look
        this.renderer.setScissor(right.x, right.y, right.width, right.height);
        this.composer.render();
      } else {
        const { left, right } = computeSideBySideRegions(width, height);

        // Left half-viewport: Original
        this.camera.aspect = Math.max(1, left.width) / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setViewport(left.x, left.y, left.width, left.height);
        this.renderer.setScissor(left.x, left.y, left.width, left.height);
        this.lookEngine.withTemporaryOriginal(() => {
          this.composer.render();
        });

        // Right half-viewport: Active Look
        this.camera.aspect = Math.max(1, right.width) / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setViewport(right.x, right.y, right.width, right.height);
        this.renderer.setScissor(right.x, right.y, right.width, right.height);
        this.composer.render();
      }
    } finally {
      this.renderer.setScissorTest(false);
      this.renderer.setScissor(0, 0, width, height);
      this.renderer.setViewport(0, 0, width, height);
      if (this.camera.aspect !== width / height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
      }
    }
  }

  private start(): void {
    const tick = () => {
      if (this.disposed) {
        return;
      }

      this.frameHandle = requestAnimationFrame(tick);

      const tweening = this.stepTween(performance.now());

      // Damping mutates the camera, so it must run every frame and report
      // whether anything actually moved.
      const moved = this.controls.update() || tweening;

      if (moved) {
        this.needsRender = true;
        this.cameraMoving = true;
        this.quietFrames = 0;
      } else if (this.cameraMoving) {
        this.quietFrames += 1;

        if (this.quietFrames >= SETTLE_FRAMES) {
          this.cameraMoving = false;
          this.emitSettled();
        }
      }

      if (!this.needsRender) {
        return;
      }

      this.needsRender = false;
      this.renderer.info.reset();

      const startedAt = performance.now();
      this.renderCompositeFrame();
      this.reportStats(performance.now() - startedAt);
    };

    this.frameHandle = requestAnimationFrame(tick);
  }

  /** Advances an animated focus. Returns true while the camera is still travelling. */
  private stepTween(now: number): boolean {
    const tween = this.tween;

    if (!tween) {
      return false;
    }

    const linear = Math.min((now - tween.startedAt) / tween.duration, 1);
    const eased = 1 - Math.pow(1 - linear, 3);

    this.camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
    this.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);

    if (linear >= 1) {
      this.tween = undefined;
      this.controls.enabled = true;
    }

    return true;
  }

  /**
   * Damped controls keep drifting after the pointer is released. Applying the
   * remaining motion with damping off flushes it, so an animated focus is not
   * fighting leftover momentum.
   */
  private stopControlMomentum(): void {
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
  }

  private emitSettled(): void {
    for (const listener of this.settledListeners) {
      listener();
    }
  }

  private reportStats(frameMs: number): void {
    this.framesRendered += 1;

    if (this.framesRendered === 1) {
      for (const listener of this.firstFrameListeners) {
        listener();
      }

      this.firstFrameListeners.clear();
    }

    if (!this.statsListener) {
      return;
    }

    // The first frames compile shaders and warm the pipeline. Averaging them
    // in makes a healthy scene look slow for a long time afterwards.
    if (this.framesRendered > WARMUP_FRAMES) {
      this.smoothedFrameMs =
        this.smoothedFrameMs === 0 ? frameMs : this.smoothedFrameMs * 0.85 + frameMs * 0.15;
    }

    const info = this.renderer.info;

    this.statsListener({
      frameMs: this.smoothedFrameMs === 0 ? Number.NaN : this.smoothedFrameMs,
      triangles: info.render.triangles,
      drawCalls: info.render.calls,
      programs: info.programs?.length ?? 0,
    });
  }
}

function probeCapabilities(renderer: THREE.WebGLRenderer): StageCapabilities {
  const gl = renderer.getContext();
  const highPrecision = Boolean(
    gl.getExtension("EXT_color_buffer_half_float") ?? gl.getExtension("EXT_color_buffer_float"),
  );

  return {
    highPrecision,
    // Multisampled half-float targets are not universally supported; drop MSAA
    // rather than risk an incomplete framebuffer, and rely on FXAA later.
    samples: highPrecision ? 4 : 0,
    maxTextureSize: renderer.capabilities.maxTextureSize,
  };
}

/** Releases every GPU resource reachable from the scene graph. */
export function disposeSceneResources(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    const mesh = object as Partial<THREE.Mesh>;
    mesh.geometry?.dispose();

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];

    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) {
          textures.add(value);
        }
      }

      material.dispose();
    }
  });

  for (const texture of textures) {
    texture.dispose();
  }
}
