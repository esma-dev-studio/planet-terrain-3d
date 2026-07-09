import { useEffect, useState } from "react";
import type { TerrainScene } from "../scenes/TerrainScene";
import type { RoverSite } from "../types/terrain";

/** ローバーモード中の操作オーバーレイ(速度計つき) */
export function RoverOverlay(props: {
  site: RoverSite;
  sceneRef: React.MutableRefObject<TerrainScene | null>;
  onExit(): void;
}) {
  const [speed, setSpeed] = useState(0);
  const [odo, setOdo] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const t = props.sceneRef.current?.getRoverTelemetry();
      if (t) {
        setSpeed(t.speedKmh);
        setOdo(t.odometerM);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [props.sceneRef]);

  return (
    <>
      <div className="rover-topbar ui-card">
        <span className="site-name">{props.site.name}</span>
        <span className="site-note">
          大きな地形は実データ / 岩・小クレーター・基地は演出です
        </span>
      </div>
      <div className="status-bar ui-card rover-bar">
        <div className="item">
          <span>速度</span>
          <span className="value accent">{speed.toFixed(1)} km/h</span>
        </div>
        <div className="sep" />
        <div className="item">
          <span>走行距離</span>
          <span className="value">
            {odo >= 1000 ? `${(odo / 1000).toFixed(2)} km` : `${Math.round(odo)} m`}
          </span>
        </div>
        <div className="sep" />
        <span className="rover-keys">
          <kbd>W</kbd>
          <kbd>S</kbd> 前後 / <kbd>A</kbd>
          <kbd>D</kbd> 旋回(矢印キーも可)
        </span>
        <div className="sep" />
        <button className="view-btn" onClick={props.onExit}>
          軌道へ戻る(ESC)
        </button>
      </div>
    </>
  );
}
