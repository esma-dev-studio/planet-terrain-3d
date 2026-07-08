import { useCallback, useEffect, useState } from "react";
import { BottomBar } from "./components/BottomBar";
import { ControlPanel } from "./components/ControlPanel";
import { PointPopup } from "./components/PointPopup";
import { TitleHeader } from "./components/TitleHeader";
import { useTerrainScene } from "./hooks/useTerrainScene";
import type { BodyId, Landmark, PointSelection } from "./types/terrain";

export default function App() {
  const [body, setBody] = useState<BodyId>("moon");
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(null);
  const [exaggeration, setExaggeration] = useState(15);
  const [sunAzimuth, setSunAzimuth] = useState(40);
  const [grid, setGrid] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [selection, setSelection] = useState<PointSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);

  const onPointClick = useCallback((s: PointSelection | null) => setSelection(s), []);
  const onLoading = useCallback((v: boolean) => setLoading(v), []);
  const { containerRef, sceneRef } = useTerrainScene(onPointClick, onLoading);

  useEffect(() => {
    void sceneRef.current?.showBody(body);
    setSelectedLandmarkId(null);
    setSelection(null);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const flyTo = (l: Landmark) => {
    setSelectedLandmarkId(l.id);
    setSelection(null);
    sceneRef.current?.flyToLandmark(l);
  };

  return (
    <>
      <div className="canvas-root" ref={containerRef} />
      <div className="vignette" />

      <TitleHeader />

      <button className="panel-toggle" onClick={() => setPanelOpen((v) => !v)}>
        {panelOpen ? "PANEL ◂" : "PANEL ▸"}
      </button>

      {panelOpen && (
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
        />
      )}

      <BottomBar
        body={body}
        selectedLandmarkId={selectedLandmarkId}
        onReset={() => {
          setSelectedLandmarkId(null);
          sceneRef.current?.resetView();
        }}
      />

      {selection && <PointPopup selection={selection} onClose={() => setSelection(null)} />}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-text">地形データ読み込み中…</div>
        </div>
      )}
    </>
  );
}
