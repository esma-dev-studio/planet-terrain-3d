# Moon & Mars Terrain 3D — 月・火星の地形ツアー

NASAの実標高データ(月: LRO **LOLA** / 火星: MGS **MOLA**)で月と火星の全球地形を3D化し、
ティコ・クレーターやオリンポス山などの**名所へワンクリックで降りていく**Webアプリ。宇宙シリーズの「着陸編」。

- **公開ページ**: https://esma-dev-studio.github.io/planet-terrain-3d/
- リポジトリ: https://github.com/esma-dev-studio/planet-terrain-3d

## 起動方法

```bash
npm install
npm run dev
```

表示されたURL(既定: http://localhost:5189)をブラウザで開く。
本番ビルド: `npm run build` → `dist/`。

## 機能

| 機能 | 内容 |
| --- | --- |
| 月⇔火星切替 | 全球地形をGPU変位シェーダで立体表示(頂点約30万+ピクセル単位の陰影法線) |
| 名所ツアー | 月6箇所・火星7箇所(アポロ11着陸地、オリンポス山、マリネリス峡谷、ジェゼロ等)へ飛行 |
| 起伏の強調 | ×1(実寸)〜×40。uniform制御なのでスライダーが即時反映 |
| 太陽の方向 | ライティング方位を回すとクレーターの影が動く |
| 地表クリック | その地点の緯度経度と**実標高**(LOLA/MOLA計測値)を表示 |
| その他 | 経緯線(30°)、ゆっくり自転、全体表示リセット |

## データ・素材(すべてPublic Domain)

- 月 標高: NASA SVS [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720)(LRO LOLA)
- 月 カラー: 同上(LROC WACモザイク)
- 火星 標高: NASA [Mars Trek](https://trek.nasa.gov/) タイル(MGS MOLA DEM)
- 火星 カラー: 同上(Viking MDIM2.1カラーモザイク)

### データの再生成

```bash
node scripts/fetch-data.mjs
```

取得元から2048x1024に変換し、高さは16bit値をPNGのRGチャンネルへ格納する
(GPUシェーダとCPU側の標高参照が同じPNGを共有する)。

## 検証メモ(データの正しさ)

CPU標高グリッドの実測値が既知の地形と一致することを確認済み:

- 月の最高点(5.4°N, 158.6°W)→ **+10.0km**(公称+10.8km)
- 危難の海 → −3.7km / 南極エイトケン盆地内 → −7.6km
- オリンポス山 → **+20.0km**(公称+21.2km)/ ヘラス盆地 → −6.1km

## 技術メモ

- 高さテクスチャを頂点シェーダで読み球面法線方向に変位。強調倍率はuniform
- 陰影は高さ勾配から法線を作るピクセル単位ライティング
  (頂点密度よりテクスチャが高解像度なため、細部はシェーディングとして現れる)
- カメラのめり込み防止は「ターゲットの位置(中心⇔地表)」に応じた動的クランプ

Vite / React 18 / TypeScript / Three.js
