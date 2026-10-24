import type * as THREE from "three";
import { AssetStore, type StoredAsset } from "../core/assets";
import { History, valueCommand, type Command } from "../core/history";
import { PreviewCache } from "../core/previewCache";
import {
  createProject,
  type AssetRef,
  type EditLayer,
  type LookState,
  type PrimitiveKind,
  type ProjectManifest,
  type SceneEntry,
  type Transform,
} from "../core/project";
import { DEFAULT_LOOK_ID, LOOKS, findLook } from "../looks/catalogue";
import { DEFAULT_LOOK_REGISTRY, type LookRegistry } from "../looks/registry";
import {
  areLookParamsEqual,
  isDefaultLookParams,
  sanitiseParamValue,
  type LookParams,
  type LookParamValue,
} from "../looks/schema";
import {
  SPLIT_BOUNDS,
  clampSplitRatio,
  type ComparisonMode,
} from "../render/comparison";
import {
  importGltfFiles,
  type ImportedModelResult,
  type ImportFileInput,
} from "../render/gltfImport";
import { displayName, isImportedRoot, objectHierarchyPath } from "./sceneModel";

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
  applyLook?(
    lookId: string,
    params?: Readonly<LookParams>,
    contentRoot?: THREE.Object3D,
  ): void;
  updateLookParams?(
    params: Readonly<LookParams>,
    contentRoot?: THREE.Object3D,
  ): void;
  syncLookScene?(contentRoot?: THREE.Object3D): void;
  setComparison?(mode: ComparisonMode, splitRatio?: number): void;
  captureLookPreview?(
    lookId: string,
    params: Readonly<LookParams>,
    width: number,
    contentRoot?: THREE.Object3D,
  ): string;
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
  /** Number of user-imported models currently in the scene. */
  importedCount: number;
  /** True while a model file is being parsed and loaded. */
  importing: boolean;
  selectedId: string | null;
  activeLookId: string;
  /** Validated parameters for the currently active Look. */
  lookParams: Readonly<LookParams>;
  /** True when the active Look has parameters that differ from their defaults. */
  canResetLookParams: boolean;
  /** Before/After comparison mode ("off" | "split" | "side-by-side"). */
  comparisonMode: ComparisonMode;
  /** Normalised split divider position (0.08..0.92). */
  splitRatio: number;
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
  assets?: AssetStore;
  lookRegistry?: LookRegistry;
}

interface ImportedEntryRecord {
  readonly entryId: string;
  readonly object: THREE.Object3D;
  readonly primaryAsset: StoredAsset;
  readonly companionAssets: readonly StoredAsset[];
}

/** Twice the card's display width, so thumbnails stay sharp on high-density screens. */
export const PREVIEW_WIDTH = 320;

const DEMO_PRIMITIVE_BY_NAME: Record<string, PrimitiveKind> = {
  Platform: "platform",
  Cube: "cube",
  Sphere: "sphere",
  "Rock 1": "rock",
  "Rock 2": "rock",
  Pebble: "sphere",
};

export class WorkspaceStore {
  readonly history: History;
  readonly assets: AssetStore;
  readonly lookRegistry: LookRegistry;
  readonly previewCache = new PreviewCache<string>();

