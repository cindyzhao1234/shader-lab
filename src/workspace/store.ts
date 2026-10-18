import type * as THREE from "three";
import { History, valueCommand } from "../core/history";
import { PreviewCache } from "../core/previewCache";
import { DEFAULT_LOOK_ID, LOOKS, findLook } from "../looks/catalogue";
import { displayName } from "./sceneModel";

/**
 * The workspace's single source of truth outside the scene graph itself.
 *
 * Every edit goes through `History`, so anything a panel can change can be
 * undone. React reads an immutable snapshot through `useSyncExternalStore`;
 * the snapshot is replaced, never mutated, so components re-render exactly
 * when something they display has changed.
 *
 * The store talks to the renderer through `StageLike` rather than the
 * concrete `RenderStage`, which keeps it testable without a GPU.
 */

export interface StageLike {
  readonly fov: number;
  requestRender(): void;
  frame(target: THREE.Object3D, options?: { animate?: boolean; padding?: number }): void;
  resetView(target: THREE.Object3D): void;
  setFov(degrees: number): void;
  captureFrame(width: number, aspect?: number): string;
  onCameraSettled(listener: () => void): () => void;
}

export interface PreviewState {
  /** The most recent image for this Look, possibly from an older view. */
  src: string | undefined;
  /** True when `src` matches the scene as it is now. */
  fresh: boolean;
}

export interface WorkspaceSnapshot {
  ready: boolean;
  projectName: string;
  /** Moves forward on every visible scene edit. Panels rebuild their rows from it. */
  sceneRevision: number;
  selectedId: string | null;
  activeLookId: string;
  fov: number;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | undefined;
  redoLabel: string | undefined;
  previews: Readonly<Record<string, PreviewState>>;
}

export interface WorkspaceOptions {
  projectName?: string;
  /** Quiet time after the last change before thumbnails are re-rendered. */
  previewDelayMs?: number;
  history?: History;
}

/** Twice the card's display width, so thumbnails stay sharp on high-density screens. */
export const PREVIEW_WIDTH = 320;

export class WorkspaceStore {
  readonly history: History;
  readonly previewCache = new PreviewCache<string>();

