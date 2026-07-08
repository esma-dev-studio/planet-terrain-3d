/**
 * 月・火星の標高/カラーデータの取得と変換。
 *
 * 使い方: node scripts/fetch-data.mjs
 *
 * ソース(いずれもNASA/USGSのパブリックドメイン):
 * - 月 標高: NASA SVS "CGI Moon Kit"(LRO LOLA 由来の変位マップ)
 * - 月 カラー: 同上(LROC WAC モザイク)
 * - 火星 標高: NASA Mars Trek タイル(MGS MOLA DEM 8bit)を張り合わせ
 * - 火星 カラー: NASA Mars Trek タイル(Viking MDIM2.1 カラーモザイク)
 *
 * 出力:
 * - public/data/{moon,mars}_color.jpg      (2048x1024)
 * - public/data/{moon,mars}_height.png     (2048x1024, 16bitをRGチャンネルに格納)
 * - src/data/generated/terrainMeta.json    (標高レンジ・半径・クレジット)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPub = join(root, "public", "data");
const outMeta = join(root, "src", "data", "generated");
mkdirSync(outPub, { recursive: true });
mkdirSync(outMeta, { recursive: true });

const W = 2048;
const H = 1024;
const UA = { "User-Agent": "planet-terrain-3d (educational visualization)" };

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function tryCandidates(urls) {
  for (const url of urls) {
    try {
      process.stdout.write(`  try ${url} ... `);
      const buf = await fetchBuffer(url);
      console.log(`OK (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
      return { buf, url };
    } catch (e) {
      console.log(`NG (${e.message})`);
    }
  }
  return null;
}

/** NASA Trek の WMTS タイルを z レベルで全取得して1枚に合成する */
async function stitchTrek(body, layer, z, ext) {
  const rows = 2 ** z;
  const cols = 2 ** (z + 1);
  const tile = 256;
  console.log(`  trek stitch ${body}/${layer} z=${z} (${cols}x${rows} tiles)`);
  const composites = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const url = `https://trek.nasa.gov/tiles/${body}/EQ/${layer}/1.0.0/default/default028mm/${z}/${r}/${c}.${ext}`;
      const buf = await fetchBuffer(url);
      composites.push({ input: buf, left: c * tile, top: r * tile });
    }
    process.stdout.write(`    row ${r + 1}/${rows} done\r\n`);
  }
  return sharp({
    create: {
      width: cols * tile,
      height: rows * tile,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/** カラー画像 → 2048x1024 JPEG */
async function writeColor(buf, outName) {
  await sharp(buf)
    .resize(W, H, { fit: "fill", kernel: "lanczos3" })
    .jpeg({ quality: 85 })
    .toFile(join(outPub, outName));
  console.log(`  -> ${outName}`);
}

/**
 * 高さ画像 → 16bit(RGチャンネル)PNG。
 * - 16bit TIFF: 色空間変換を通すと値が潰れるため、生サンプルを直接読み、
 *   自前で面平均ダウンサンプル→実測min/maxで0..65535に正規化する
 * - 8bit入力: sharpのリサイズ補間で滑らかにしてから16bit化(terracing軽減)
 */
async function writeHeight(buf, outName) {
  const meta = await sharp(buf).metadata();
  const is16 = meta.depth === "ushort";
  const norm = new Float32Array(W * H); // 0..1

  if (is16) {
    // 生サンプル(色処理なし)
    const raw = await sharp(buf).raw({ depth: "ushort" }).toBuffer();
    const ch = meta.channels ?? 1;
    const src = new Uint16Array(raw.buffer, raw.byteOffset, meta.width * meta.height * ch);
    let vMin = 65535;
    let vMax = 0;
    for (let i = 0; i < meta.width * meta.height; i++) {
      const v = src[i * ch];
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    console.log(`  16bit raw range: ${vMin}..${vMax}`);
    // 面平均ダウンサンプル
    const rx = meta.width / W;
    const ry = meta.height / H;
    for (let y = 0; y < H; y++) {
      const sy0 = Math.floor(y * ry);
      const sy1 = Math.min(meta.height, Math.max(sy0 + 1, Math.floor((y + 1) * ry)));
      for (let x = 0; x < W; x++) {
        const sx0 = Math.floor(x * rx);
        const sx1 = Math.min(meta.width, Math.max(sx0 + 1, Math.floor((x + 1) * rx)));
        let sum = 0;
        let n = 0;
        for (let sy = sy0; sy < sy1; sy++) {
          for (let sx = sx0; sx < sx1; sx++) {
            sum += src[(sy * meta.width + sx) * ch];
            n++;
          }
        }
        norm[y * W + x] = (sum / n - vMin) / (vMax - vMin);
      }
    }
  } else {
    const raw = await sharp(buf)
      .greyscale()
      .resize(W, H, { fit: "fill", kernel: "lanczos3" })
      .blur(0.4)
      .raw()
      .toBuffer();
    for (let i = 0; i < W * H; i++) norm[i] = raw[i] / 255;
  }

  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const v = Math.round(Math.min(Math.max(norm[i], 0), 1) * 65535);
    rgb[i * 3] = v >> 8;
    rgb[i * 3 + 1] = v & 0xff;
  }
  await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(join(outPub, outName));
  console.log(`  -> ${outName} (source depth: ${meta.depth}, ${meta.width}x${meta.height})`);
}

// ============================== 月 ==============================
console.log("MOON color:");
const SVS = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/";
const moonColor = await tryCandidates([
  `${SVS}lroc_color_poles_2k.tif`,
  `${SVS}lroc_color_poles_4k.tif`,
  `${SVS}lroc_color_poles_1k.jpg`,
]);
if (!moonColor) throw new Error("moon color not found");
await writeColor(moonColor.buf, "moon_color.jpg");

console.log("MOON height:");
// 第一候補: Trekタイル(火星と同じ8bit DEM系列)/ 予備: SVSの定番8bit変位マップ
let moonHeightBuf = null;
let moonHeightSrc = "";
for (const [layer, ext] of [
  ["LRO_LOLA_DEM_Global_256ppd_v06_8bit", "png"],
  ["LRO_LOLA_DEM_Global_256ppd_v06_8bit", "jpg"],
]) {
  try {
    moonHeightBuf = await stitchTrek("Moon", layer, 2, ext);
    moonHeightSrc = `NASA Moon Trek: ${layer}`;
    break;
  } catch (e) {
    console.log(`  layer NG: ${layer}.${ext} (${e.message})`);
  }
}
if (!moonHeightBuf) {
  const fallback = await tryCandidates([`${SVS}ldem_3_8bit.jpg`]);
  if (!fallback) throw new Error("moon height not found");
  moonHeightBuf = fallback.buf;
  moonHeightSrc = `NASA SVS CGI Moon Kit (LRO LOLA): ${fallback.url}`;
}
await writeHeight(moonHeightBuf, "moon_height.png");

// ============================== 火星 ==============================
console.log("MARS color:");
let marsColorBuf = null;
let marsColorSrc = "";
for (const layer of [
  "Mars_Viking_MDIM21_ClrMosaic_global_232m",
  "Mars_MGS_MOLA-MEX_HRSC_blend_clr_shade_merge",
]) {
  try {
    marsColorBuf = await stitchTrek("Mars", layer, 2, "jpg");
    marsColorSrc = `NASA Mars Trek: ${layer}`;
    break;
  } catch (e) {
    console.log(`  layer NG: ${layer} (${e.message})`);
  }
}
if (!marsColorBuf) throw new Error("mars color not found");
await writeColor(marsColorBuf, "mars_color.jpg");

console.log("MARS height:");
let marsHeightBuf = null;
let marsHeightSrc = "";
for (const [layer, ext] of [
  ["Mars_MGS_MOLA_DEM_mosaic_global_463m_8", "jpg"],
  ["Mars_MGS_MOLA_DEM_mosaic_global_463m_8", "png"],
  ["Mars_MGS_MOLA_DEM_mosaic_global_463m", "jpg"],
]) {
  try {
    marsHeightBuf = await stitchTrek("Mars", layer, 2, ext);
    marsHeightSrc = `NASA Mars Trek: ${layer}`;
    break;
  } catch (e) {
    console.log(`  layer NG: ${layer}.${ext} (${e.message})`);
  }
}
if (!marsHeightBuf) throw new Error("mars height not found");
await writeHeight(marsHeightBuf, "mars_height.png");

// ============================== メタ情報 ==============================
const metaOut = {
  generatedAt: new Date().toISOString().slice(0, 10),
  size: { width: W, height: H },
  moon: {
    radiusKm: 1737.4,
    // LOLA LDEM の公称レンジ(8/16bit版はこの範囲に正規化されている)
    heightMinKm: -9.129,
    heightMaxKm: 10.78,
    colorSource: `NASA SVS CGI Moon Kit (LROC WAC): ${moonColor.url}`,
    heightSource: moonHeightSrc,
  },
  mars: {
    radiusKm: 3389.5,
    // MGS MOLA の公称レンジ
    heightMinKm: -8.201,
    heightMaxKm: 21.241,
    colorSource: marsColorSrc,
    heightSource: marsHeightSrc,
  },
  credit: "地形・画像: NASA / USGS (LRO LOLA, LROC, MGS MOLA, Viking) — Public Domain",
};
writeFileSync(join(outMeta, "terrainMeta.json"), JSON.stringify(metaOut, null, 2));
console.log("meta written. done");
