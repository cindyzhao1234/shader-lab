import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type RefObject,
} from "react";
import { readBrowserFiles } from "./render/gltfImport";
import { RenderStage, type StageStats } from "./render/stage";
import { createDemoScene } from "./scenes/demo";
import { Icon } from "./ui/Icon";
import { IS_MAC, WorkspaceProvider, useWorkspace, useWorkspaceStore } from "./workspace/context";
import { useLayoutPreferences, useWindowWidth } from "./workspace/hooks";
import { fitPanels, isDocked, layoutModeFor, type PanelSide } from "./workspace/layout";
import { LookStudio } from "./workspace/LookStudio";
import { ResizeHandle } from "./workspace/ResizeHandle";
import { SceneSidebar } from "./workspace/SceneSidebar";
import { ShortcutsDialog } from "./workspace/ShortcutsDialog";
import { isTypingTarget, matchShortcut } from "./workspace/shortcuts";
import { WorkspaceStore } from "./workspace/store";
import { TopBar } from "./workspace/TopBar";
import { Viewport } from "./workspace/Viewport";
import { WelcomeDialog } from "./workspace/WelcomeDialog";

/** Outer floating margins and gaps between floating panels and viewport. Matches app.css. */
const CHROME_WIDTH = 12 * 2 + 12 * 2;

export default function App() {
  const [store] = useState(() => new WorkspaceStore({ projectName: "My First Look" }));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stats, setStats] = useState<StageStats | null>(null);
  const [firstFrame, setFirstFrame] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let stage: RenderStage;

    try {
      stage = new RenderStage({ canvas });
    } catch (error) {
      setFailure(error instanceof Error && error.message ? error.message : "This browser could not start WebGL2.");
      return;
    }

    const demo = createDemoScene();
    stage.scene.add(demo.root);
    stage.frameAll(demo.root);
    store.attach(stage, demo.root);

    if (!stage.capabilities.highPrecision) {
      setNotice(
        "This graphics card can't render to high-precision buffers, so glow and colour grading may show some banding.",
      );
    }

    const stopStats = stage.onStats(setStats);
    const stopFirstFrame = stage.onFirstFrame(() => setFirstFrame(true));

    return () => {
      stopStats();
      stopFirstFrame();
      store.detach();
      stage.dispose();
      setStats(null);
      setFirstFrame(false);
    };
  }, [store]);

  if (failure) {
    return (
      <div className="failure">
        <div className="failure__card">
          <h2>Game Look Lab needs WebGL2</h2>
          <p>{failure}</p>
          <p className="muted">Try a recent version of Chrome, Edge, Firefox or Safari, with hardware acceleration turned on.</p>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceProvider store={store}>
      <Workspace
        canvasRef={canvasRef}
        stats={stats}
        firstFrame={firstFrame}
        notice={notice}
        onShowNotice={setNotice}
        onDismissNotice={() => setNotice(null)}
      />
    </WorkspaceProvider>
  );
}

interface WorkspaceProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stats: StageStats | null;
  firstFrame: boolean;
  notice: string | null;
  onShowNotice: (message: string | null) => void;
  onDismissNotice: () => void;
}

