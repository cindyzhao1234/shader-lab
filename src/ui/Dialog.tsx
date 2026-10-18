import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "./Button";

/**
 * A modal dialog on the native <dialog> element, which provides focus
 * trapping, Escape to close, inertness of the page behind and a top-layer
 * backdrop without any library.
 */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Visually hidden title, for dialogs whose design leads with something else. */
  hideTitle?: boolean;
  description?: ReactNode;
  size?: "md" | "lg";
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  hideTitle = false,
  description,
  size = "md",
  footer,
  className,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
      // showModal focuses the first focusable element, which is the close
      // button. A dialog can nominate a better starting point.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={["dialog", `dialog--${size}`, className].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        // The browser may close a modal on its own (Chrome skips `cancel` when
        // there has been no user activation). Keep React's state in step.
        if (open) onClose();
      }}
      onClick={(event) => {
        // A click landing on the <dialog> itself, not its content, is the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="dialog__surface">
          <header className={hideTitle ? "dialog__header dialog__header--bare" : "dialog__header"}>
            <div>
              <h2 id={titleId} className={hideTitle ? "visually-hidden" : "dialog__title"}>
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="dialog__description">
                  {description}
                </p>
              )}
            </div>
            <IconButton icon="close" label="Close" size="sm" onClick={onClose} className="dialog__close" />
          </header>
          {children && <div className="dialog__body">{children}</div>}
          {footer && <footer className="dialog__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
