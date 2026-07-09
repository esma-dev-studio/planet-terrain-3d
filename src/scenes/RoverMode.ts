import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { RoverSite } from "../types/terrain";

/**
 * 月面ローバー探索モード。
 * 軌道ビューとは独立した「メートル単位」のシーンを持ち、
 * 6km四方の地形パッチの上をキー操作でローバー走行する。
 *
 * 地形の考え方:
 * - 大きな起伏(数km規模の傾斜・うねり)は実データ(LOLA由来のグリッド)から補間
 * - 走行スケールの小クレーター・凹凸・岩は体験用の演出(座標シードで毎回同じ形)
 * - 基地の建物は架空。UI側にもその旨を明記する
 */

export interface RoverTelemetry {
  speedKmh: number;
  odometerM: number;
}

export interface RoverModeParams {
  site: RoverSite;
  /** 全球高さグリッド(実データ, km単位) */
  grid: Float32Array;
  gridW: number;
  gridH: number;
  radiusKm: number;
  sunAzimuthDeg: number;
  /** 地球テクスチャのURL(earthInSky時) */
  earthTextureUrl: string;
}

const PATCH_SIZE = 6000; // [m]
const PATCH_SEG = 400;
const MAX_SPEED = 7; // [m/s]
const REVERSE_SPEED = 3;
const TURN_RATE = 1.25; // [rad/s]

/** 文字列シードの決定的乱数(サイトごとに同じ地形になる) */
function mulberry32(seedStr: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** 2Dバリューノイズ(fbm用) */
function makeNoise2D(rand: () => number) {
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
  const grad = (h: number, x: number, y: number) =>
    ((h & 1) === 0 ? x : -x) + ((h & 2) === 0 ? y : -y);
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number): number => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    const x1 = THREE.MathUtils.lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = THREE.MathUtils.lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return THREE.MathUtils.lerp(x1, x2, v) * 0.7071;
  };
}

export class RoverMode {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly site: RoverSite;

  private params: RoverModeParams;
  private disposables: { dispose(): void }[] = [];
  private sun!: THREE.DirectionalLight;

  // ローバー状態
  private rover = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private posX = 0;
  private posZ = 0;
  private heading = 0;
  private speed = 0;
  private odometer = 0;
  private keys = new Set<string>();

  // 地形生成(演出ディテール)
  private noise: (x: number, y: number) => number;
  private craters: { x: number; z: number; r: number; depth: number }[] = [];
  private baseCenter: THREE.Vector3 | null = null;

  constructor(params: RoverModeParams) {
    this.params = params;
    this.site = params.site;

    const rand = mulberry32(params.site.id);
    this.noise = makeNoise2D(rand);
    // 小クレーター(演出): 半径8〜120m
    const n = 150;
    for (let i = 0; i < n; i++) {
      const r = 8 + Math.pow(rand(), 2.2) * 112;
      this.craters.push({
        x: (rand() - 0.5) * PATCH_SIZE * 0.94,
        z: (rand() - 0.5) * PATCH_SIZE * 0.94,
        r,
        depth: r * 0.18,
      });
    }
    if (params.site.hasBase) {
      this.baseCenter = new THREE.Vector3(90, 0, -70);
      this.baseCenter.y = this.rawHeightAt(this.baseCenter.x, this.baseCenter.z);
    }

    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 80000);
    this.scene.background = new THREE.Color(0x010208);
    // 地形パッチの縁を地平線の闇に溶かす
    this.scene.fog = new THREE.Fog(0x010208, 2400, 4800);

    this.buildLights();
    this.buildTerrain(rand);
    this.buildSky();
    this.buildRover();
    if (params.site.hasBase) this.buildBase();

