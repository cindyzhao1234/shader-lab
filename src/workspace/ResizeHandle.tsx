import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { PANEL_LIMITS, clampPanelWidth, type PanelSide } from "./layout";

/**
 * Drag a panel's inner edge to resize it. Pointer capture keeps the drag on
 * the handle even when the pointer crosses the viewport, so resizing can
 * never be mistaken for an orbit. Arrow keys resize too; double-click resets.
 */

interface ResizeHandleProps {
  side: PanelSide;
  width: number;
  label: string;
  onResize: (width: number) => void;
}

const KEY_STEP = 16;

export function ResizeHandle({ side, width, label, onResize }: ResizeHandleProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  // Several key presses can land before the next render; each must build on the last.
  const latest = useRef(width);
  latest.current = width;
  const limits = PANEL_LIMITS[side];
  const direction = side === "left" ? 1 : -1;

  const resizeTo = (next: number) => {
    latest.current = clampPanelWidth(side, next);
    onResize(latest.current);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    document.body.classList.add("is-resizing");
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const delta = (event.clientX - drag.current.startX) * direction;
    resizeTo(drag.current.startWidth + delta);
  };

  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.classList.remove("is-resizing");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
    const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";

    if (event.key === grow) resizeTo(latest.current + KEY_STEP);
    else if (event.key === shrink) resizeTo(latest.current - KEY_STEP);
    else if (event.key === "Home") resizeTo(limits.min);
    else if (event.key === "End") resizeTo(limits.max);
    else return;

    event.preventDefault();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      className={`resize-handle resize-handle--${side}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => resizeTo(limits.initial)}
      onKeyDown={onKeyDown}
    />
  );
}
