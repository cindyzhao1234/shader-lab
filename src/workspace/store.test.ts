import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { History } from "../core/history";
import { WorkspaceStore, type StageLike } from "./store";

class FakeStage implements StageLike {
  fov = 50;
  renders = 0;
  captures = 0;
  framed: Array<{ target: THREE.Object3D; animate?: boolean }> = [];
  resets = 0;
  private settled = new Set<() => void>();

  requestRender(): void {
    this.renders += 1;
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
  captureFrame(): string {
    this.captures += 1;
    return `data:image/webp;capture-${this.captures}`;
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

  describe("previews", () => {
    it("renders the Original thumbnail once things go quiet", () => {
      const { store, stage } = setup();

      expect(store.getSnapshot().previews.original).toEqual({ src: undefined, fresh: false });

      vi.advanceTimersByTime(100);

      expect(stage.captures).toBe(1);
      expect(store.getSnapshot().previews.original).toEqual({
        src: "data:image/webp;capture-1",
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
      expect(stage.captures).toBe(1);
    });

    it("keeps showing the previous image, marked stale, while re-rendering", () => {
      const { store, stage } = setup();
      vi.advanceTimersByTime(100);

      stage.settle();

      expect(store.getSnapshot().previews.original).toEqual({
        src: "data:image/webp;capture-1",
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
});