    // 走行開始位置と向き
    this.heading = this.baseCenter ? Math.atan2(this.baseCenter.x, this.baseCenter.z) : 0;
    this.placeRover(0);
    this.camera.position.copy(this.rover.position).add(new THREE.Vector3(0, 4, -9));

    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
  }

  // ------------------------------------------------------------ 地形の高さ

  /** 実データ(全球グリッド)のバイリニア補間 [m] */
  private baseHeightAt(x: number, z: number): number {
    const mPerDegLat = ((this.params.radiusKm * 1000 * Math.PI) / 180);
    const lat = this.site.lat - z / mPerDegLat;
    const lon =
      this.site.lon +
      x / (mPerDegLat * Math.max(Math.cos((lat * Math.PI) / 180), 0.05));
    const { grid, gridW, gridH } = this.params;
    const u = ((((lon + 180) / 360) % 1) + 1) % 1;
    const v = Math.min(Math.max((90 - lat) / 180, 0), 0.9999);
    const fx = u * gridW - 0.5;
    const fy = v * gridH - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (ix: number, iy: number) => {
      const cx = ((ix % gridW) + gridW) % gridW;
      const cy = Math.min(Math.max(iy, 0), gridH - 1);
      return grid[cy * gridW + cx];
    };
    const km =
      at(x0, y0) * (1 - tx) * (1 - ty) +
      at(x0 + 1, y0) * tx * (1 - ty) +
      at(x0, y0 + 1) * (1 - tx) * ty +
      at(x0 + 1, y0 + 1) * tx * ty;
    return km * 1000;
  }

  /** 実データ+演出ディテールの高さ [m](基地の平地化を除く) */
  private rawHeightAt(x: number, z: number): number {
    let h = this.baseHeightAt(x, z);
    // うねり(演出): 2オクターブ
    h += this.noise(x / 260, z / 260) * 4.0;
    h += this.noise(x / 55 + 40, z / 55 - 17) * 1.1;
    // 小クレーター(すり鉢+縁の盛り上がり)
    for (const c of this.craters) {
      const dx = x - c.x;
      const dz = z - c.z;
      const d2 = dx * dx + dz * dz;
      const rimR = c.r * 1.35;
      if (d2 > rimR * rimR) continue;
      const d = Math.sqrt(d2);
      if (d < c.r) {
        const t = d / c.r;
        h -= c.depth * (Math.cos(t * Math.PI) + 1) * 0.5;
      }
      const rim = (d - c.r) / (rimR - c.r);
      if (d >= c.r) h += c.depth * 0.25 * (1 - Math.abs(rim * 2 - 1));
      else if (d > c.r * 0.8) h += c.depth * 0.25 * ((d - c.r * 0.8) / (c.r * 0.2)) * 0.5;
    }
    return h;
  }

  /** 表示・走行に使う最終的な高さ [m](基地周辺は平らに均す) */
  heightAt(x: number, z: number): number {
    let h = this.rawHeightAt(x, z);
    if (this.baseCenter) {
      const d = Math.hypot(x - this.baseCenter.x, z - this.baseCenter.z);
      const R = 110;
      if (d < R) {
        const t = THREE.MathUtils.smoothstep(d / R, 0, 1);
        h = THREE.MathUtils.lerp(this.baseCenter.y, h, t);
      }
    }
    return h;
  }

  // ------------------------------------------------------------ シーン構築

  private buildLights(): void {
    this.sun = new THREE.DirectionalLight(0xfff2df, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 160;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.near = 50;
    this.sun.shadow.camera.far = 2500;
    this.sun.shadow.bias = -0.002;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.applySun(this.params.sunAzimuthDeg);
    // 地球照を思わせる淡い青の環境光
    this.scene.add(new THREE.AmbientLight(0x8090b8, 0.42));
    // 逆光側の面が黒く潰れないよう、太陽の反対側から弱いフィルライト
    this.fill = new THREE.DirectionalLight(0xaab4d0, 0.35);
    this.scene.add(this.fill);
  }
  private fill!: THREE.DirectionalLight;

  applySun(azimuthDeg: number): void {
    const az = (azimuthDeg * Math.PI) / 180;
    const el = (17 * Math.PI) / 180; // 低い太陽=長い影
    this.sunDir.set(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      -Math.cos(az) * Math.cos(el)
    );
  }
  private sunDir = new THREE.Vector3(1, 0.3, 0);

  private buildTerrain(rand: () => number): void {
    const geo = new THREE.PlaneGeometry(PATCH_SIZE, PATCH_SIZE, PATCH_SEG, PATCH_SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.heightAt(x, z));
      // レゴリスの明度ムラ(演出)
      const v = 0.86 + this.noise(x / 31 + 99, z / 31 - 7) * 0.16;
      colors[i * 3] = v;
      colors[i * 3 + 1] = v;
      colors[i * 3 + 2] = v * 1.02;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // レゴリスの粒状感(近景ののっぺり防止)。キャンバスでノイズを生成してタイリング
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(256, 256);
    const nrand = mulberry32(this.site.id + "-tex");
    for (let i = 0; i < 256 * 256; i++) {
      const v = 195 + Math.floor(nrand() * 55) - (nrand() < 0.03 ? 55 : 0);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const detailTex = new THREE.CanvasTexture(cv);
    detailTex.wrapS = THREE.RepeatWrapping;
    detailTex.wrapT = THREE.RepeatWrapping;
    detailTex.repeat.set(110, 110);
    detailTex.anisotropy = 4;

    const mat = new THREE.MeshStandardMaterial({
      color: 0x8f8f97,
      roughness: 1,
      metalness: 0,
      vertexColors: true,
      map: detailTex,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.disposables.push(geo, mat);

    // 岩(演出): インスタンシングで散布
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7e7e86, roughness: 0.95 });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 260);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    for (let i = 0; i < 260; i++) {
      const x = (rand() - 0.5) * PATCH_SIZE * 0.9;
      const z = (rand() - 0.5) * PATCH_SIZE * 0.9;
      if (this.baseCenter && Math.hypot(x - this.baseCenter.x, z - this.baseCenter.z) < 130) {
        continue;
      }
      const s = 0.35 + Math.pow(rand(), 2) * 2.4;
      eu.set(rand() * 3.14, rand() * 6.28, rand() * 3.14);
      q.setFromEuler(eu);
      m.compose(
        new THREE.Vector3(x, this.heightAt(x, z) + s * 0.3, z),
        q,
        new THREE.Vector3(s, s * (0.7 + rand() * 0.5), s)
      );
      rocks.setMatrixAt(i, m);
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.scene.add(rocks);
    this.disposables.push(rockGeo, rockMat);
  }

  private buildSky(): void {
    // 星空
    const starPos = new Float32Array(1600 * 3);
    for (let i = 0; i < 1600; i++) {
      const r = 40000;
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      starPos.set([r * s * Math.cos(t), Math.abs(r * u) * 0.9 + 500, r * s * Math.sin(t)], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.scene.add(new THREE.Points(starGeo, starMat));
    this.disposables.push(starGeo, starMat);

    // 空に浮かぶ地球(月の表側サイトのみ)。方向は演出、満ち欠けは太陽と整合
    if (this.site.earthInSky) {
      const tex = new THREE.TextureLoader().load(this.params.earthTextureUrl);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
      const earth = new THREE.Mesh(new THREE.SphereGeometry(260, 48, 32), mat);
      const az = (125 * Math.PI) / 180;
      const el = (22 * Math.PI) / 180; // 追跡カメラの視界に自然に入る高さ
      earth.position.set(
        Math.sin(az) * Math.cos(el) * 15000,
        Math.sin(el) * 15000,
        -Math.cos(az) * Math.cos(el) * 15000
      );
      earth.rotation.y = 2.6; // 日本側を月に向ける
      this.scene.add(earth);
      this.disposables.push(mat);

      const wrapper = document.createElement("div");
      const el2 = document.createElement("div");
      el2.className = "sta-label";
      el2.textContent = "地球(38万km先)";
      wrapper.appendChild(el2);
      const label = new CSS2DObject(wrapper);
      label.position.copy(earth.position).multiplyScalar(1.03);
      this.scene.add(label);
    }
  }

  private buildRover(): void {
    const silver = new THREE.MeshStandardMaterial({
      color: 0xd7dbe2,
      metalness: 0.55,
      roughness: 0.45,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c313c, roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xc9a22f,
      metalness: 0.8,
      roughness: 0.35,
    });
    this.disposables.push(silver, dark, gold);

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 2.1), gold);
    body.position.y = 0.72;
    body.castShadow = true;
    this.rover.add(body);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 1.7), silver);
    deck.position.y = 0.99;
    deck.castShadow = true;
    this.rover.add(deck);

    // マスト+カメラヘッド
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.85, 8), silver);
    mast.position.set(0.3, 1.45, 0.75);
    mast.castShadow = true;
    this.rover.add(mast);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.14), dark);
    head.position.set(0.3, 1.9, 0.75);
    head.castShadow = true;
    this.rover.add(head);

    // アンテナ皿
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.12, 16, 1, true), silver);
    dish.position.set(-0.45, 1.35, -0.6);
    dish.rotation.x = -1.1;
    this.rover.add(dish);

    // 車輪 6輪
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const zi of [-0.8, 0, 0.8]) {
      for (const xi of [-0.78, 0.78]) {
        const w = new THREE.Mesh(wheelGeo, dark);
        w.position.set(xi, 0.34, zi);
        w.castShadow = true;
        this.rover.add(w);
        this.wheels.push(w);
      }
    }
    this.disposables.push(wheelGeo);

    this.rover.traverse((o) => (o.receiveShadow = true));
    this.scene.add(this.rover);
  }

  /** 架空の月面基地(観光対象) */
  private buildBase(): void {
    if (!this.baseCenter) return;
    const g = new THREE.Group();
    g.position.copy(this.baseCenter);

    const white = new THREE.MeshStandardMaterial({ color: 0xe3e7ec, roughness: 0.55 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x9fc4e8,
      roughness: 0.15,
      metalness: 0.2,
      transparent: true,
      opacity: 0.55,
    });
    const panel = new THREE.MeshStandardMaterial({
      color: 0x18306e,
      metalness: 0.7,
      roughness: 0.3,
    });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xc9a22f,
      metalness: 0.85,
      roughness: 0.35,
    });
    this.disposables.push(white, glass, panel, gold);

    const addLabel = (text: string, x: number, y: number, z: number, major = false) => {
      const wrapper = document.createElement("div");
      const el = document.createElement("div");
      el.className = "sta-label" + (major ? " sta-label--major" : "");
      el.textContent = text;
      wrapper.appendChild(el);
      const obj = new CSS2DObject(wrapper);
      obj.position.set(x, y, z);
      g.add(obj);
    };

    // 居住モジュール×2(横倒しカプセル)+連絡チューブ
    const habGeo = new THREE.CapsuleGeometry(3.2, 10, 8, 20);
    habGeo.rotateZ(Math.PI / 2);
    for (const [x, z, name] of [
      [-14, 0, "居住モジュールA"],
      [-14, 14, "居住モジュールB"],
    ] as const) {
      const hab = new THREE.Mesh(habGeo, white);
      hab.position.set(x, 3.2, z);
      hab.castShadow = true;
      hab.receiveShadow = true;
      g.add(hab);
      addLabel(name, x, 8.5, z);
    }
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 14, 12), white);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(-14, 1.8, 7);
    tube.castShadow = true;
    g.add(tube);

    // 司令ドーム
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      glass
    );
    dome.position.set(2, 0.1, 8);
    dome.castShadow = true;
    g.add(dome);
    addLabel("司令ドーム", 2, 7, 8);

    // 太陽電池アレイ
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(7, 0.15, 3.2), panel);
      p.position.set(16 + i * 4.4, 2.6, -8);
      p.rotation.z = -0.5;
      p.castShadow = true;
      g.add(p);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.6, 8), white);
      pole.position.set(16 + i * 4.4, 1.3, -8);
      g.add(pole);
    }
    addLabel("太陽電池アレイ", 22, 6.5, -8);

    // 通信アンテナ
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 12, 10), white);
    mast.position.set(12, 6, 14);
    mast.castShadow = true;
    g.add(mast);
    const dish = new THREE.Mesh(new THREE.ConeGeometry(3, 1.4, 24, 1, true), white);
    dish.position.set(12, 12.5, 14);
    dish.rotation.x = -0.9;
    dish.castShadow = true;
    g.add(dish);
    addLabel("通信アンテナ", 12, 15, 14);

    // 貯蔵タンク
    const tankGeo = new THREE.CapsuleGeometry(1.5, 4, 6, 14);
    tankGeo.rotateZ(Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(tankGeo, white);
      t.position.set(-2 + i * 4.6, 1.5, -14);
      t.castShadow = true;
      g.add(t);
    }
    addLabel("貯蔵タンク", 2.6, 5, -14);

    // アポロ11号 着陸船モニュメント(簡略形)
    const lm = new THREE.Group();
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 1.6, 8), gold);
    stage.position.y = 1.6;
    stage.castShadow = true;
    lm.add(stage);
    const ascent = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 10), white);
    ascent.position.y = 3.1;
    ascent.castShadow = true;
    lm.add(ascent);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6), gold);
      leg.position.set(Math.cos(a) * 2.6, 1.2, Math.sin(a) * 2.6);
      leg.rotation.z = Math.cos(a) * 0.6;
      leg.rotation.x = -Math.sin(a) * 0.6;
      leg.castShadow = true;
      lm.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 10), gold);
      foot.position.set(Math.cos(a) * 3.6, 0.1, Math.sin(a) * 3.6);
      lm.add(foot);
    }
    lm.position.set(24, 0, 10);
    g.add(lm);
    addLabel("アポロ11号 着陸地点(モニュメント)", 24, 6.5, 10, true);

    // 基地名
    addLabel("トランクィリティ基地(架空)", 0, 16, 0, true);

    this.scene.add(g);
  }

  // ------------------------------------------------------------ 更新

  private onKey = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      if (e.type === "keydown") this.keys.add(k);
      else this.keys.delete(k);
      e.preventDefault();
    }
  };

  private placeRover(dt: number): void {
    const h = this.heightAt(this.posX, this.posZ);
    this.rover.position.set(this.posX, h, this.posZ);
    // 前後左右の高さから姿勢(ピッチ・ロール)を求める
    const f = 1.1;
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);
    const hF = this.heightAt(this.posX + sinH * f, this.posZ + cosH * f);
    const hB = this.heightAt(this.posX - sinH * f, this.posZ - cosH * f);
    const hL = this.heightAt(this.posX + cosH * 0.8, this.posZ - sinH * 0.8);
    const hR = this.heightAt(this.posX - cosH * 0.8, this.posZ + sinH * 0.8);
    const pitch = Math.atan2(hB - hF, f * 2);
    const roll = Math.atan2(hR - hL, 1.6);
    const targetEuler = new THREE.Euler(pitch, this.heading, roll, "YXZ");
    if (dt > 0) {
      const q = new THREE.Quaternion().setFromEuler(targetEuler);
      this.rover.quaternion.slerp(q, 1 - Math.exp(-dt * 8));
    } else {
      this.rover.setRotationFromEuler(targetEuler);
    }
  }

  update(dt: number): void {
    // 入力 → 速度・向き
    const fwd = this.keys.has("w") || this.keys.has("arrowup");
    const back = this.keys.has("s") || this.keys.has("arrowdown");
    const left = this.keys.has("a") || this.keys.has("arrowleft");
    const right = this.keys.has("d") || this.keys.has("arrowright");
    const target = fwd ? MAX_SPEED : back ? -REVERSE_SPEED : 0;
    this.speed += (target - this.speed) * Math.min(dt * 2.2, 1);
    if (Math.abs(this.speed) < 0.02 && target === 0) this.speed = 0;
    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    this.heading += steer * TURN_RATE * dt;

    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);
    this.posX += sinH * this.speed * dt;
    this.posZ += cosH * this.speed * dt;
    const lim = PATCH_SIZE / 2 - 120;
    this.posX = Math.min(Math.max(this.posX, -lim), lim);
    this.posZ = Math.min(Math.max(this.posZ, -lim), lim);
    this.odometer += Math.abs(this.speed) * dt;

    this.placeRover(dt);

    // 車輪の回転
    for (const w of this.wheels) w.rotation.x += (this.speed / 0.34) * dt;

    // 追跡カメラ(後方上空から)
    const camTarget = this.rover.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const desired = this.rover.position
      .clone()
      .add(new THREE.Vector3(-sinH * 8.5, 3.6, -cosH * 8.5));
    desired.y = Math.max(desired.y, this.heightAt(desired.x, desired.z) + 1.4);
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 3.2));
    this.camera.lookAt(camTarget);

    // 太陽(影)をローバーに追従させる
    this.sun.position.copy(this.rover.position).add(this.sunDir.clone().multiplyScalar(900));
    this.sun.target.position.copy(this.rover.position);
    this.fill.position
      .copy(this.rover.position)
      .add(this.sunDir.clone().multiplyScalar(-600))
      .add(new THREE.Vector3(0, 500, 0));
  }

  getTelemetry(): RoverTelemetry {
    return { speedKmh: Math.abs(this.speed) * 3.6, odometerM: this.odometer };
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    for (const d of this.disposables) d.dispose();
  }
}