  private readonly listeners = new Set<() => void>();
  private readonly previewDelayMs: number;
  private readonly createdAt = new Date().toISOString();
  private readonly importedEntries = new Map<string, ImportedEntryRecord>();
  private readonly lookParamsById = new Map<string, LookParams>();
  private nextImportSeq = 1;
  private snapshot: WorkspaceSnapshot;
  private stage: StageLike | undefined;
  private content: THREE.Object3D | undefined;
  private detachers: Array<() => void> = [];
  private previewRevision = 0;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: WorkspaceOptions = {}) {
    this.history = options.history ?? new History();
    this.assets = options.assets ?? new AssetStore();
    this.lookRegistry = options.lookRegistry ?? DEFAULT_LOOK_REGISTRY;
    this.previewDelayMs = options.previewDelayMs ?? 450;

    for (const def of this.lookRegistry.list()) {
      this.lookParamsById.set(def.id, this.lookRegistry.defaultParams(def.id));
    }

    const initialParams = this.getParamsForLook(DEFAULT_LOOK_ID);

    this.snapshot = {
      ready: false,
      projectName: options.projectName ?? "Untitled Project",
      sceneRevision: 0,
      importedCount: 0,
      importing: false,
      selectedId: null,
      activeLookId: DEFAULT_LOOK_ID,
      lookParams: initialParams,
      canResetLookParams: false,
      comparisonMode: "off",
      splitRatio: SPLIT_BOUNDS.default,
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
    stage.applyLook?.(
      this.snapshot.activeLookId,
      this.snapshot.lookParams,
      content,
    );
    stage.setComparison?.(
      this.snapshot.comparisonMode,
      this.snapshot.splitRatio,
    );
    this.update({
      ready: true,
      fov: stage.fov,
      importedCount: this.importedEntries.size,
      sceneRevision: this.snapshot.sceneRevision + 1,
    });
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
    this.importedEntries.clear();
    this.history.clear();
    this.syncHistory();
    this.previewCache.clear();
    for (const def of this.lookRegistry.list()) {
      this.lookParamsById.set(def.id, this.lookRegistry.defaultParams(def.id));
    }
    this.update({
      ready: false,
      importedCount: 0,
      importing: false,
      selectedId: null,
      activeLookId: DEFAULT_LOOK_ID,
      lookParams: this.getParamsForLook(DEFAULT_LOOK_ID),
      canResetLookParams: false,
      comparisonMode: "off",
      splitRatio: SPLIT_BOUNDS.default,
      previews: this.buildPreviews(),
    });
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

  /**
   * Builds a serialisable `ProjectManifest` representing the current project
   * state, including content-addressed imported assets, scene entries,
   * visibility overrides and validated Look state.
   */
  toProjectManifest(at = new Date()): ProjectManifest {
    const base = createProject(this.snapshot.projectName, at);
    const assetMap = new Map<string, AssetRef>();
    const entries: SceneEntry[] = [];
    const edits: EditLayer = {};

    if (this.content) {
      let primitiveSeq = 1;
      for (const child of this.content.children) {
        const importedId = child.userData?.importedEntryId as string | undefined;
        if (importedId && this.importedEntries.has(importedId)) {
          const rec = this.importedEntries.get(importedId)!;
          assetMap.set(rec.primaryAsset.hash, toAssetRef(rec.primaryAsset));
          for (const comp of rec.companionAssets) {
            assetMap.set(comp.hash, toAssetRef(comp));
          }

          entries.push({
            id: rec.entryId,
            name: displayName(child),
            source: {
              kind: "imported",
              assetHash: rec.primaryAsset.hash,
              ...(rec.companionAssets.length > 0
                ? { companionHashes: rec.companionAssets.map((c) => c.hash) }
                : {}),
            },
            transform: readTransform(child),
          });
        } else {
          const primitive = DEMO_PRIMITIVE_BY_NAME[child.name];
          if (primitive) {
            entries.push({
              id: `primitive-${primitiveSeq++}`,
              name: displayName(child),
              source: { kind: "primitive", primitive },
              transform: readTransform(child),
            });
          }
        }
      }

      const contentRoot = this.content;
      contentRoot.traverse((obj) => {
        if (obj === contentRoot) return;
        if (!obj.visible) {
          const path = objectHierarchyPath(contentRoot, obj);
          if (path) {
            edits[path] = { ...edits[path], visible: false };
          }
        }
      });
    }

    const activeLookId = this.lookRegistry.resolveId(this.snapshot.activeLookId);
    const validatedParams = this.lookRegistry.validateParams(
      activeLookId,
      this.snapshot.lookParams,
    );

    return {
      ...base,
      createdAt: this.createdAt,
      modifiedAt: at.toISOString(),
      assets: [...assetMap.values()],
      entries,
      edits,
      look: {
        lookId: activeLookId,
        params: validatedParams,
      },
      camera: {
        ...base.camera,
        fov: this.snapshot.fov,
      },
    };
  }

  /**
   * Restores Look state from a parsed or legacy project manifest, validating
   * and clamping parameters against the Look's schema and falling back to
   * `original` when the Look is unknown or absent.
   */
  loadManifestLookState(lookState: Partial<LookState> | undefined | null): void {
    const resolvedId = this.lookRegistry.resolveId(lookState?.lookId);
    const validatedParams = this.lookRegistry.validateParams(
      resolvedId,
      lookState?.params,
    );
    this.writeLookState(resolvedId, validatedParams);
  }

  // ---- model import & removal ----

  /**
   * Parses and imports `.glb` or `.gltf` files into the scene, storing raw
   * bytes in `this.assets`, adding the root to the scene undoably, selecting
   * it and framing the camera around it.
   */
  async importFiles(files: readonly ImportFileInput[]): Promise<ImportedModelResult> {
    this.update({ importing: true });
    try {
      const result = await importGltfFiles(files, this.assets);
      this.importModel(result);
      return result;
    } finally {
      this.update({ importing: false });
    }
  }

  /**
   * Adds an already-parsed `ImportedModelResult` to the scene undoably,
   * selects it and frames the camera around it. Returns the root object's UUID.
   */
  importModel(imported: ImportedModelResult): string {
    const content = this.content;
    if (!content) {
      throw new Error("Cannot import a model before the workspace is attached to a scene.");
    }

    const entryId = `imported-${this.nextImportSeq++}`;
    const root = imported.root;
    root.name = this.uniqueChildName(imported.name);
    root.userData = {
      ...root.userData,
      importedEntryId: entryId,
      sourceFileName: imported.primaryAsset.name,
      assetHash: imported.primaryAsset.hash,
    };

    const record: ImportedEntryRecord = {
      entryId,
      object: root,
      primaryAsset: imported.primaryAsset,
      companionAssets: imported.companionAssets,
    };

    const previousSelectedId = this.snapshot.selectedId;

    const command: Command = {
      label: `Import ${root.name}`,
      apply: () => {
        content.add(root);
        this.importedEntries.set(entryId, record);
        this.update({
          selectedId: root.uuid,
          importedCount: this.importedEntries.size,
        });
        this.sceneChanged();
        this.stage?.frame(root, { animate: true, padding: 1.35 });
      },
      revert: () => {
        content.remove(root);
        this.importedEntries.delete(entryId);
        const keepSelection =
          previousSelectedId && this.getObject(previousSelectedId) ? previousSelectedId : null;
        this.update({
          selectedId: keepSelection,
          importedCount: this.importedEntries.size,
        });
        this.sceneChanged();
        this.stage?.frame(content, { animate: true, padding: 1.3 });
      },
    };

    this.history.push(command);
    return root.uuid;
  }

  /**
   * Removes an imported model root from the scene undoably. Built-in demo
   * objects and lights are not removed by this method.
   */
  removeImportedObject(id: string): boolean {
    const content = this.content;
    const object = this.getObject(id);
    if (!content || !object || !isImportedRoot(object) || object.parent !== content) {
      return false;
    }

    const entryId = object.userData.importedEntryId as string;
    const record = this.importedEntries.get(entryId);
    if (!record) {
      return false;
    }

    const index = content.children.indexOf(object);
    const previousSelectedId = this.snapshot.selectedId;

    const command: Command = {
      label: `Remove ${displayName(object)}`,
      apply: () => {
        content.remove(object);
        this.importedEntries.delete(entryId);
        const nextSelection =
          previousSelectedId && this.getObject(previousSelectedId) ? previousSelectedId : null;
        this.update({
          selectedId: nextSelection,
          importedCount: this.importedEntries.size,
        });
        this.sceneChanged();
      },
      revert: () => {
        content.add(object);
        const currentIdx = content.children.indexOf(object);
        if (currentIdx !== -1 && index >= 0 && index < content.children.length - 1) {
          content.children.splice(currentIdx, 1);
          content.children.splice(index, 0, object);
        }
        this.importedEntries.set(entryId, record);
        this.update({
          selectedId: object.uuid,
          importedCount: this.importedEntries.size,
        });
        this.sceneChanged();
      },
    };

    this.history.push(command);
    return true;
  }

  private uniqueChildName(desired: string): string {
    const base = desired.trim() || "Imported Model";
    if (!this.content) {
      return base;
    }

    const existing = new Set(this.content.children.map((child) => child.name));
    if (!existing.has(base)) {
      return base;
    }

    let suffix = 2;
    while (existing.has(`${base} ${suffix}`)) {
      suffix += 1;
    }
    return `${base} ${suffix}`;
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

  // ---- Looks & Parameters ----

  /**
   * Applies a Look undoably. Returns false, and changes nothing, for a Look
   * whose rendering pipeline does not exist yet.
   */
  applyLook(id: string): boolean {
    const look = findLook(id);

    if (!look || look.availability !== "available" || !this.lookRegistry.has(id)) {
      return false;
    }

    const beforeId = this.snapshot.activeLookId;
    if (id === beforeId) {
      return true;
    }

    const beforeParams = { ...this.snapshot.lookParams };
    const afterParams = { ...this.getParamsForLook(id) };

    this.history.push(
      valueCommand({
        label: `Apply ${look.name} Look`,
        before: { lookId: beforeId, params: beforeParams },
        after: { lookId: id, params: afterParams },
        write: (state) => {
          this.writeLookState(state.lookId, state.params);
        },
      }),
    );

    return true;
  }

  /**
   * Updates a single parameter on the active Look in-place. Continuous slider
   * drags coalesce into a single undo entry per parameter key.
   */
  setLookParam(key: string, rawValue: LookParamValue): boolean {
    const lookId = this.snapshot.activeLookId;
    const def = this.lookRegistry.get(lookId);
    if (!def) {
      return false;
    }

    const descriptor = def.paramSchema.find((item) => item.key === key);
    if (!descriptor) {
      return false;
    }

    const nextValue = sanitiseParamValue(descriptor, rawValue);
    const beforeParams = { ...this.snapshot.lookParams };
    const currentValue = beforeParams[key] ?? descriptor.default;

    if (
      descriptor.kind === "number" &&
      typeof currentValue === "number" &&
      typeof nextValue === "number" &&
      Math.abs(currentValue - nextValue) < 1e-6
    ) {
      return false;
    }
    if (currentValue === nextValue) {
      return false;
    }

    const afterParams: LookParams = { ...beforeParams, [key]: nextValue };

    this.history.push(
      valueCommand({
        label: `Adjust ${descriptor.label}`,
        mergeKey: `look.param.${lookId}.${key}`,
        before: beforeParams,
        after: afterParams,
        write: (params) => {
          this.writeLookParamsInPlace(lookId, params);
        },
      }),
    );

    return true;
  }

  /**
   * Resets all parameters of the active Look to their schema defaults in a
   * single undoable step.
   */
  resetLookParams(): boolean {
    const lookId = this.snapshot.activeLookId;
    const def = this.lookRegistry.get(lookId);
    if (!def || def.paramSchema.length === 0) {
      return false;
    }

    const beforeParams = { ...this.snapshot.lookParams };
    const defaults = this.lookRegistry.defaultParams(lookId);

    if (areLookParamsEqual(def.paramSchema, beforeParams, defaults)) {
      return false;
    }

    this.history.push(
      valueCommand({
        label: `Reset ${def.name} Look`,
        before: beforeParams,
        after: defaults,
        write: (params) => {
          this.writeLookParamsInPlace(lookId, params);
        },
      }),
    );

    return true;
  }

  private getParamsForLook(lookId: string): LookParams {
    const existing = this.lookParamsById.get(lookId);
    if (existing) {
      return { ...existing };
    }
    const defaults = this.lookRegistry.defaultParams(lookId);
    this.lookParamsById.set(lookId, defaults);
    return { ...defaults };
  }

  private writeLookState(lookId: string, params: Readonly<LookParams>): void {
    const def = this.lookRegistry.get(lookId);
    const validated = this.lookRegistry.validateParams(lookId, params);
    this.lookParamsById.set(lookId, validated);

    this.stage?.applyLook?.(lookId, validated, this.content);
    this.stage?.requestRender();

    const canReset = def ? !isDefaultLookParams(def.paramSchema, validated) : false;
    this.update({
      activeLookId: lookId,
      lookParams: validated,
      canResetLookParams: canReset,
    });
    this.schedulePreviewRender();
  }

  private writeLookParamsInPlace(lookId: string, params: Readonly<LookParams>): void {
    const def = this.lookRegistry.get(lookId);
    const validated = this.lookRegistry.validateParams(lookId, params);
    this.lookParamsById.set(lookId, validated);

    if (lookId === this.snapshot.activeLookId) {
      this.stage?.updateLookParams?.(validated, this.content);
      this.stage?.requestRender();

      const canReset = def ? !isDefaultLookParams(def.paramSchema, validated) : false;
      this.update({
        lookParams: validated,
        canResetLookParams: canReset,
      });
    }
    this.invalidateLookPreview(lookId);
  }

  // ---- Before/After comparison ----

  setComparisonMode(mode: ComparisonMode): void {
    if (mode === this.snapshot.comparisonMode) {
      return;
    }
    this.stage?.setComparison?.(mode, this.snapshot.splitRatio);
    this.update({ comparisonMode: mode });
  }

  toggleComparison(): void {
    const next: ComparisonMode = this.snapshot.comparisonMode === "off" ? "split" : "off";
    this.setComparisonMode(next);
  }

  setSplitRatio(ratio: number): void {
    const clamped = clampSplitRatio(ratio);
    if (Math.abs(clamped - this.snapshot.splitRatio) < 1e-6) {
      return;
    }
    this.stage?.setComparison?.(this.snapshot.comparisonMode, clamped);
    this.update({ splitRatio: clamped });
  }

  resetSplitRatio(): void {
    this.setSplitRatio(SPLIT_BOUNDS.default);
  }

  // ---- previews ----

  /** Marks every thumbnail stale and schedules a re-render once things go quiet. */
  invalidatePreviews(): void {
    this.previewRevision += 1;
    this.schedulePreviewRender();
  }

  /**
   * Marks only a single Look's thumbnail stale (for example, when its sliders
   * are adjusted) so `Original` and other Looks are not needlessly re-captured.
   */
  invalidateLookPreview(lookId: string): void {
    if (lookId === DEFAULT_LOOK_ID) {
      return;
    }
    this.previewCache.markStale(lookId);
    this.schedulePreviewRender();
  }

  private schedulePreviewRender(): void {
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

      let src = "";
      if (stage.captureLookPreview) {
        const params =
          look.id === this.snapshot.activeLookId
            ? this.snapshot.lookParams
            : this.getParamsForLook(look.id);
        src = stage.captureLookPreview(look.id, params, PREVIEW_WIDTH, this.content);
      } else if (look.id === DEFAULT_LOOK_ID) {
        src = stage.captureFrame(PREVIEW_WIDTH);
      }

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
    if (this.content) {
      this.stage?.syncLookScene?.(this.content);
    }
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

function toAssetRef(asset: StoredAsset): AssetRef {
  return {
    hash: asset.hash,
    name: asset.name,
    mime: asset.mime,
    byteLength: asset.bytes.byteLength,
  };
}

function readTransform(object: THREE.Object3D): Transform {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w],
    scale: [object.scale.x, object.quaternion.y === undefined ? 1 : object.scale.y, object.scale.z],
  };
}
