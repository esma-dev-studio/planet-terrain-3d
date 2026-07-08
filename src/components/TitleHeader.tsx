import { DATA_CREDIT, TERRAIN_META } from "../data/landmarks";

/** 画面上部のタイトルヘッダー */
export function TitleHeader() {
  return (
    <header className="app-header">
      <div className="app-title">
        <div className="eyebrow">LANDING ON REAL TOPOGRAPHY</div>
        <h1>
          MOON & MARS <span className="thin">TERRAIN 3D</span>
        </h1>
        <div className="sub">
          月・火星の地形ツアー — NASAの実標高データで名所に降りていく(起伏は強調表示)
        </div>
      </div>
      <div className="header-meta">
        <div>
          DEM <span className="em">LRO LOLA / MGS MOLA</span>
        </div>
        <div>
          {DATA_CREDIT}({TERRAIN_META.generatedAt}取得)
        </div>
      </div>
    </header>
  );
}
