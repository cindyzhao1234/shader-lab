import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { DEFAULT_LOOK_ID, findLook } from "../looks/catalogue";
import {
  SPLIT_BOUNDS,
  pointerToSplitRatio,
  stepSplitRatio,
} from "../render/comparison";
import type { StageStats } from "../render/stage";
import { FOV_RANGE } from "../render/stage";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Popover } from "../ui/Popover";
import { Slider } from "../ui/Slider";
import { Tooltip } from "../ui/Tooltip";
import { IS_MAC, useWorkspace, useWorkspaceStore } from "./context";
import { shortcutKeys } from "./shortcuts";

/**
 * The full-screen 3D view, Before/After comparison overlay, and the compact
 * floating controls anchored at its bottom edge.
 *
 * Overlays are siblings of the canvas, not children, and OrbitControls only
 * listens on the canvas — so clicking a toolbar button or dragging the
 * comparison divider can never start an orbit, and orbiting can never press a
 * button.
 */

interface ViewportProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stats: StageStats | null;
  loading: boolean;
  showStats: boolean;
  onToggleStats: () => void;
}

const DEFAULT_FOV = 50;

export function Viewport({ canvasRef, stats, loading, showStats, onToggleStats }: ViewportProps) {
  const store = useWorkspaceStore();
  const { fov, activeLookId, comparisonMode, splitRatio } = useWorkspace();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const look = findLook(activeLookId);
  const comparing = comparisonMode !== "off";
  const isIdentityLook = activeLookId === DEFAULT_LOOK_ID;
  const splitPercent = Math.round(splitRatio * 100);

  const updateSplitFromClientX = (clientX: number) => {
    const container = viewportRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    store.setSplitRatio(pointerToSplitRatio(clientX, rect.left, rect.width));
  };

  const onDividerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingSplit(true);
    updateSplitFromClientX(event.clientX);
  };

  const onDividerPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingSplit) return;
    event.preventDefault();
    updateSplitFromClientX(event.clientX);
  };

  const onDividerPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingSplit) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDraggingSplit(false);
  };

  const onDividerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? SPLIT_BOUNDS.keyboardLargeStep : SPLIT_BOUNDS.keyboardStep;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      store.setSplitRatio(stepSplitRatio(splitRatio, -step));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      store.setSplitRatio(stepSplitRatio(splitRatio, step));
    } else if (event.key === "Home") {
      event.preventDefault();
      store.setSplitRatio(SPLIT_BOUNDS.min);
    } else if (event.key === "End") {
      event.preventDefault();
      store.setSplitRatio(SPLIT_BOUNDS.max);
    }
  };

  return (
    <div ref={viewportRef} className="viewport">
      <canvas
        ref={canvasRef}
        className="viewport__canvas"
        aria-label="3D view of your scene. Drag to orbit, scroll to zoom, right-drag to pan."
        onPointerDown={() => setInteracted(true)}
        onWheel={() => setInteracted(true)}
      />

      {comparing && (
        <div
          className={`comparison-overlay comparison-overlay--${comparisonMode}`}
          style={{ "--split-pos": `${(splitRatio * 100).toFixed(2)}%` } as CSSProperties}
        >
          <div className="comparison-labels" aria-live="polite">
            <span className="comparison-badge comparison-badge--before">
              <span className="comparison-badge__tag">Before</span>
              <span className="comparison-badge__name">Original</span>
            </span>

            <span className="comparison-badge comparison-badge--after">
              <span className="comparison-badge__tag">After</span>
              <span className="comparison-badge__name">{look?.name ?? "Active Look"}</span>
              {isIdentityLook && (
                <span className="comparison-badge__note">Same as Original · select a Look to compare</span>
              )}
            </span>
          </div>

          {comparisonMode === "split" ? (
            <div
              role="slider"
              tabIndex={0}
              className={draggingSplit ? "comparison-divider is-dragging" : "comparison-divider"}
              aria-label="Comparison split position"
              aria-valuemin={Math.round(SPLIT_BOUNDS.min * 100)}
              aria-valuemax={Math.round(SPLIT_BOUNDS.max * 100)}
              aria-valuenow={splitPercent}
              aria-valuetext={`${splitPercent}% Original, ${100 - splitPercent}% ${look?.name ?? "Active Look"}`}
              onPointerDown={onDividerPointerDown}
              onPointerMove={onDividerPointerMove}
              onPointerUp={onDividerPointerUp}
              onPointerCancel={onDividerPointerUp}
              onDoubleClick={() => store.resetSplitRatio()}
              onKeyDown={onDividerKeyDown}
            >
              <span className="comparison-divider__line" aria-hidden="true" />
              <span className="comparison-divider__handle" aria-hidden="true">
                <Icon name="compare" size={14} />
              </span>
            </div>
          ) : (
            <div className="comparison-seam" aria-hidden="true" />
          )}
        </div>
      )}

      <div className="viewport__bottom">
        <div className="viewport__toolbar" role="toolbar" aria-label="View">
          <Tooltip content="Focus selection" shortcut={shortcutKeys("focus", IS_MAC)}>
            <button
              type="button"
              className="viewport__fit-btn"
              aria-label="Focus selection"
              onClick={() => store.focus()}
            >
              <Icon name="focus" size={14} />
              <span>Fit View</span>
              <kbd aria-hidden="true">F</kbd>
            </button>
          </Tooltip>
          <span className="viewport__toolbar-divider" aria-hidden="true" />
          <IconButton
            icon="reset"
            size="sm"
            label="Return to starting view"
            shortcut={shortcutKeys("resetView", IS_MAC)}
            onClick={() => store.resetView()}
          />
          <Popover
            open={cameraOpen}
            onOpenChange={setCameraOpen}
            label="Camera"
            align="end"
            trigger={(props) => (
              <IconButton icon="camera" size="sm" label="Camera" pressed={cameraOpen} {...props} />
            )}
          >
            <Slider
              label="Field of view"
              value={Math.round(fov)}
              min={FOV_RANGE.min}
              max={FOV_RANGE.max}
              step={1}
              unit="°"
              defaultValue={DEFAULT_FOV}
              hint="Wide angles exaggerate depth. Narrow ones flatten it, like a long lens."
              onChange={(value) => store.setFov(value)}
              onCommit={() => store.endGesture()}
            />
          </Popover>
          <IconButton
            icon="gauge"
            size="sm"
            label={showStats ? "Hide performance" : "Show performance"}
            pressed={showStats}
            onClick={onToggleStats}
          />
          <span className="viewport__toolbar-divider" aria-hidden="true" />
          <Tooltip
            content={comparing ? "Exit Before/After comparison" : "Compare Original with active Look"}
            shortcut={shortcutKeys("toggleComparison", IS_MAC)}
          >
            <button
              type="button"
              className={comparing ? "viewport__compare-btn is-active" : "viewport__compare-btn"}
              aria-label="Compare Original with active Look"
              aria-pressed={comparing}
              onClick={() => store.toggleComparison()}
            >
              <Icon name="compare" size={14} />
              <span>Compare</span>
              <kbd aria-hidden="true">C</kbd>
            </button>
          </Tooltip>
          {comparing && (
            <div className="viewport__compare-modes" role="group" aria-label="Comparison layout">
              <button
                type="button"
                className={comparisonMode === "split" ? "viewport__mode-btn is-active" : "viewport__mode-btn"}
                aria-pressed={comparisonMode === "split"}
                onClick={() => store.setComparisonMode("split")}
              >
                Split
              </button>
              <button
                type="button"
                className={
                  comparisonMode === "side-by-side" ? "viewport__mode-btn is-active" : "viewport__mode-btn"
                }
                aria-pressed={comparisonMode === "side-by-side"}
                onClick={() => store.setComparisonMode("side-by-side")}
              >
                2-Up
              </button>
            </div>
          )}
        </div>

        {look && (
          <div className="viewport__look" aria-live="polite">
            <span className="viewport__look-pip" aria-hidden="true" />
            <span className="viewport__look-label">Look</span>
            <span className="viewport__look-name">{look.name}</span>
          </div>
        )}
      </div>

      <p className={interacted || comparing ? "viewport__hint is-hidden" : "viewport__hint"} aria-hidden="true">
        <Icon name="orbit" size={13} />
        <span className="viewport__hint-mouse">Drag to orbit · Scroll to zoom · Right-drag to pan</span>
        <span className="viewport__hint-touch">Drag to orbit · Pinch to zoom · Two-finger drag to pan</span>
      </p>

      {showStats && stats && (
        <div className="viewport__stats" aria-label="Performance">
          <span>
            <strong>{Number.isFinite(stats.frameMs) ? stats.frameMs.toFixed(1) : "–"}</strong> ms
          </span>
          <span>
            <strong>{stats.triangles.toLocaleString()}</strong> tris
          </span>
          <span>
            <strong>{stats.drawCalls}</strong> draws
          </span>
        </div>
      )}

      <div className={loading ? "viewport__loading" : "viewport__loading is-done"} aria-hidden={!loading}>
        <span className="viewport__loading-dot" />
        Preparing your studio…
      </div>
    </div>
  );
}
