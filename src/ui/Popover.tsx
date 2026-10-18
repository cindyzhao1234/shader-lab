import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A small non-modal panel anchored under a trigger. Closes on Escape or a
 * pointer press outside it. Focus returns to the trigger on Escape.
 */

interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Render prop for the trigger, receiving the ARIA wiring it needs. */
  trigger: (props: { "aria-expanded": boolean; "aria-controls": string; onClick: () => void }) => ReactNode;
  label: string;
  align?: "start" | "end";
  tone?: "default" | "onDark";
  children: ReactNode;
}

export function Popover({ open, onOpenChange, trigger, label, align = "start", tone = "default", children }: PopoverProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onOpenChange(false);
        rootRef.current?.querySelector<HTMLElement>("[aria-expanded]")?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="popover">
      {trigger({ "aria-expanded": open, "aria-controls": id, onClick: () => onOpenChange(!open) })}
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={[
            "popover__panel",
            `popover__panel--${align}`,
            tone === "onDark" && "popover__panel--on-dark",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </div>
      )}
    </div>
  );
}
