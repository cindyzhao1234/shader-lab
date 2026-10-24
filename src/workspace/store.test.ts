import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { History } from "../core/history";
import { parseProject, serialiseProject } from "../core/project";
import { WorkspaceStore, type StageLike } from "./store";

class FakeStage implements StageLike {
  fov = 50;
  renders = 0;
  captures = 0;
  previewCaptures: Array<{ lookId: string; params: Record<string, unknown>; restoredComparison: boolean }> = [];
  lastCanvasState: "single" | "comparison" = "single";
  framed: Array<{ target: THREE.Object3D; animate?: boolean }> = [];
  resets = 0;
  comparisonState: { mode: string; splitRatio: number } = { mode: "off", splitRatio: 0.5 };
  private settled = new Set<() => void>();

  requestRender(): void {
    this.renders += 1;
    this.lastCanvasState = this.comparisonState.mode === "off" ? "single" : "comparison";
  }
  frame(target: THREE.Object3D, options?: { animate?: boolean }): void {
    this.framed.push({ target, animate: options?.animate });
  }
  resetView(): void {
    this.resets += 1;
  }
  setFov(degrees: number): void {
    this.fov = degrees;
  }
  setComparison(mode: string, splitRatio = 0.5): void {
    this.comparisonState = { mode, splitRatio };
    this.lastCanvasState = mode === "off" ? "single" : "comparison";
  }
  captureFrame(): string {
    this.captures += 1;
    this.lastCanvasState = this.comparisonState.mode === "off" ? "single" : "comparison";
    return `data:image/webp;capture-${this.captures}`;
  }
  captureLookPreview(lookId: string, params: Record<string, unknown>): string {
    this.captures += 1;
    // Mirrors RenderStage.captureLookPreview: single-view capture followed by
    // immediate restoration of the comparison composite when comparing.
    const restoredComparison = this.comparisonState.mode !== "off";
    this.lastCanvasState = restoredComparison ? "comparison" : "single";
    this.previewCaptures.push({ lookId, params: { ...params }, restoredComparison });
    return `data:image/webp;preview-${lookId}-${this.captures}`;
  }
  onCameraSettled(listener: () => void): () => void {
    this.settled.add(listener);
    return () => this.settled.delete(listener);
  }
  settle(): void {
    for (const listener of this.settled) listener();
  }
  get listenerCount(): number {
    return this.settled.size;
  }
}

