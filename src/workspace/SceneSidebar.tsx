import { useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Button, IconButton } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { Tabs, tabPanelProps } from "../ui/Tabs";
import { IS_MAC, useWorkspace, useWorkspaceStore } from "./context";
import { buildSceneRows, summariseObject, type ObjectSummary, type SceneRow } from "./sceneModel";
import { shortcutKeys } from "./shortcuts";

type SceneTab = "objects" | "lights";

const ROW_ICONS: Record<string, IconName> = {
  mesh: "cube",
  group: "group",
  directional: "sun",
  point: "bulb",
  spot: "spot",
  ambient: "sun",
  hemisphere: "sun",
  other: "bulb",
};

function rowIcon(row: SceneRow): IconName {
  return ROW_ICONS[row.kind === "light" ? (row.lightKind ?? "other") : row.kind] ?? "cube";
}

export function SceneSidebar() {
  const store = useWorkspaceStore();
  const { sceneRevision, selectedId, ready } = useWorkspace();
  const [tab, setTab] = useState<SceneTab>("objects");

  // sceneRevision is the signal that the graph changed; the root itself is stable.
  const rows = useMemo(() => {
    const root = store.contentRoot;
    return root ? buildSceneRows(root) : [];
  }, [store, sceneRevision, ready]);

  const objects = rows.filter((row) => row.kind !== "light");
  const lights = rows.filter((row) => row.kind === "light");
  const visibleRows = tab === "objects" ? objects : lights;

  const selected = useMemo(() => {
    const object = selectedId ? store.getObject(selectedId) : undefined;
    return object ? summariseObject(object) : undefined;
  }, [store, selectedId, sceneRevision]);

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(".scene-row__main"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[event.key === "ArrowDown" ? index + 1 : index - 1];

    if (next) {
      event.preventDefault();
      next.focus();
      next.click();
    }
  };

  return (
    <div className="sidebar__inner">
      <div className="sidebar__head">
        <h2 className="sidebar__title">Scene</h2>
        <p className="sidebar__subtitle">Everything in your scene, and what it&rsquo;s made of.</p>
      </div>

      <div className="sidebar__tabs">
        <Tabs
          idBase="scene"
          label="Scene contents"
          value={tab}
          onChange={setTab}
          items={[
            { id: "objects", label: "Objects", count: objects.length },
            { id: "lights", label: "Lights", count: lights.length },
          ]}
        />
      </div>

      <div className="sidebar__scroll" {...tabPanelProps("scene", tab)} tabIndex={-1}>
        {!ready ? (
          <ul className="scene-list" aria-busy="true">
            {Array.from({ length: 5 }, (_, index) => (
              <li key={index} className="scene-row scene-row--skeleton">
                <span className="skeleton" />
              </li>
            ))}
          </ul>
        ) : visibleRows.length === 0 ? (
          <p className="empty-note">{tab === "objects" ? "This scene has no objects." : "This scene has no lights."}</p>
        ) : (
          <ul className="scene-list" onKeyDown={onListKeyDown}>
            {visibleRows.map((row) => (
              <SceneRowItem
                key={row.id}
                row={row}
                selected={row.id === selectedId}
                onSelect={() => store.select(row.id === selectedId ? null : row.id)}
                onFocus={() => {
                  store.select(row.id);
                  store.focus();
                }}
                onToggleVisible={() => store.setVisible(row.id, !row.visible)}
              />
            ))}
          </ul>
        )}
      </div>

      <SelectionDetails summary={selected} onFocus={() => store.focus()} onClear={() => store.select(null)} />
    </div>
  );
}

interface SceneRowItemProps {
  row: SceneRow;
  selected: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onToggleVisible: () => void;
}

function SceneRowItem({ row, selected, onSelect, onFocus, onToggleVisible }: SceneRowItemProps) {
  const className = ["scene-row", selected && "is-selected", !row.shown && "is-hidden"].filter(Boolean).join(" ");

  return (
    <li className={className} style={{ "--depth": row.depth } as CSSProperties}>
      <button
        type="button"
        className="scene-row__main"
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onFocus}
      >
        <Icon name={rowIcon(row)} size={16} className="scene-row__icon" />
        <span className="scene-row__name">{row.name}</span>
      </button>
      <IconButton
        icon={row.visible ? "eye" : "eyeOff"}
        label={row.visible ? `Hide ${row.name}` : `Show ${row.name}`}
        size="sm"
        tooltipSide="right"
        className="scene-row__eye"
        onClick={onToggleVisible}
      />
    </li>
  );
}

interface SelectionDetailsProps {
  summary: ObjectSummary | undefined;
  onFocus: () => void;
  onClear: () => void;
}

function SelectionDetails({ summary, onFocus, onClear }: SelectionDetailsProps) {
  if (!summary) {
    return (
      <section className="details details--empty" aria-label="Selection details">
        <span className="details__empty-icon">
          <Icon name="info" size={18} />
        </span>
        <p>
          Select something to see what it&rsquo;s made of. <span className="muted">Double-click to fly the camera to it.</span>
        </p>
      </section>
    );
  }

  const material = summary.materials?.[0];

  return (
    <section className="details" aria-label={`Details for ${summary.name}`}>
      <header className="details__header">
        <div className="details__heading">
          <h3 className="details__name">{summary.name}</h3>
          <span className="details__type">
            {summary.typeLabel}
            {!summary.visible && <span className="pill pill--muted">Hidden</span>}
          </span>
        </div>
        <IconButton icon="close" label="Clear selection" size="sm" onClick={onClear} />
      </header>

      <dl className="facts">
        {summary.triangles !== undefined && (
          <Fact label="Triangles" value={summary.triangles.toLocaleString()} />
        )}
        {material && (
          <>
            <Fact label="Material" value={material.type} />
            {material.colour && (
              <Fact
                label="Colour"
                value={
                  <span className="swatch-value">
                    <span className="swatch" style={{ background: material.colour }} />
                    {material.colour.toUpperCase()}
                  </span>
                }
              />
            )}
            {material.roughness !== undefined && <Meter label="Roughness" value={material.roughness} />}
            {material.metalness !== undefined && <Meter label="Metalness" value={material.metalness} />}
            {(material.hasColourTexture || material.hasNormalMap) && (
              <Fact
                label="Textures"
                value={
                  <span className="chip-row">
                    {material.hasColourTexture && <span className="pill">Colour</span>}
                    {material.hasNormalMap && <span className="pill">Normal map</span>}
                  </span>
                }
              />
            )}
          </>
        )}
        {summary.light && (
          <>
            <Fact
              label="Colour"
              value={
                <span className="swatch-value">
                  <span className="swatch" style={{ background: summary.light.colour }} />
                  {summary.light.colour.toUpperCase()}
                </span>
              }
            />
            <Fact label="Brightness" value={summary.light.intensity.toFixed(1)} />
            <Fact label="Shadows" value={summary.light.castsShadow ? "On" : "Off"} />
          </>
        )}
      </dl>

      <div className="details__footer">
        <Button size="sm" icon="focus" onClick={onFocus} tooltip="Fly the camera to this" shortcut={shortcutKeys("focus", IS_MAC)}>
          Focus
        </Button>
        <span className="details__note">Editing arrives soon</span>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Read-only: a bar, not a slider, so it never looks draggable. */
function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd className="meter-value">
        <span className="meter" aria-hidden="true">
          <span className="meter__fill" style={{ width: `${Math.round(value * 100)}%` }} />
        </span>
        {value.toFixed(2)}
      </dd>
    </div>
  );
}
