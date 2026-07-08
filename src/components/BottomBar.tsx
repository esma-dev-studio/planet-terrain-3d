import { BODY_INFO, LANDMARKS } from "../data/landmarks";
import type { BodyId } from "../types/terrain";

/** 下部バー(現在地と説明・全体表示) */
export function BottomBar(props: {
  body: BodyId;
  selectedLandmarkId: string | null;
  onReset(): void;
}) {
  const landmark = LANDMARKS[props.body].find((l) => l.id === props.selectedLandmarkId);
  return (
    <div className="status-bar ui-card">
      <div className="item">
        <span>天体</span>
        <span className="value accent">{BODY_INFO[props.body].name}</span>
      </div>
      <div className="sep" />
      {landmark ? (
        <div className="item desc-item">
          <span className="value">{landmark.name}</span>
          <span className="desc">{landmark.desc}</span>
        </div>
      ) : (
        <span className="hint">左のツアーリストから見どころへ降りられます</span>
      )}
      <div className="sep" />
      <button className="view-btn" onClick={props.onReset}>
        全体表示
      </button>
    </div>
  );
}
