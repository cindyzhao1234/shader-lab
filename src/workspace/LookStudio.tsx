import { useState } from "react";
import { LOOKS, ORIGINAL_TECHNIQUES, findLook } from "../looks/catalogue";
import { Icon } from "../ui/Icon";
import { useWorkspace, useWorkspaceStore } from "./context";
import { LookGallery } from "./LookGallery";

export function LookStudio() {
  const store = useWorkspaceStore();
  const { activeLookId, previews } = useWorkspace();
  const active = findLook(activeLookId);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  return (
    <div className="sidebar__inner">
      <div className="sidebar__head studio-head">
        <div className="sidebar__head-row">
          <h2 className="sidebar__title">Look Studio</h2>
          {active && <span className="sidebar__badge">{active.name}</span>}
        </div>
        <p className="sidebar__subtitle">
          Non-destructive style presets. Models and materials stay untouched.
        </p>
      </div>

      <div className="sidebar__scroll">
        <LookGallery looks={LOOKS} activeId={activeLookId} previews={previews} onApply={(id) => store.applyLook(id)} />

        {active && (
          <section className="look-details" aria-labelledby="look-details-name">
            <button
              type="button"
              className="look-details__toggle"
              aria-expanded={inspectorOpen}
              onClick={() => setInspectorOpen((current) => !current)}
            >
              <span className="eyebrow">Active Look · {active.name}</span>
              <Icon
                name="chevronRight"
                size={13}
                className={inspectorOpen ? "panel__chevron is-open" : "panel__chevron"}
              />
            </button>

            {inspectorOpen && (
              <div className="look-details__body">
                <h3 id="look-details-name" className="visually-hidden">
                  {active.name}
                </h3>
                <p className="look-details__description">{active.description}</p>

                {active.id === "original" && (
                  <>
                    <h4 className="subhead">Pipeline</h4>
                    <ul className="chip-list">
                      {ORIGINAL_TECHNIQUES.map((technique) => (
                        <li key={technique} className="pill">
                          {technique}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {active.controls.length === 0 && (
                  <div className="look-details__note">
                    <Icon name="sparkles" size={14} />
                    <p>
                      Original has no style parameters. Stylised Look sliders appear here once unlocked.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
