import { useState } from "react";
import { DEFAULT_LOOK_ID, LOOKS, ORIGINAL_TECHNIQUES, findLook } from "../looks/catalogue";
import type { LookParamDescriptor } from "../looks/schema";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Slider } from "../ui/Slider";
import { Tabs, tabPanelProps } from "../ui/Tabs";
import { useWorkspace, useWorkspaceStore } from "./context";
import { LookGallery } from "./LookGallery";

type StudioTab = "looks" | "adjustments";

export function LookStudio() {
  const store = useWorkspaceStore();
  const { activeLookId, lookParams, canResetLookParams, previews } = useWorkspace();
  const active = findLook(activeLookId);
  const [tab, setTab] = useState<StudioTab>("looks");

  const availableCount = LOOKS.filter((look) => look.availability === "available").length;
  const schema = active?.paramSchema ?? [];
  const techniques = active?.techniques ?? (active?.id === DEFAULT_LOOK_ID ? ORIGINAL_TECHNIQUES : []);

  const handleApplyLook = (id: string) => {
    if (store.applyLook(id)) {
      setTab("adjustments");
    }
  };

  return (
    <div className="sidebar__inner">
      <div className="sidebar__head">
        <div className="sidebar__head-row">
          <h2 className="sidebar__title">Look Studio</h2>
          {active && (
            <span className="sidebar__badge">
              {active.name}
              {active.experimental ? " · PoC" : ""}
            </span>
          )}
        </div>
        <p className="sidebar__subtitle">
          Non-destructive style presets. Models and materials stay untouched.
        </p>
      </div>

      <div className="sidebar__tabs">
        <Tabs
          idBase="studio"
          label="Look Studio sections"
          value={tab}
          onChange={setTab}
          items={[
            { id: "looks", label: "Looks", count: availableCount },
            {
              id: "adjustments",
              label: "Adjustments",
              count: schema.length > 0 ? schema.length : undefined,
            },
          ]}
        />
      </div>

      <div className="sidebar__scroll" {...tabPanelProps("studio", tab)} tabIndex={-1}>
        {tab === "looks" ? (
          <LookGallery
            looks={LOOKS}
            activeId={activeLookId}
            previews={previews}
            onApply={handleApplyLook}
          />
        ) : (
          active && (
            <section className="look-adjustments" aria-labelledby="look-details-name">
              <header className="look-adjustments__header">
                <div className="look-adjustments__title-group">
                  <span className="eyebrow">
                    Active Look{active.experimental ? " · Experimental" : ""}
                  </span>
                  <h3 id="look-details-name" className="look-adjustments__name">
                    {active.name}
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTab("looks")}
                >
                  All Looks
                </Button>
              </header>

              <p className="look-details__description">{active.description}</p>

              {schema.length > 0 ? (
                <div className="look-controls" role="group" aria-label={`${active.name} adjustments`}>
                  <div className="look-controls__header">
                    <h4 className="subhead">Parameters</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="reset"
                      aria-disabled={!canResetLookParams}
                      className={canResetLookParams ? undefined : "is-inert"}
                      tooltip="Reset all Look parameters to their defaults"
                      onClick={() => store.resetLookParams()}
                    >
                      Reset All
                    </Button>
                  </div>

                  <div className="look-controls__list">
                    {schema.map((descriptor) => (
                      <LookParamControl
                        key={descriptor.key}
                        descriptor={descriptor}
                        value={lookParams[descriptor.key] ?? descriptor.default}
                        onChange={(value) => store.setLookParam(descriptor.key, value)}
                        onCommit={() => store.endGesture()}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="look-details__note">
                  <Icon name="info" size={14} />
                  <p>
                    No adjustments are available for <strong>Original</strong> because it renders your scene with its untouched lighting and materials.
                  </p>
                </div>
              )}

              {techniques.length > 0 && (
                <div className="look-adjustments__pipeline">
                  <h4 className="subhead">Pipeline</h4>
                  <ul className="chip-list">
                    {techniques.map((technique) => (
                      <li key={technique} className="pill">
                        {technique}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )
        )}
      </div>
    </div>
  );
}

interface LookParamControlProps {
  descriptor: LookParamDescriptor;
  value: number | string | boolean;
  onChange: (value: number | string | boolean) => void;
  onCommit: () => void;
}

function LookParamControl({ descriptor, value, onChange, onCommit }: LookParamControlProps) {
  if (descriptor.kind === "number") {
    const numeric = typeof value === "number" ? value : descriptor.default;
    return (
      <Slider
        label={descriptor.label}
        value={numeric}
        min={descriptor.min}
        max={descriptor.max}
        step={descriptor.step}
        unit={descriptor.unit}
        defaultValue={descriptor.default}
        hint={descriptor.hint}
        onChange={(next) => onChange(next)}
        onCommit={onCommit}
      />
    );
  }

  return null;
}
