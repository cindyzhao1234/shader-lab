import { useState, type RefObject } from "react";
import type { StageStats } from "../render/stage";
import { FOV_RANGE } from "../render/stage";
import { findLook } from "../looks/catalogue";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Popover } from "../ui/Popover";
import { Slider } from "../ui/Slider";
import { Tooltip } from "../ui/Tooltip";
import { IS_MAC, useWorkspace, useWorkspaceStore } from "./context";
import { shortcutKeys } from "./shortcuts";

/**
 * The full-screen 3D view and the compact floating controls anchored at its
 * bottom edge.
 *
 * Overlays are siblings of the canvas, not children, and OrbitControls only
 * listens on the canvas — so clicking a toolbar button can never start an
 * orbit, and orbiting can never press a button.
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
  const { fov, activeLookId } = useWorkspace();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const look = findLook(activeLookId);

  return (
    <div className="viewport">
      <canvas
        ref={canvasRef}
        className="viewport__canvas"
        aria-label="3D view of your scene. Drag to orbit, scroll to zoom, right-drag to pan."
        onPointerDown={() => setInteracted(true)}
        onWheel={() => setInteracted(true)}
      />

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
        </div>

        {look && (
          <div className="viewport__look" aria-live="polite">
            <span className="viewport__look-pip" aria-hidden="true" />
            <span className="viewport__look-label">Look</span>
            <span className="viewport__look-name">{look.name}</span>
          </div>
        )}
      </div>

      <p className={interacted ? "viewport__hint is-hidden" : "viewport__hint"} aria-hidden="true">
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
