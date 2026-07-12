import { useEffect, useMemo, useState } from "react";
import type { RoverControl } from "../scenes/RoverMode";
import type { TerrainScene } from "../scenes/TerrainScene";
import type { RoverSite } from "../types/terrain";

/** ローバーモード中の操作オーバーレイ(速度計・タッチパッドつき) */
export function RoverOverlay(props: {
  site: RoverSite;
  sceneRef: React.MutableRefObject<TerrainScene | null>;
  onExit(): void;
}) {
  const [speed, setSpeed] = useState(0);
  const [odo, setOdo] = useState(0);
  // タッチ端末(iPad等)ではパッドを表示。マウス端末はキーボード案内のみ
  const touchDevice = useMemo(
    () =>
      typeof window !== "undefined" &&
      (navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches),
    []
  );

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
          {touchDevice ? (
            <>画面のボタンで運転(キーボードも可)</>
          ) : (
            <>
              <kbd>W</kbd>
              <kbd>S</kbd> 前後 / <kbd>A</kbd>
              <kbd>D</kbd> 旋回(矢印キーも可)
            </>
          )}
        </span>
        <div className="sep" />
        <button className="view-btn" onClick={props.onExit}>
          軌道へ戻る{touchDevice ? "" : "(ESC)"}
        </button>
      </div>

      {touchDevice && (
        <>
          <div className="rover-pad rover-pad--left" aria-label="旋回">
            <PadButton sceneRef={props.sceneRef} control="left" label="↰" text="ひだり" />
            <PadButton sceneRef={props.sceneRef} control="right" label="↱" text="みぎ" />
          </div>
          <div className="rover-pad rover-pad--right" aria-label="前進・後退">
            <PadButton sceneRef={props.sceneRef} control="fwd" label="▲" text="すすむ" />
            <PadButton sceneRef={props.sceneRef} control="back" label="▼" text="バック" />
          </div>
        </>
      )}
    </>
  );
}

/** 押している間だけ入力が入る大型ボタン(指が外れても離した扱いになる) */
function PadButton(props: {
  sceneRef: React.MutableRefObject<TerrainScene | null>;
  control: RoverControl;
  label: string;
  text: string;
}) {
  const set = (active: boolean) => props.sceneRef.current?.setRoverInput(props.control, active);
  return (
    <button
      className="pad-btn"
      aria-label={props.text}
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // 合成イベント等でキャプチャできなくても入力は受け付ける
        }
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") set(true);
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") set(false);
      }}
    >
      <span className="pad-arrow" aria-hidden>
        {props.label}
      </span>
      <span className="pad-text" aria-hidden>
        {props.text}
      </span>
    </button>
  );
}
