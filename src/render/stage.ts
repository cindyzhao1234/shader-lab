import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

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
    this.scene.background = new THREE.Color("#4e463e");

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

  /** Moves the camera so the given object, or the whole scene, fills the view. */
  frameAll(target: THREE.Object3D = this.scene, padding = 1.3): void {
    const box = new THREE.Box3().setFromObject(target);

    if (box.isEmpty()) {
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.0001);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (radius / Math.sin(fov * 0.5)) * padding;

    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();

    if (direction.lengthSq() < 1e-6) {
      direction.set(0.6, 0.42, 0.68).normalize();
    }

    this.controls.target.copy(centre);
    this.camera.position.copy(centre).addScaledVector(direction, distance);
    this.camera.near = Math.max(distance / 1000, 0.01);
    this.camera.far = distance * 10;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.controls.dispose();
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

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio));
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private start(): void {
    const tick = () => {
      if (this.disposed) {
        return;
      }

      this.frameHandle = requestAnimationFrame(tick);

      // Damping mutates the camera, so it must run every frame and report
      // whether anything actually moved.
      if (this.controls.update()) {
        this.needsRender = true;
      }

      if (!this.needsRender) {
        return;
      }

      this.needsRender = false;
      this.renderer.info.reset();

      const startedAt = performance.now();
      this.composer.render();
      this.reportStats(performance.now() - startedAt);
    };

    this.frameHandle = requestAnimationFrame(tick);
  }

  private reportStats(frameMs: number): void {
    this.framesRendered += 1;

    if (!this.statsListener) {
      return;
    }

    // The first frames compile shaders and warm the pipeline. Averaging them
    // in makes a healthy scene look slow for a long time afterwards.
    if (this.framesRendered <= WARMUP_FRAMES) {
      return;
    }

    this.smoothedFrameMs =
      this.smoothedFrameMs === 0 ? frameMs : this.smoothedFrameMs * 0.85 + frameMs * 0.15;

    const info = this.renderer.info;

    this.statsListener({
      frameMs: this.smoothedFrameMs,
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