function setup() {
  let clock = 0;
  const history = new History({ now: () => clock });
  const store = new WorkspaceStore({ projectName: "Demo", history, previewDelayMs: 100 });
  const stage = new FakeStage();
  const root = new THREE.Group();
  const cube = new THREE.Mesh(new THREE.BoxGeometry());
  cube.name = "Cube";
  root.add(cube);
  store.attach(stage, root);
  return { store, stage, root, cube, advance: (ms: number) => (clock += ms) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WorkspaceStore", () => {
  it("is ready once attached and reads the camera", () => {
    const { store } = setup();
    expect(store.getSnapshot().ready).toBe(true);
    expect(store.getSnapshot().fov).toBe(50);
  });

  it("hides an object undoably and re-renders", () => {
    const { store, stage, cube } = setup();
    const revision = store.getSnapshot().sceneRevision;

    store.setVisible(cube.uuid, false);

    expect(cube.visible).toBe(false);
    expect(stage.renders).toBeGreaterThan(0);
    expect(store.getSnapshot().sceneRevision).toBe(revision + 1);
    expect(store.getSnapshot().undoLabel).toBe("Hide Cube");

    store.undo();
    expect(cube.visible).toBe(true);
    expect(store.getSnapshot().redoLabel).toBe("Hide Cube");

    store.redo();
    expect(cube.visible).toBe(false);
  });

  it("does not record a visibility change that changes nothing", () => {
    const { store, cube } = setup();
    store.setVisible(cube.uuid, true);
    expect(store.getSnapshot().canUndo).toBe(false);
  });

  it("renames the project undoably, ignoring blank and unchanged names", () => {
    const { store } = setup();

    store.renameProject("   ");
    store.renameProject("Demo");
    expect(store.getSnapshot().canUndo).toBe(false);

    store.renameProject("  Forest   Shrine ");
    expect(store.getSnapshot().projectName).toBe("Forest Shrine");

    store.undo();
    expect(store.getSnapshot().projectName).toBe("Demo");
  });

  it("coalesces a field-of-view drag into one undo entry", () => {
    const { store, stage, advance } = setup();

    for (const fov of [52, 55, 60, 64]) {
      store.setFov(fov);
      advance(16);
    }

    expect(stage.fov).toBe(64);
    expect(store.history.entries).toHaveLength(1);

    store.undo();
    expect(stage.fov).toBe(50);
    expect(store.getSnapshot().fov).toBe(50);
  });

  it("starts a new undo entry after the gesture ends", () => {
    const { store } = setup();

    store.setFov(60);
    store.endGesture();
    store.setFov(70);

    expect(store.history.entries).toHaveLength(2);
  });

  it("selects only objects that exist", () => {
    const { store, cube } = setup();

    store.select("not-a-real-id");
    expect(store.getSnapshot().selectedId).toBeNull();

    store.select(cube.uuid);
    expect(store.getSnapshot().selectedId).toBe(cube.uuid);
  });

  it("focuses the selection, or the whole scene without one", () => {
    const { store, stage, root, cube } = setup();

    store.focus();
    expect(stage.framed.at(-1)).toEqual({ target: root, animate: true });

    store.select(cube.uuid);
    store.focus();
    expect(stage.framed.at(-1)).toEqual({ target: cube, animate: true });
  });

  it("refuses to apply a Look that has no pipeline yet", () => {
    const { store } = setup();

    expect(store.applyLook("cartoon")).toBe(false);
    expect(store.applyLook("nonexistent")).toBe(false);
    expect(store.getSnapshot().activeLookId).toBe("original");
    expect(store.applyLook("original")).toBe(true);
  });

  describe("Modular Look switching, parameters and undo/redo", () => {
    it("switches to the experimental Look undoably, coalesces slider drags, and resets parameters", () => {
      const { store, advance } = setup();

      expect(store.applyLook("stage3-test-look")).toBe(true);
      expect(store.getSnapshot().activeLookId).toBe("stage3-test-look");
      expect(store.getSnapshot().lookParams.toneBands).toBe(4);
      expect(store.getSnapshot().canResetLookParams).toBe(false);
      expect(store.getSnapshot().undoLabel).toBe("Apply Pipeline Test Look");

      // Dragging a parameter slider coalesces into one undo entry
      for (const bands of [5, 6, 7, 8]) {
        expect(store.setLookParam("toneBands", bands)).toBe(true);
        advance(16);
      }
      store.endGesture();

      expect(store.getSnapshot().lookParams.toneBands).toBe(8);
      expect(store.getSnapshot().canResetLookParams).toBe(true);
      expect(store.history.entries).toHaveLength(2);
      expect(store.getSnapshot().undoLabel).toBe("Adjust Shading Bands");

      // Reset parameters to default in one undoable command
      expect(store.resetLookParams()).toBe(true);
      expect(store.getSnapshot().lookParams.toneBands).toBe(4);
      expect(store.getSnapshot().canResetLookParams).toBe(false);
      expect(store.getSnapshot().undoLabel).toBe("Reset Pipeline Test Look");

      // Undo reset -> back to 8
      store.undo();
      expect(store.getSnapshot().lookParams.toneBands).toBe(8);
      expect(store.getSnapshot().canResetLookParams).toBe(true);

      // Undo slider drag -> back to default 4
      store.undo();
      expect(store.getSnapshot().lookParams.toneBands).toBe(4);

      // Undo Look switch -> back to Original
      store.undo();
      expect(store.getSnapshot().activeLookId).toBe("original");

      // Redo Look switch
      store.redo();
      expect(store.getSnapshot().activeLookId).toBe("stage3-test-look");
    });

    it("serialises validated Look parameters in the manifest and restores legacy manifests safely", () => {
      const { store } = setup();
      store.applyLook("stage3-test-look");
      store.setLookParam("toneBands", 9);
      store.setLookParam("contrast", 1.35);

      const manifest = store.toProjectManifest(new Date("2026-10-23T00:00:00.000Z"));
      const parsed = parseProject(serialiseProject(manifest));
      expect(parsed.look.lookId).toBe("stage3-test-look");
      expect(parsed.look.params.toneBands).toBe(9);
      expect(parsed.look.params.contrast).toBe(1.35);

      // Restore with out-of-range/unknown values clamps and sanitises
      store.loadManifestLookState({
        lookId: "stage3-test-look",
        params: { toneBands: 999, bogus: "ignored" as any },
      });
      expect(store.getSnapshot().lookParams.toneBands).toBe(12);
      expect("bogus" in store.getSnapshot().lookParams).toBe(false);

      // Restore from an older or unknown Look falls back to Original
      store.loadManifestLookState(undefined);
      expect(store.getSnapshot().activeLookId).toBe("original");
      expect(store.getSnapshot().lookParams).toEqual({});
    });
  });

  describe("Before/After comparison state and divider control", () => {
    it("toggles comparison modes, clamps divider positions, and stays in sync with the stage", () => {
      const { store, stage } = setup();

      expect(store.getSnapshot().comparisonMode).toBe("off");
      expect(store.getSnapshot().splitRatio).toBe(0.5);

      store.toggleComparison();
      expect(store.getSnapshot().comparisonMode).toBe("split");
      expect(stage.comparisonState).toEqual({ mode: "split", splitRatio: 0.5 });

      store.setSplitRatio(0.32);
      expect(store.getSnapshot().splitRatio).toBe(0.32);
      expect(stage.comparisonState).toEqual({ mode: "split", splitRatio: 0.32 });

      // Clamps out-of-range divider drags
      store.setSplitRatio(-1);
      expect(store.getSnapshot().splitRatio).toBe(0.08);
      store.setSplitRatio(5);
      expect(store.getSnapshot().splitRatio).toBe(0.92);

      // Resets divider to 50%
      store.resetSplitRatio();
      expect(store.getSnapshot().splitRatio).toBe(0.5);

      // Switches to side-by-side and back off
      store.setComparisonMode("side-by-side");
      expect(store.getSnapshot().comparisonMode).toBe("side-by-side");
      expect(stage.comparisonState.mode).toBe("side-by-side");

      store.toggleComparison();
      expect(store.getSnapshot().comparisonMode).toBe("off");
      expect(stage.comparisonState.mode).toBe("off");
    });

    it("does not invalidate the Original thumbnail or overwrite the comparison view when adjusting Look parameters or orbiting", () => {
      const { store, stage } = setup();

      // Initial preview render completes
      vi.advanceTimersByTime(100);
      const initialOriginalPreview = store.getSnapshot().previews.original?.src;
      expect(initialOriginalPreview).toBeDefined();

      // Enable Split Comparison and select Pipeline Test
      store.applyLook("stage3-test-look");
      store.toggleComparison();
      vi.advanceTimersByTime(100);
      stage.previewCaptures.length = 0;

      // Adjust Look parameters repeatedly while Split Comparison is active
      store.setLookParam("toneBands", 2);
      store.setLookParam("surfaceWarmth", 0.85);
      store.setLookParam("contrast", 1.5);

      // Original preview stays fresh while Pipeline Test preview is marked stale
      expect(store.getSnapshot().previews.original?.fresh).toBe(true);
      expect(store.getSnapshot().previews["stage3-test-look"]?.fresh).toBe(false);

      // Debounced preview timer fires after slider adjustment
      vi.advanceTimersByTime(100);

      // Only the modified Look's thumbnail was re-captured; Original was untouched
      expect(stage.previewCaptures).toHaveLength(1);
      expect(stage.previewCaptures[0]!.lookId).toBe("stage3-test-look");
      expect(stage.previewCaptures[0]!.restoredComparison).toBe(true);
      expect(stage.lastCanvasState).toBe("comparison");
      expect(store.getSnapshot().previews.original?.src).toBe(initialOriginalPreview);

      // Camera movement settles while comparing -> both thumbnails refresh and comparison canvas is restored
      stage.previewCaptures.length = 0;
      stage.settle();
      vi.advanceTimersByTime(100);
      expect(stage.previewCaptures.map((c) => c.lookId)).toEqual(["original", "stage3-test-look"]);
      expect(stage.previewCaptures.every((c) => c.restoredComparison)).toBe(true);
      expect(stage.lastCanvasState).toBe("comparison");
    });
  });

  describe("previews", () => {
    it("renders the Original thumbnail once things go quiet", () => {
      const { store, stage } = setup();

      expect(store.getSnapshot().previews.original).toEqual({ src: undefined, fresh: false });

      vi.advanceTimersByTime(100);

      expect(stage.captures).toBeGreaterThanOrEqual(1);
      expect(store.getSnapshot().previews.original).toEqual({
        src: "data:image/webp;preview-original-1",
        fresh: true,
      });
    });

    it("never renders thumbnails for unavailable Looks", () => {
      const { store } = setup();
      vi.advanceTimersByTime(100);
      expect(store.getSnapshot().previews.cartoon).toEqual({ src: undefined, fresh: false });
    });

    it("debounces bursts of changes into a single render", () => {
      const { store, stage, cube } = setup();
      vi.advanceTimersByTime(100);
      stage.captures = 0;

      store.setVisible(cube.uuid, false);
      vi.advanceTimersByTime(50);
      stage.settle();
      vi.advanceTimersByTime(50);
      store.setVisible(cube.uuid, true);

      expect(stage.captures).toBe(0);
      vi.advanceTimersByTime(100);
      expect(stage.captures).toBe(2);
    });

    it("keeps showing the previous image, marked stale, while re-rendering", () => {
      const { store, stage } = setup();
      vi.advanceTimersByTime(100);

      stage.settle();

      expect(store.getSnapshot().previews.original).toEqual({
        src: "data:image/webp;preview-original-1",
        fresh: false,
      });
    });
  });

  it("releases the stage and clears history on detach", () => {
    const { store, stage, cube } = setup();
    store.setVisible(cube.uuid, false);
    store.select(cube.uuid);

    store.detach();

    expect(stage.listenerCount).toBe(0);
    expect(store.getSnapshot()).toMatchObject({ ready: false, selectedId: null, canUndo: false });

    vi.advanceTimersByTime(1000);
    expect(stage.captures).toBe(0);
  });

  describe("model import and project manifest integration", () => {
    async function createFakeImportedModel(store: WorkspaceStore, name = "Lantern") {
      const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3, 4]);
      const primaryAsset = await store.assets.add(`${name.toLowerCase()}.glb`, "model/gltf-binary", bytes);
      const group = new THREE.Group();
      group.name = name;
      group.position.set(1, 2, 3);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
      mesh.name = "Glass";
      group.add(mesh);
      return {
        root: group,
        name,
        primaryAsset,
        companionAssets: [],
        warnings: [],
      };
    }

    it("imports a model undoably, selects it, frames the camera and updates project state", async () => {
      const { store, stage, root } = setup();
      const imported = await createFakeImportedModel(store, "Lantern");

      const id = store.importModel(imported);

      expect(store.getSnapshot().selectedId).toBe(id);
      expect(store.getSnapshot().importedCount).toBe(1);
      expect(store.getSnapshot().undoLabel).toBe("Import Lantern");
      expect(stage.framed.at(-1)).toEqual({ target: imported.root, animate: true });
      expect(root.children).toContain(imported.root);

      // Child meshes are discoverable, selectable, hideable and focusable
      const glass = imported.root.children[0]!;
      store.select(glass.uuid);
      store.focus();
      expect(stage.framed.at(-1)).toEqual({ target: glass, animate: true });

      store.setVisible(glass.uuid, false);
      expect(glass.visible).toBe(false);

      // Project manifest serialises and round-trips cleanly with the imported asset and visibility edit
      const manifest = store.toProjectManifest(new Date("2026-10-23T00:00:00.000Z"));
      const roundTripped = parseProject(serialiseProject(manifest));
      expect(roundTripped.assets).toHaveLength(1);
      expect(roundTripped.assets[0]!.hash).toBe(imported.primaryAsset.hash);
      expect(roundTripped.entries).toContainEqual(
        expect.objectContaining({
          name: "Lantern",
          source: { kind: "imported", assetHash: imported.primaryAsset.hash },
          transform: expect.objectContaining({ position: [1, 2, 3] }),
        }),
      );
      expect(roundTripped.edits["Lantern/Glass"]).toEqual({ visible: false });

      // Undo visibility then undo import
      store.undo();
      expect(glass.visible).toBe(true);

      store.undo();
      expect(root.children).not.toContain(imported.root);
      expect(store.getSnapshot().importedCount).toBe(0);

      // Redo import
      store.redo();
      expect(root.children).toContain(imported.root);
      expect(store.getSnapshot().importedCount).toBe(1);
      expect(store.getSnapshot().selectedId).toBe(id);
    });

    it("removes an imported model undoably and refuses to remove built-in objects", async () => {
      const { store, root, cube } = setup();
      const imported = await createFakeImportedModel(store, "Crate");
      const id = store.importModel(imported);

      expect(store.removeImportedObject(cube.uuid)).toBe(false);
      expect(store.removeImportedObject(id)).toBe(true);
      expect(root.children).not.toContain(imported.root);
      expect(store.getSnapshot().importedCount).toBe(0);
      expect(store.getSnapshot().undoLabel).toBe("Remove Crate");

      store.undo();
      expect(root.children).toContain(imported.root);
      expect(store.getSnapshot().importedCount).toBe(1);
      expect(store.getSnapshot().selectedId).toBe(id);
    });
  });
});
