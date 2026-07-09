import type { RoverSite } from "../types/terrain";

/**
 * ローバー探索サイト。
 * 地形の大きな起伏は実データ(LOLA)由来、走行スケールの小クレーターや岩、
 * 基地の建物は体験用の演出(架空)である点はUI上にも明記する。
 */
export const ROVER_SITES: RoverSite[] = [
  {
    id: "tranquility-base",
    bodyId: "moon",
    name: "静かの海・トランクィリティ基地",
    nameEn: "TRANQUILITY BASE",
    lat: 0.674,
    lon: 23.473,
    desc: "アポロ11号の着陸地点周辺。架空の月面基地を観光しながら走れる。空には本物の地球。",
    hasBase: true,
    earthInSky: true,
  },
  {
    id: "tycho-rim",
    bodyId: "moon",
    name: "ティコ・クレーター周辺",
    nameEn: "TYCHO",
    lat: -42.5,
    lon: -11.36,
    desc: "若いクレーターの外縁部。起伏の激しい斜面をオフロード走行できる。",
    earthInSky: true,
  },
];
