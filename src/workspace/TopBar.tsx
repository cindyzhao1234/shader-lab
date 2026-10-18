import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Tooltip } from "../ui/Tooltip";
import { IS_MAC, useWorkspace, useWorkspaceStore } from "./context";
import { LogoMark, Wordmark } from "./LogoMark";
import { shortcutKeys } from "./shortcuts";

interface TopBarProps {
  compact: boolean;
  /** Project actions collapse to icons when the window can't fit their labels. */
  condensed: boolean;
  sceneOpen: boolean;
  looksOpen: boolean;
  onToggleScene: () => void;
  onToggleLooks: () => void;
  onShowWelcome: () => void;
  onShowShortcuts: () => void;
}

const SOON = {
  import: "Bringing in your own GLB, glTF and OBJ models is coming soon.",
  save: "Saving projects is coming soon. Changes in this session are not kept after you close the tab.",
  export: "Exporting screenshots and Looks is coming soon.",
};

export function TopBar({
  compact,
  condensed,
  sceneOpen,
  looksOpen,
  onToggleScene,
  onToggleLooks,
  onShowWelcome,
  onShowShortcuts,
}: TopBarProps) {
  const store = useWorkspaceStore();
  const { canUndo, canRedo, undoLabel, redoLabel } = useWorkspace();

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <LogoMark />
        {!compact && <Wordmark />}
      </div>

      <span className="topbar__divider" aria-hidden="true" />

      <div className="topbar__project">
        <ProjectName />
        {!compact && <span className="topbar__chip">Demo scene</span>}
      </div>

      <span className="topbar__spacer" />

      <div className="topbar__group" role="group" aria-label="History">
        <IconButton
          icon="undo"
          label={canUndo ? `Undo ${lowerFirst(undoLabel)}`.trim() : "Nothing to undo"}
          shortcut={shortcutKeys("undo", IS_MAC)}
          aria-disabled={!canUndo}
          className={canUndo ? undefined : "is-inert"}
          onClick={() => store.undo()}
        />
        <IconButton
          icon="redo"
          label={canRedo ? `Redo ${lowerFirst(redoLabel)}`.trim() : "Nothing to redo"}
          shortcut={shortcutKeys("redo", IS_MAC)}
          aria-disabled={!canRedo}
          className={canRedo ? undefined : "is-inert"}
          onClick={() => store.redo()}
        />
      </div>

      <div className="topbar__group topbar__group--project" role="group" aria-label="Project">
        {condensed ? (
          <>
            <IconButton icon="import" label="Import" unavailable={SOON.import} />
            <IconButton icon="save" label="Save" unavailable={SOON.save} />
            <IconButton icon="export" label="Export" unavailable={SOON.export} />
          </>
        ) : (
          <>
            <Button variant="ghost" icon="import" unavailable={SOON.import}>
              Import
            </Button>
            <Button variant="ghost" icon="save" unavailable={SOON.save}>
              Save
            </Button>
            <Button variant="secondary" icon="export" unavailable={SOON.export}>
              Export
            </Button>
          </>
        )}
      </div>

      <div className="topbar__group" role="group" aria-label="Workspace">
        <IconButton
          icon="panelLeft"
          label={sceneOpen ? "Hide scene panel" : "Show scene panel"}
          shortcut={shortcutKeys("toggleScene", IS_MAC)}
          pressed={sceneOpen}
          onClick={onToggleScene}
        />
        <IconButton
          icon="panelRight"
          label={looksOpen ? "Hide Look Studio" : "Show Look Studio"}
          shortcut={shortcutKeys("toggleLooks", IS_MAC)}
          pressed={looksOpen}
          onClick={onToggleLooks}
        />
        <IconButton
          icon="keyboard"
          label="Keyboard shortcuts"
          shortcut={shortcutKeys("shortcuts", IS_MAC)}
          onClick={onShowShortcuts}
        />
        <IconButton icon="help" label="Welcome guide" onClick={onShowWelcome} />
      </div>
    </header>
  );
}

/** "Hide Rock 1" becomes "hide Rock 1", keeping the object's own capitals. */
function lowerFirst(text: string | undefined): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
}

function ProjectName() {
  const store = useWorkspaceStore();
  const { projectName } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  const finish = (commit: boolean) => {
    if (commit) {
      store.renameProject(draft);
    }

    setEditing(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="project-name__input"
        aria-label="Project name"
        value={draft}
        maxLength={60}
        size={Math.max(draft.length, 8)}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") finish(true);
          if (event.key === "Escape") finish(false);
        }}
      />
    );
  }

  return (
    <Tooltip content="Rename project">
      <button
        ref={buttonRef}
        type="button"
        className="project-name"
        aria-label={`Project: ${projectName}. Rename`}
        onClick={() => {
          setDraft(projectName);
          setEditing(true);
        }}
      >
        <span className="project-name__text">{projectName}</span>
        <Icon name="pencil" size={13} className="project-name__pencil" />
      </button>
    </Tooltip>
  );
}
