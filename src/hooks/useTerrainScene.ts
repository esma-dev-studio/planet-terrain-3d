import { useEffect, useRef } from "react";
import { TerrainScene } from "../scenes/TerrainScene";
import type { PointSelection } from "../types/terrain";

/** TerrainScene のライフサイクルを React に接続するフック */
export function useTerrainScene(
  onPointClick: (s: PointSelection | null) => void,
  onLoading: (loading: boolean) => void
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TerrainScene | null>(null);
  const clickRef = useRef(onPointClick);
  const loadingRef = useRef(onLoading);
  clickRef.current = onPointClick;
  loadingRef.current = onLoading;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = new TerrainScene(container, {
      onPointClick: (s) => clickRef.current(s),
      onLoading: (v) => loadingRef.current(v),
    });
    sceneRef.current = scene;
    // 初期表示の showBody は App 側の body エフェクトが行う(二重呼び出し防止)
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  return { containerRef, sceneRef };
}
