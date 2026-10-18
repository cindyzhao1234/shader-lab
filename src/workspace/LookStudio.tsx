import { LOOKS, ORIGINAL_TECHNIQUES, findLook } from "../looks/catalogue";
import { Icon } from "../ui/Icon";
import { useWorkspace, useWorkspaceStore } from "./context";
import { LookGallery } from "./LookGallery";

export function LookStudio() {
  const store = useWorkspaceStore();
  const { activeLookId, previews } = useWorkspace();
  const active = findLook(activeLookId);

  return (
    <div className="sidebar__inner">
      <div className="sidebar__head studio-head">
        <p className="eyebrow">
          <Icon name="star" size={11} />
          Look Studio
        </p>
        <h2 className="studio-head__title">
          Choose a <span className="highlight">Look</span>
        </h2>
        <p className="sidebar__subtitle">
          A Look changes how your scene is drawn. Your models and materials always stay as they are.
        </p>
      </div>

      <div className="sidebar__scroll">
        <LookGallery looks={LOOKS} activeId={activeLookId} previews={previews} onApply={(id) => store.applyLook(id)} />

        {active && (
          <section className="look-details" aria-labelledby="look-details-name">
            <p className="eyebrow">Applied</p>
            <h3 id="look-details-name" className="look-details__name">
              {active.name}
            </h3>
            <p className="look-details__description">{active.description}</p>

            {active.id === "original" && (
              <>
                <h4 className="subhead">In this Look</h4>
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
                <Icon name="sparkles" size={16} />
                <p>
                  Original has nothing to adjust. When stylised Looks arrive, their controls will appear here.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
