import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * A hover and focus tooltip, rendered in a portal so panels with hidden
 * overflow cannot clip it.
 *
 * Tooltips are a visual aid. Whatever they say that matters — a button's
 * name, why something is unavailable — must also be in the control's own
 * accessible label, because touch and screen-reader users never see this.
 */

export type TooltipSide = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: ReactNode;
  /** Keys shown as small caps beside the text, e.g. ["⌘", "Z"]. */
  shortcut?: readonly string[];
  side?: TooltipSide;
  delay?: number;
  children: ReactNode;
  /** Lets the anchor fill its parent, for full-width rows and cards. */
  block?: boolean;
}

const GAP = 8;
const EDGE = 8;

export function Tooltip({ content, shortcut, side = "bottom", delay = 380, children, block }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; side: TooltipSide } | null>(null);
  const id = useId();

  const show = useCallback(
    (immediate = false) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setOpen(true), immediate ? 0 : delay);
    },
    [delay],
  );

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
    setPosition(null);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open, hide]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !bubbleRef.current) {
      return;
    }

    const anchor = anchorRef.current.getBoundingClientRect();
    const bubble = bubbleRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Flip to the opposite side when there is no room on the preferred one.
    let placed = side;
    if (side === "bottom" && anchor.bottom + GAP + bubble.height > viewportHeight - EDGE) placed = "top";
    if (side === "top" && anchor.top - GAP - bubble.height < EDGE) placed = "bottom";
    if (side === "right" && anchor.right + GAP + bubble.width > viewportWidth - EDGE) placed = "left";
    if (side === "left" && anchor.left - GAP - bubble.width < EDGE) placed = "right";

    let left: number;
    let top: number;

    if (placed === "top" || placed === "bottom") {
      left = anchor.left + anchor.width / 2 - bubble.width / 2;
      top = placed === "bottom" ? anchor.bottom + GAP : anchor.top - GAP - bubble.height;
    } else {
      top = anchor.top + anchor.height / 2 - bubble.height / 2;
      left = placed === "right" ? anchor.right + GAP : anchor.left - GAP - bubble.width;
    }

    left = Math.min(Math.max(left, EDGE), viewportWidth - bubble.width - EDGE);
    top = Math.min(Math.max(top, EDGE), viewportHeight - bubble.height - EDGE);
    setPosition({ left, top, side: placed });
  }, [open, side, content]);

  return (
    <>
      <span
        ref={anchorRef}
        className={block ? "tooltip-anchor tooltip-anchor--block" : "tooltip-anchor"}
        onPointerEnter={(event) => event.pointerType === "mouse" && show()}
        onPointerLeave={hide}
        onPointerDown={hide}
        onFocus={(event) => {
          // Only keyboard focus; a click already shows what the button does.
          if ((event.target as HTMLElement).matches(":focus-visible")) show(true);
        }}
        onBlur={hide}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            id={id}
            aria-hidden="true"
            className="tooltip"
            data-side={position?.side ?? side}
            data-ready={position ? "true" : "false"}
            style={position ? { left: position.left, top: position.top } : undefined}
          >
            <span className="tooltip__text">{content}</span>
            {shortcut && shortcut.length > 0 && (
              <span className="tooltip__keys">
                {shortcut.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
