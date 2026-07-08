import { BODY_INFO } from "../data/landmarks";
import type { PointSelection } from "../types/terrain";

/** 地表クリック時のポップアップ(緯度経度と実標高) */

const POPUP_WIDTH = 250;

function fmtLat(lat: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
}
function fmtLon(lon: number): string {
  return `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}

export function PointPopup(props: { selection: PointSelection; onClose(): void }) {
  const s = props.selection;
  const left = Math.min(
    Math.max(s.screenX + 14, 8),
    window.innerWidth - POPUP_WIDTH - 8
  );
  const top = Math.min(Math.max(s.screenY - 20, 66), window.innerHeight - 190);

  return (
    <div className="station-popup ui-card" style={{ left, top, width: POPUP_WIDTH }}>
      <div className="popup-head">
        <h2>{BODY_INFO[s.bodyId].name}の地表</h2>
        <button className="close-btn" onClick={props.onClose} aria-label="閉じる">
          ✕
        </button>
      </div>
      <div className="spec-row">
        <span className="k">位置</span>
        <span className="v">
          {fmtLat(s.lat)} / {fmtLon(s.lon)}
        </span>
      </div>
      <div className="spec-row">
        <span className="k">標高(実データ)</span>
        <span className="v">
          {s.heightKm >= 0 ? "+" : "−"}
          {Math.abs(s.heightKm).toFixed(2)} km
        </span>
      </div>
      <p className="fact">基準面からの高さ。月はLOLA、火星はMOLAの計測値です。</p>
    </div>
  );
}
