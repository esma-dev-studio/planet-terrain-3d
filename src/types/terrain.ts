/** 地形ツアーの型定義 */

export type BodyId = "moon" | "mars";

export interface Landmark {
  id: string;
  name: string;
  nameEn: string;
  /** 緯度[deg] 北+ / 経度[deg] 東+ */
  lat: number;
  lon: number;
  /** 見学時のカメラ高度[km] */
  viewAltKm: number;
  /** 一言解説 */
  desc: string;
}

/** 地表クリック時の選択情報 */
export interface PointSelection {
  bodyId: BodyId;
  lat: number;
  lon: number;
  /** 実標高[km] */
  heightKm: number;
  screenX: number;
  screenY: number;
}
