import { useEffect, useRef, useState } from "react";
import { RenderStage, type StageStats } from "./render/stage";
import { createDemoScene } from "./scenes/demo";

/**
 * Stage 0 shell. The workspace layout, panels and Look gallery arrive in
 * Stage 1; what is here is the viewport and the renderer behind it.
 */
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stats, setStats] = useState<StageStats | null>(null);
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
      setFailure(
        error instanceof Error && error.message
          ? error.message
          : "This browser could not start WebGL2.",
      );
      return;
    }

    const demo = createDemoScene();
    stage.scene.add(demo.root);
    stage.frameAll(demo.root);

    if (!stage.capabilities.highPrecision) {
      setNotice(
        "This GPU cannot render to high-precision buffers, so Game Look Lab is using a lower-quality pipeline. Glow and colour grading will band more than usual.",
      );
    }

    const stopStats = stage.onStats(setStats);

    return () => {
      stopStats();
      stage.dispose();
    };
  }, []);

  if (failure) {
    return (
      <div className="failure">
        <div className="failure__card">
          <h2>Game Look Lab needs WebGL2</h2>
          <p>{failure}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__mark" aria-hidden="true">
          G
        </span>
        <h1 className="topbar__title">Game Look Lab</h1>
        <span className="topbar__tagline">Find your game&rsquo;s visual identity.</span>
        <span className="topbar__spacer" />
        <span className="topbar__stage">Stage 0 · renderer foundation</span>
      </header>

      <main className="workspace">
        <div className="viewport">
          <canvas ref={canvasRef} className="viewport__canvas" />
          <p className="viewport__hint">Drag to orbit · scroll to zoom · right-drag to pan</p>
          {stats && (
            <div className="viewport__stats" aria-hidden="true">
              <span>{stats.frameMs.toFixed(1)} ms</span>
              <span>{stats.triangles.toLocaleString()} tris</span>
              <span>{stats.drawCalls} draws</span>
            </div>
          )}
        </div>
        {notice && <div className="notice" role="status">{notice}</div>}
      </main>
    </div>
  );
}
