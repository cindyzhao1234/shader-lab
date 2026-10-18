import { useId, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * A titled section inside a sidebar. Collapsible sections remember nothing
 * across reloads; they are for decluttering a session, not configuration.
 */

interface PanelProps {
  title: ReactNode;
  /** Small controls aligned to the right of the title. */
  actions?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Editorial serif title, for headings that name a Look or a section of the studio. */
  display?: boolean;
  className?: string;
  children: ReactNode;
}

export function Panel({
  title,
  actions,
  collapsible = false,
  defaultOpen = true,
  display = false,
  className,
  children,
}: PanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const titleClass = display ? "panel__title panel__title--display" : "panel__title";

  return (
    <section className={className ? `panel ${className}` : "panel"}>
      <header className="panel__header">
        {collapsible ? (
          <button
            type="button"
            className="panel__toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name="chevronRight" size={14} className={open ? "panel__chevron is-open" : "panel__chevron"} />
            <h2 className={titleClass}>{title}</h2>
          </button>
        ) : (
          <h2 className={titleClass}>{title}</h2>
        )}
        {actions && <div className="panel__actions">{actions}</div>}
      </header>
      {(!collapsible || open) && (
        <div id={bodyId} className="panel__body">
          {children}
        </div>
      )}
    </section>
  );
}
