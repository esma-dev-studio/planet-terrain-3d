import { BODY_INFO, LANDMARKS } from "../data/landmarks";
import type { BodyId, Landmark } from "../types/terrain";

/** 左側の操作パネル */

export interface ControlPanelProps {
  body: BodyId;
  onBody(b: BodyId): void;
  selectedLandmarkId: string | null;
  onLandmark(l: Landmark): void;
  exaggeration: number;
  onExaggeration(v: number): void;
  sunAzimuth: number;
  onSunAzimuth(v: number): void;
  grid: boolean;
  onGrid(v: boolean): void;
  autoRotate: boolean;
  onAutoRotate(v: boolean): void;
}

export function ControlPanel(p: ControlPanelProps) {
  const landmarks = LANDMARKS[p.body];
  return (
    <div className="control-panel ui-card">
      <section>
        <div className="sec-title">
          BODY <span className="jp">天体</span>
        </div>
        <div className="segmented">
          {(Object.keys(BODY_INFO) as BodyId[]).map((id) => (
            <button
              key={id}
              className={p.body === id ? "active" : ""}
              onClick={() => p.onBody(id)}
            >
              {BODY_INFO[id].name}
            </button>
          ))}
        </div>
        <div className="panel-hint">{BODY_INFO[p.body].sub}</div>
      </section>

      <section>
        <div className="sec-title">
          TOUR <span className="jp">見どころへ降りる</span>
        </div>
        {landmarks.map((l) => (
          <button
            key={l.id}
            className={
              "landmark-row" + (p.selectedLandmarkId === l.id ? " active" : "")
            }
            onClick={() => p.onLandmark(l)}
          >
            <span className="name">{l.name}</span>
            <span className="meta">
              {l.lat.toFixed(0)}°, {l.lon.toFixed(0)}°
            </span>
          </button>
        ))}
      </section>

      <section>
        <div className="sec-title">
          RELIEF <span className="jp">起伏の強調</span>
        </div>
        <div className="slider-row">
          <span>強調倍率</span>
          <span className="value">×{p.exaggeration}</span>
        </div>
        <input
          type="range"
          min={1}
          max={40}
          step={1}
          value={p.exaggeration}
          onChange={(e) => p.onExaggeration(Number(e.target.value))}
        />
        <div className="slider-row" style={{ marginTop: 10 }}>
          <span>太陽の方向(影が動く)</span>
          <span className="value">{p.sunAzimuth}°</span>
        </div>
        <input
          type="range"
          min={0}
          max={360}
          step={5}
          value={p.sunAzimuth}
          onChange={(e) => p.onSunAzimuth(Number(e.target.value))}
        />
      </section>

      <section>
        <div className="sec-title">
          DISPLAY <span className="jp">表示</span>
        </div>
        <div className="line-row">
          <span className="name">経緯線(30°ごと)</span>
          <label className="switch">
            <input type="checkbox" checked={p.grid} onChange={() => p.onGrid(!p.grid)} />
            <span className="track" />
          </label>
        </div>
        <div className="line-row">
          <span className="name">ゆっくり自転</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={p.autoRotate}
              onChange={() => p.onAutoRotate(!p.autoRotate)}
            />
            <span className="track" />
          </label>
        </div>
      </section>

      <div className="panel-note">
        <div className="warn">
          標高は実データ(月:LOLA / 火星:MOLA)。起伏の高さは視認性のため強調表示です(×1が実寸)。
        </div>
        <div>ドラッグ: 回転 / ホイール: 拡大縮小</div>
        <div>地表クリック: その地点の緯度経度と実標高を表示</div>
      </div>
    </div>
  );
}
