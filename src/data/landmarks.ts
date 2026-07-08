import type { BodyId, Landmark } from "../types/terrain";
import terrainMeta from "./generated/terrainMeta.json";

/** 天体ごとの基本情報と見どころ(ツアー先) */

export const TERRAIN_META = terrainMeta as {
  generatedAt: string;
  size: { width: number; height: number };
  moon: BodyMeta;
  mars: BodyMeta;
  credit: string;
};

interface BodyMeta {
  radiusKm: number;
  heightMinKm: number;
  heightMaxKm: number;
  colorSource: string;
  heightSource: string;
}

export const BODY_INFO: Record<
  BodyId,
  { name: string; nameEn: string; accent: string; sub: string }
> = {
  moon: {
    name: "月",
    nameEn: "THE MOON",
    accent: "#cfd8e8",
    sub: "半径1,737km / 標高データ: LRO LOLA",
  },
  mars: {
    name: "火星",
    nameEn: "MARS",
    accent: "#ff8a5a",
    sub: "半径3,390km / 標高データ: MGS MOLA",
  },
};

export const LANDMARKS: Record<BodyId, Landmark[]> = {
  moon: [
    {
      id: "tycho",
      name: "ティコ・クレーター",
      nameEn: "TYCHO",
      lat: -43.31,
      lon: -11.36,
      viewAltKm: 320,
      desc: "直径85km。約1億年前にできた若いクレーターで、光条が月全体に伸びる。",
    },
    {
      id: "copernicus",
      name: "コペルニクス・クレーター",
      nameEn: "COPERNICUS",
      lat: 9.62,
      lon: -20.08,
      viewAltKm: 300,
      desc: "直径93km・深さ3.8km。中央丘と段丘状の壁を持つ典型的な複合クレーター。",
    },
    {
      id: "tranquility",
      name: "静かの海(アポロ11号)",
      nameEn: "SEA OF TRANQUILITY",
      lat: 0.67,
      lon: 23.47,
      viewAltKm: 420,
      desc: "1969年7月、人類が初めて降り立った場所。暗く平らな溶岩平原。",
    },
    {
      id: "imbrium",
      name: "雨の海",
      nameEn: "MARE IMBRIUM",
      lat: 32.8,
      lon: -15.6,
      viewAltKm: 900,
      desc: "直径約1,100kmの巨大衝突盆地を溶岩が満たしたもの。縁にアルプス山脈。",
    },
    {
      id: "spa",
      name: "南極エイトケン盆地",
      nameEn: "SOUTH POLE-AITKEN",
      lat: -53,
      lon: -169,
      viewAltKm: 1100,
      desc: "月の裏側にある太陽系最大級の衝突盆地。直径約2,500km・深さ約13km。",
    },
    {
      id: "orientale",
      name: "東の海",
      nameEn: "MARE ORIENTALE",
      lat: -19.4,
      lon: -92.8,
      viewAltKm: 800,
      desc: "三重のリング構造が美しい直径900kmの衝突盆地。縁からしか見えない。",
    },
  ],
  mars: [
    {
      id: "olympus",
      name: "オリンポス山",
      nameEn: "OLYMPUS MONS",
      lat: 18.65,
      lon: -133.8,
      viewAltKm: 700,
      desc: "高さ約22km・裾野600km。エベレストの2.5倍、太陽系最大の火山。",
    },
    {
      id: "marineris",
      name: "マリネリス峡谷",
      nameEn: "VALLES MARINERIS",
      lat: -11.5,
      lon: -70,
      viewAltKm: 850,
      desc: "全長4,000km・深さ最大7km。アメリカ大陸を横断する長さの大峡谷。",
    },
    {
      id: "tharsis",
      name: "タルシス三山",
      nameEn: "THARSIS MONTES",
      lat: 1.5,
      lon: -112.6,
      viewAltKm: 900,
      desc: "一直線に並ぶ3つの巨大な楯状火山。それぞれ高さ14〜18km。",
    },
    {
      id: "hellas",
      name: "ヘラス盆地",
      nameEn: "HELLAS PLANITIA",
      lat: -42.4,
      lon: 70.5,
      viewAltKm: 1000,
      desc: "深さ7km・直径2,300kmの衝突盆地。火星の最低地点を含む。",
    },
    {
      id: "gale",
      name: "ゲール・クレーター",
      nameEn: "GALE CRATER",
      lat: -5.4,
      lon: 137.8,
      viewAltKm: 300,
      desc: "探査車キュリオシティが2012年から探査中。中央にシャープ山(高さ5km)。",
    },
    {
      id: "jezero",
      name: "ジェゼロ・クレーター",
      nameEn: "JEZERO CRATER",
      lat: 18.44,
      lon: 77.45,
      viewAltKm: 260,
      desc: "パーサヴィアランスが2021年に着陸。古代の湖と川の三角州の跡が残る。",
    },
    {
      id: "northpole",
      name: "北極冠",
      nameEn: "PLANUM BOREUM",
      lat: 84,
      lon: 0,
      viewAltKm: 900,
      desc: "水の氷とドライアイスでできた極冠。渦巻き状の谷が刻まれている。",
    },
  ],
};

export const DATA_CREDIT =
  "地形・画像: NASA/USGS(LRO LOLA・LROC・MGS MOLA・Viking)Public Domain";