function Workspace({
  canvasRef,
  stats,
  firstFrame,
  notice,
  onShowNotice,
  onDismissNotice,
}: WorkspaceProps) {
  const store = useWorkspaceStore();
  const { projectName } = useWorkspace();
  const windowWidth = useWindowWidth();
  const [preferences, updatePreferences] = useLayoutPreferences();
  const [drawer, setDrawer] = useState<PanelSide | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mode = layoutModeFor(windowWidth);
  const leftDocked = isDocked("left", mode);
  const rightDocked = isDocked("right", mode);
  const leftShown = leftDocked ? preferences.leftOpen : drawer === "left";
  const rightShown = rightDocked ? preferences.rightOpen : drawer === "right";

  const widths = fitPanels(
    { left: preferences.leftWidth, right: preferences.rightWidth },
    { left: leftDocked && preferences.leftOpen, right: rightDocked && preferences.rightOpen },
    windowWidth - CHROME_WIDTH,
  );

  useEffect(() => {
    document.title = `${projectName} — Game Look Lab`;
  }, [projectName]);

  // First visit: greet once the scene is actually on screen.
  useEffect(() => {
    if (firstFrame && !preferences.welcomeSeen) {
      setWelcomeOpen(true);
    }
  }, [firstFrame, preferences.welcomeSeen]);

  // A drawer left open while widening the window would cover nothing useful.
  useEffect(() => {
    if (drawer && isDocked(drawer, mode)) {
      setDrawer(null);
    }
  }, [drawer, mode]);

  const togglePanel = useCallback(
    (side: PanelSide) => {
      if (isDocked(side, mode)) {
        updatePreferences(side === "left" ? { leftOpen: !preferences.leftOpen } : { rightOpen: !preferences.rightOpen });
      } else {
        setDrawer((current) => (current === side ? null : side));
      }
    },
    [mode, preferences.leftOpen, preferences.rightOpen, updatePreferences],
  );

  const setWorkspaceView = useCallback(
    (view: "preview" | "studio") => {
      if (mode === "compact") {
        setDrawer(view === "studio" ? "right" : null);
        return;
      }
      if (mode === "medium") {
        setDrawer(null);
        updatePreferences({ rightOpen: view === "studio" });
        return;
      }
      updatePreferences({ leftOpen: view === "studio", rightOpen: view === "studio" });
    },
    [mode, updatePreferences],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      try {
        const inputs = await readBrowserFiles(list);
        const result = await store.importFiles(inputs);
        if (result.warnings.length > 0) {
          onShowNotice(result.warnings.join(" "));
        } else {
          onShowNotice(null);
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Could not import the selected 3D model.";
        onShowNotice(message);
      }
    },
    [store, onShowNotice],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      void handleFiles(event.target.files);
      event.target.value = "";
    }
  };

  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDraggingFiles(true);
  };

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDraggingFiles(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDraggingFiles(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      void handleFiles(event.dataTransfer.files);
    }
  };

  const closeWelcome = () => {
    setWelcomeOpen(false);
    updatePreferences({ welcomeSeen: true });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || welcomeOpen || shortcutsOpen) return;

      if (event.key === "Escape" && drawer) {
        setDrawer(null);
        return;
      }

      if (isTypingTarget(event.target as HTMLElement | null)) return;

      const shortcut = matchShortcut(event, IS_MAC);
      if (!shortcut) return;

      event.preventDefault();

      switch (shortcut) {
        case "undo":
          store.undo();
          break;
        case "redo":
          store.redo();
          break;
        case "focus":
          store.focus();
          break;
        case "resetView":
          store.resetView();
          break;
        case "toggleComparison":
          store.toggleComparison();
          break;
        case "toggleScene":
          togglePanel("left");
          break;
        case "toggleLooks":
          togglePanel("right");
          break;
        case "shortcuts":
          setShortcutsOpen(true);
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, drawer, welcomeOpen, shortcutsOpen, togglePanel]);

  const gridStyle = {
    "--left-width": `${leftDocked && preferences.leftOpen ? widths.left : 0}px`,
    "--right-width": `${rightDocked && preferences.rightOpen ? widths.right : 0}px`,
  } as CSSProperties;

  return (
    <div
      className={`app app--${mode}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,.bin,image/png,image/jpeg,image/webp"
        multiple
        hidden
        aria-label="Import 3D model files"
        onChange={onFileInputChange}
      />

      <TopBar
        compact={mode === "compact"}
        condensed={mode !== "wide"}
        sceneOpen={leftShown}
        looksOpen={rightShown}
        onImport={openFilePicker}
        onToggleScene={() => togglePanel("left")}
        onToggleLooks={() => togglePanel("right")}
        onSetWorkspaceView={setWorkspaceView}
        onShowWelcome={() => setWelcomeOpen(true)}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />

      <main
        className={[
          "workspace",
          !(leftDocked && preferences.leftOpen) && "workspace--no-left",
          !(rightDocked && preferences.rightOpen) && "workspace--no-right",
        ]
          .filter(Boolean)
          .join(" ")}
        style={gridStyle}
      >
        {leftDocked && (
          <aside className="sidebar sidebar--left" aria-label="Scene" hidden={!preferences.leftOpen}>
            <SceneSidebar onImport={openFilePicker} />
            <ResizeHandle
              side="left"
              width={widths.left}
              label="Resize scene panel"
              onResize={(width) => updatePreferences({ leftWidth: width })}
            />
          </aside>
        )}

        <Viewport
          canvasRef={canvasRef}
          stats={stats}
          loading={!firstFrame}
          showStats={preferences.showStats}
          onToggleStats={() => updatePreferences({ showStats: !preferences.showStats })}
        />

        {rightDocked && (
          <aside className="sidebar sidebar--right" aria-label="Look Studio" hidden={!preferences.rightOpen}>
            <LookStudio />
            <ResizeHandle
              side="right"
              width={widths.right}
              label="Resize Look Studio"
              onResize={(width) => updatePreferences({ rightWidth: width })}
            />
          </aside>
        )}

        {drawer && !isDocked(drawer, mode) && (
          <>
            <div className="drawer-scrim" onClick={() => setDrawer(null)} aria-hidden="true" />
            <aside
              className={`sidebar drawer drawer--${drawer}`}
              aria-label={drawer === "left" ? "Scene" : "Look Studio"}
            >
              {drawer === "left" ? <SceneSidebar onImport={openFilePicker} /> : <LookStudio />}
            </aside>
          </>
        )}

        {draggingFiles && (
          <div className="drop-overlay" aria-live="polite">
            <div className="drop-overlay__card">
              <Icon name="import" size={22} />
              <p className="drop-overlay__title">Drop 3D model to import</p>
              <p className="drop-overlay__sub">
                Supports <strong>.glb</strong> and <strong>.gltf</strong> (include companion <code>.bin</code> and texture files)
              </p>
            </div>
          </div>
        )}

        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button type="button" className="notice__dismiss" onClick={onDismissNotice}>
              Got it
            </button>
          </div>
        )}
      </main>

      <WelcomeDialog
        open={welcomeOpen}
        onClose={closeWelcome}
        onShowShortcuts={() => {
          closeWelcome();
          setShortcutsOpen(true);
        }}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