  private readonly listeners = new Set<() => void>();
  private readonly previewDelayMs: number;
  private snapshot: WorkspaceSnapshot;
  private stage: StageLike | undefined;
  private content: THREE.Object3D | undefined;
  private detachers: Array<() => void> = [];
  private previewRevision = 0;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: WorkspaceOptions = {}) {
    this.history = options.history ?? new History();
    this.previewDelayMs = options.previewDelayMs ?? 450;
    this.snapshot = {
      ready: false,
      projectName: options.projectName ?? "Untitled Project",
      sceneRevision: 0,
      selectedId: null,
      activeLookId: DEFAULT_LOOK_ID,
      fov: 50,
      canUndo: false,
      canRedo: false,
      undoLabel: undefined,
      redoLabel: undefined,
      previews: this.buildPreviews(),
    };
  }

  // ---- React binding ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): WorkspaceSnapshot => this.snapshot;

  // ---- lifecycle ----

  attach(stage: StageLike, content: THREE.Object3D): void {
    this.detach();
    this.stage = stage;
    this.content = content;
    this.detachers = [
      stage.onCameraSettled(() => this.invalidatePreviews()),
      this.history.subscribe(() => this.syncHistory()),
    ];
    this.update({ ready: true, fov: stage.fov, sceneRevision: this.snapshot.sceneRevision + 1 });
    this.invalidatePreviews();
  }

  /**
   * Called when the renderer is torn down. History is cleared because its
   * commands hold references to objects that no longer exist.
   */
  detach(): void {
    for (const detach of this.detachers) {
      detach();
    }

    this.detachers = [];
    clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
    this.stage = undefined;
    this.content = undefined;
    this.history.clear();
    this.syncHistory();
    this.previewCache.clear();
    this.update({ ready: false, selectedId: null, previews: this.buildPreviews() });
  }

  get contentRoot(): THREE.Object3D | undefined {
    return this.content;
  }

  getObject(id: string): THREE.Object3D | undefined {
    return this.content?.getObjectByProperty("uuid", id);
  }

  // ---- project ----

  renameProject(name: string): void {
    const next = name.trim().replace(/\s+/g, " ");
    const before = this.snapshot.projectName;

    if (!next || next === before) {
      return;
    }

    this.history.push(
      valueCommand({
        label: "Rename project",
        before,
        after: next,
        write: (value) => this.update({ projectName: value }),
      }),
    );
  }

  // ---- scene ----

  select(id: string | null): void {
    if (id !== null && !this.getObject(id)) {
      return;
    }

    if (id !== this.snapshot.selectedId) {
      this.update({ selectedId: id });
    }
  }

  setVisible(id: string, visible: boolean): void {
    const object = this.getObject(id);

    if (!object || object.visible === visible) {
      return;
    }

    this.history.push(
      valueCommand({
        label: `${visible ? "Show" : "Hide"} ${displayName(object)}`,
        before: object.visible,
        after: visible,
        write: (value) => {
          object.visible = value;
          this.sceneChanged();
        },
      }),
    );
  }

  // ---- camera ----

  /** Frames the selected object, or the whole scene when nothing is selected. */
  focus(): void {
    const selected = this.snapshot.selectedId ? this.getObject(this.snapshot.selectedId) : undefined;
    const target = selected ?? this.content;

    if (this.stage && target) {
      this.stage.frame(target, { animate: true, padding: selected ? 1.8 : 1.3 });
    }
  }

  resetView(): void {
    if (this.stage && this.content) {
      this.stage.resetView(this.content);
    }
  }

  /** A slider drag arrives as many calls; they coalesce into one undo entry. */
  setFov(degrees: number): void {
    const stage = this.stage;

    if (!stage) {
      return;
    }

    const before = stage.fov;

    if (Math.abs(before - degrees) < 1e-6) {
      return;
    }

    this.history.push(
      valueCommand({
        label: "Change field of view",
        mergeKey: "camera.fov",
        before,
        after: degrees,
        write: (value) => {
          stage.setFov(value);
          this.update({ fov: stage.fov });
        },
      }),
    );
  }

  /** Ends a continuous gesture so the next one starts a fresh undo entry. */
  endGesture(): void {
    this.history.breakCoalescing();
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  // ---- Looks ----

  /**
   * Applies a Look. Returns false, and changes nothing, for a Look whose
   * rendering pipeline does not exist yet.
   */
  applyLook(id: string): boolean {
    const look = findLook(id);

    if (!look || look.availability !== "available") {
      return false;
    }

    if (id !== this.snapshot.activeLookId) {
      this.update({ activeLookId: id });
    }

    return true;
  }

  // ---- previews ----

  /** Marks every thumbnail stale and schedules a re-render once things go quiet. */
  invalidatePreviews(): void {
    this.previewRevision += 1;
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.renderPreviews(), this.previewDelayMs);
    this.update({ previews: this.buildPreviews() });
  }

  private renderPreviews(): void {
    this.previewTimer = undefined;
    const stage = this.stage;

    if (!stage) {
      return;
    }

    const revision = this.previewRevision;

    for (const look of LOOKS) {
      if (look.availability !== "available" || this.previewCache.isFresh(look.id, revision)) {
        continue;
      }

      // Original is what the stage already renders. Stylised Looks will apply
      // themselves to an offscreen pass here once the Look System exists.
      if (look.id !== DEFAULT_LOOK_ID) {
        continue;
      }

      const src = stage.captureFrame(PREVIEW_WIDTH);

      if (src) {
        this.previewCache.set(look.id, revision, src);
      }
    }

    this.update({ previews: this.buildPreviews() });
  }

  private buildPreviews(): Record<string, PreviewState> {
    const previews: Record<string, PreviewState> = {};

    for (const look of LOOKS) {
      const latest = this.previewCache.latest(look.id);
      previews[look.id] = {
        src: latest?.value,
        fresh: latest?.revision === this.previewRevision,
      };
    }

    return previews;
  }

  // ---- internals ----

  private sceneChanged(): void {
    this.stage?.requestRender();
    this.update({ sceneRevision: this.snapshot.sceneRevision + 1 });
    this.invalidatePreviews();
  }

  private syncHistory(): void {
    const history = this.history;
    this.update({
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      undoLabel: history.undoLabel,
      redoLabel: history.redoLabel,
    });
  }

  private update(patch: Partial<WorkspaceSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };

    for (const listener of this.listeners) {
      listener();
    }
  }
}
