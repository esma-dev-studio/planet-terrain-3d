import { useCallback, useEffect, useState } from "react";
import { BottomBar } from "./components/BottomBar";
import { ControlPanel } from "./components/ControlPanel";
import { PointPopup } from "./components/PointPopup";
import { RoverOverlay } from "./components/RoverOverlay";
import { TitleHeader } from "./components/TitleHeader";
import { BODY_INFO } from "./data/landmarks";
import { useTerrainScene } from "./hooks/useTerrainScene";
import type { BodyId, Landmark, PointSelection, RoverSite } from "./types/terrain";

export default function App() {
  const [body, setBody] = useState<BodyId>("moon");
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(null);
  const [exaggeration, setExaggeration] = useState(
    BODY_INFO.moon.defaultExaggeration
  );
  const [sunAzimuth, setSunAzimuth] = useState(40);
  const [grid, setGrid] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [selection, setSelection] = useState<PointSelection | null>(null);
  const [roverSite, setRoverSite] = useState<RoverSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);

  const onPointClick = useCallback((s: PointSelection | null) => setSelection(s), []);
  const onLoading = useCallback((v: boolean) => setLoading(v), []);
  const { containerRef, sceneRef } = useTerrainScene(onPointClick, onLoading);

  useEffect(() => {
    void sceneRef.current?.showBody(body);
    setSelectedLandmarkId(null);
    setSelection(null);
    // 天体ごとに自然に見える既定倍率へ(月は起伏が小さいので控えめ)
    setExaggeration(BODY_INFO[body].defaultExaggeration);
  }, [body, sceneRef]);

  useEffect(() => {
    sceneRef.current?.setExaggeration(exaggeration);
  }, [exaggeration, sceneRef]);

  useEffect(() => {
    sceneRef.current?.setSunAzimuth(sunAzimuth);
  }, [sunAzimuth, sceneRef]);

  useEffect(() => {
    sceneRef.current?.setGrid(grid);
  }, [grid, sceneRef]);

  useEffect(() => {
    sceneRef.current?.setAutoRotate(autoRotate);
  }, [autoRotate, sceneRef]);

  const exitRover = useCallback(() => {
    sceneRef.current?.exitRover();
    setRoverSite(null);
  }, [sceneRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (roverSite) exitRover();
      else setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roverSite, exitRover]);

  const flyTo = (l: Landmark) => {
    setSelectedLandmarkId(l.id);
    setSelection(null);
    sceneRef.current?.flyToLandmark(l);
  };

  const enterRover = (site: RoverSite) => {
    setSelection(null);
    setBody(site.bodyId);
    setRoverSite(site);
    void sceneRef.current?.enterRover(site);
  };

  return (
    <>
      <div className="canvas-root" ref={containerRef} />
      <div className="vignette" />

      <TitleHeader />

      {!roverSite && (
        <button className="panel-toggle" onClick={() => setPanelOpen((v) => !v)}>
          {panelOpen ? "PANEL ◂" : "PANEL ▸"}
        </button>
      )}

      {!roverSite && panelOpen && (
        <ControlPanel
          body={body}
          onBody={setBody}
          selectedLandmarkId={selectedLandmarkId}
          onLandmark={flyTo}
          exaggeration={exaggeration}
          onExaggeration={setExaggeration}
          sunAzimuth={sunAzimuth}
          onSunAzimuth={setSunAzimuth}
          grid={grid}
          onGrid={setGrid}
          autoRotate={autoRotate}
          onAutoRotate={setAutoRotate}
          onRoverSite={enterRover}
        />
      )}

      {!roverSite && (
        <BottomBar
          body={body}
          selectedLandmarkId={selectedLandmarkId}
          onReset={() => {
            setSelectedLandmarkId(null);
            sceneRef.current?.resetView();
          }}
        />
      )}

      {roverSite && (
        <RoverOverlay site={roverSite} sceneRef={sceneRef} onExit={exitRover} />
      )}

      {!roverSite && selection && (
        <PointPopup selection={selection} onClose={() => setSelection(null)} />
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-text">地形データ読み込み中…</div>
        </div>
      )}
    </>
  );
}
