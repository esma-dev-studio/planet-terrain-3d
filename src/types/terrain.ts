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

/** ローバー探索サイト */
export interface RoverSite {
  id: string;
  bodyId: BodyId;
  name: string;
  nameEn: string;
  lat: number;
  lon: number;
  desc: string;
  /** 月面基地(架空)を配置するか */
  hasBase?: boolean;
  /** 空に地球を表示するか(月の表側) */
  earthInSky?: boolean;
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
