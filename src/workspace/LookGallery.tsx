import type { CSSProperties } from "react";
import type { LookSummary } from "../looks/catalogue";
import { Icon } from "../ui/Icon";
import { Tooltip } from "../ui/Tooltip";
import type { PreviewState } from "./store";

/**
 * The collection of Looks, presented as numbered plates.
 *
 * Presentational: it is given Looks, preview images and the active id, and
 * reports clicks. Available Looks come first; an odd one out spans the full
 * width so the grid never ends on a lonely half-row. Planned Looks are shown
 * below as sealed plates, with a palette emblem in place of a preview — an
 * emblem, never a fake render.
 */

interface LookGalleryProps {
  looks: readonly LookSummary[];
  activeId: string;
  previews: Readonly<Record<string, PreviewState>>;
  onApply: (id: string) => void;
}

export function LookGallery({ looks, activeId, previews, onApply }: LookGalleryProps) {
  const available = looks.filter((look) => look.availability === "available");
  const planned = looks.filter((look) => look.availability === "planned");
  const plateNumber = (look: LookSummary) => String(looks.indexOf(look) + 1).padStart(2, "0");

  return (
    <div className="look-gallery">
      <ul className="look-gallery__grid" aria-label="Available Looks">
        {available.map((look, index) => (
          <li
            key={look.id}
            className={available.length % 2 === 1 && index === available.length - 1 ? "is-wide" : undefined}
          >
            <AvailableLookCard
              look={look}
              number={plateNumber(look)}
              active={look.id === activeId}
              preview={previews[look.id]}
              onApply={() => onApply(look.id)}
            />
          </li>
        ))}
      </ul>

      {planned.length > 0 && (
        <>
          <div className="look-gallery__divider">
            <span>Coming soon</span>
          </div>
          <ul className="look-gallery__grid" aria-label="Looks coming soon">
            {planned.map((look) => (
              <li key={look.id}>
                <PlannedLookCard look={look} number={plateNumber(look)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

interface AvailableLookCardProps {
  look: LookSummary;
  number: string;
  active: boolean;
  preview: PreviewState | undefined;
  onApply: () => void;
}

function AvailableLookCard({ look, number, active, preview, onApply }: AvailableLookCardProps) {
  return (
    <button
      type="button"
      className={active ? "look-card is-active" : "look-card"}
      style={{ "--look-accent": look.accent } as CSSProperties}
      aria-pressed={active}
      aria-label={`${look.name}. ${look.tagline}.${active ? " Applied." : ""}`}
      onClick={onApply}
    >
      <span className="look-card__preview">
        {preview?.src ? (
          <img
            key={preview.src}
            src={preview.src}
            alt=""
            className={preview.fresh ? "look-card__image" : "look-card__image is-stale"}
          />
        ) : (
          <span className="skeleton look-card__skeleton" />
        )}
        {active && (
          <span className="look-card__badge">
            <Icon name="star" size={12} />
            Applied
          </span>
        )}
      </span>
      <span className="look-card__text">
        <span className="look-card__number" aria-hidden="true">
          No. {number}
        </span>
        <span className="look-card__name">{look.name}</span>
        <span className="look-card__tagline">{look.tagline}</span>
      </span>
    </button>
  );
}

function PlannedLookCard({ look, number }: { look: LookSummary; number: string }) {
  const [a, b, c] = look.palette;
  const style = { "--swatch-a": a, "--swatch-b": b, "--swatch-c": c, "--look-accent": look.accent } as CSSProperties;
  const controls = look.controls.join(", ").replace(/, ([^,]*)$/, " and $1").toLowerCase();

  return (
    <Tooltip block side="left" content={`Coming soon. You'll be able to adjust ${controls}.`}>
      <button
        type="button"
        className="look-card is-planned"
        style={style}
        aria-disabled="true"
        aria-label={`${look.name}. ${look.tagline}. Coming soon.`}
        onClick={(event) => event.preventDefault()}
      >
        <span className="look-card__preview look-card__emblem" aria-hidden="true">
          <span className="emblem__dot emblem__dot--a" />
          <span className="emblem__dot emblem__dot--b" />
          <span className="emblem__dot emblem__dot--c" />
          <span className="look-card__seal">
            <Icon name="seal" size={22} />
          </span>
        </span>
        <span className="look-card__text">
          <span className="look-card__number" aria-hidden="true">
            No. {number}
          </span>
          <span className="look-card__name">{look.name}</span>
          <span className="look-card__tagline">{look.tagline}</span>
          <span className="look-card__soon" aria-hidden="true">
            Arrives in a later chapter
          </span>
        </span>
      </button>
    </Tooltip>
  );
}
