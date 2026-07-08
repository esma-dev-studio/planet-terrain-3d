import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { LANDMARKS, TERRAIN_META } from "../data/landmarks";
import type { BodyId, Landmark, PointSelection } from "../types/terrain";
import { createTerrainMaterial, SCENE_RADIUS, type TerrainUniforms } from "./terrainMaterial";

/**
 * 月・火星の地形シーン統括クラス。
 * - 高さ・カラーはテクスチャとしてGPUへ、同じ高さデータをCPU側にも保持して
 *   クリック地点の実標高・ラベルの持ち上げ・カメラの安全距離に使う
 * - 天体はキャッシュし、切替時は表示だけ差し替える
 */

export interface TerrainSceneCallbacks {
  onPointClick(sel: PointSelection | null): void;
  onLoading(loading: boolean): void;
}

interface BodyAssets {
  group: THREE.Group;
  material: THREE.ShaderMaterial & { uniforms: TerrainUniforms };
  heightGrid: Float32Array;
  gridW: number;
  gridH: number;
  radiusKm: number;
  heightMaxKm: number;
  labelHolders: { obj: CSS2DObject; landmark: Landmark }[];
}

/** 緯度経度 → 球面方向(SphereGeometryのUVと整合する向き) */
function latLonToDir(lat: number, lon: number, out: THREE.Vector3): THREE.Vector3 {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return out.set(
    -Math.cos(phi) * Math.sin(theta),
    Math.cos(theta),
    Math.sin(phi) * Math.sin(theta)
  );
}

export class TerrainScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private sphereGeo: THREE.SphereGeometry;
  private bodies = new Map<BodyId, BodyAssets>();
  /** 読み込みの重複実行防止(同じ天体の並行ロードで二重生成しない) */
  private bodyLoads = new Map<BodyId, Promise<BodyAssets>>();
  private activeBody: BodyId | null = null;
  private resizeObserver: ResizeObserver;
  private rafId = 0;
  private disposed = false;

  private exaggeration = 15;
  private sunAzimuthDeg = 40;

  private camAnim: {
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    start: number;
    duration: number;
  } | null = null;

  private raycaster = new THREE.Raycaster();
  private pointerDown = { x: 0, y: 0, button: -1 };
  private callbacks: TerrainSceneCallbacks;

  constructor(container: HTMLElement, callbacks: TerrainSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    this.labelRenderer.domElement.className = "label-layer";
    container.appendChild(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x01020a);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 5000);
    this.camera.position.set(160, 120, 240);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 900;
    this.controls.autoRotateSpeed = 0.5;
    this.applyMinDistance();

    // 背景の星
    const starPos = new Float32Array(1400 * 3);
    for (let i = 0; i < 1400; i++) {
      const r = 1800 + Math.random() * 800;
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      starPos.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    this.scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({
          color: 0xdde6f5,
          size: 1.5,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        })
      )
    );

    // 共有ジオメトリ(頂点密度より高いテクスチャ解像度分は陰影で表現される)
    this.sphereGeo = new THREE.SphereGeometry(SCENE_RADIUS, 768, 384);

    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    this.tick();

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__terrainScene = this;
      (window as unknown as Record<string, unknown>).__THREE = THREE;
    }
  }

  // ------------------------------------------------------------ 公開 API

  /** 天体を表示(初回はデータ読込。並行呼び出しは同じPromiseを共有) */
  async showBody(bodyId: BodyId): Promise<void> {
    if (this.activeBody === bodyId) return;
    if (!this.bodies.has(bodyId)) {
      let load = this.bodyLoads.get(bodyId);
      if (!load) {
        load = this.loadBody(bodyId);
        this.bodyLoads.set(bodyId, load);
      }
      this.callbacks.onLoading(true);
      try {
        const assets = await load;
        if (!this.bodies.has(bodyId)) this.bodies.set(bodyId, assets);
      } finally {
        this.callbacks.onLoading(false);
      }
    }
    for (const [id, assets] of this.bodies) {
      const visible = id === bodyId;
      assets.group.visible = visible;
      // CSS2Dラベルは親グループの可視状態を継承しないため、個別に切り替える
      for (const { obj } of assets.labelHolders) obj.visible = visible;
    }
    this.activeBody = bodyId;
    this.applyExaggeration();
    this.applySun();
  }

  setExaggeration(x: number): void {
    this.exaggeration = x;
    this.applyExaggeration();
  }

  setSunAzimuth(deg: number): void {
    this.sunAzimuthDeg = deg;
    this.applySun();
  }

  setGrid(on: boolean): void {
    for (const assets of this.bodies.values()) {
      assets.material.uniforms.uGrid.value = on ? 1 : 0;
    }
  }

  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on;
  }

  /** 名所へ飛ぶ(低軌道の斜め視点まで降りる) */
  flyToLandmark(landmark: Landmark): void {
    const assets = this.activeBody ? this.bodies.get(this.activeBody) : null;
    if (!assets) return;
    const dir = latLonToDir(landmark.lat, landmark.lon, new THREE.Vector3());
    const surface = dir
      .clone()
      .multiplyScalar(SCENE_RADIUS + this.displacementUnits(assets, landmark.lat, landmark.lon));
    const altU = (landmark.viewAltKm / assets.radiusKm) * SCENE_RADIUS;
    // 北寄りの斜め上から見下ろす構図
    const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir);
    if (east.lengthSq() < 0.01) east.set(1, 0, 0);
    east.normalize();
    const north = new THREE.Vector3().crossVectors(dir, east).normalize();
    const camPos = surface
      .clone()
      .add(dir.clone().multiplyScalar(altU * 0.8))
      .add(north.clone().multiplyScalar(-altU * 0.75));
    this.animateCamera(camPos, surface, 1600);
  }

  resetView(): void {
    this.animateCamera(
      new THREE.Vector3(160, 120, 240),
      new THREE.Vector3(0, 0, 0),
      1100
    );
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.controls.dispose();
    this.sphereGeo.dispose();
    for (const assets of this.bodies.values()) {
      assets.material.uniforms.uColor.value.dispose();
      assets.material.uniforms.uHeight.value.dispose();
      assets.material.dispose();
    }
    this.renderer.dispose();
    this.container.innerHTML = "";
  }

  // ------------------------------------------------------------ 内部処理

  private async loadBody(bodyId: BodyId): Promise<BodyAssets> {
    const meta = TERRAIN_META[bodyId];
    const base = import.meta.env.BASE_URL + "data/";
    const loader = new THREE.TextureLoader();
    const [colorTex, heightTex, grid] = await Promise.all([
      loader.loadAsync(`${base}${bodyId}_color.jpg`),
      loader.loadAsync(`${base}${bodyId}_height.png`),
      this.loadHeightGrid(`${base}${bodyId}_height.png`, meta.heightMinKm, meta.heightMaxKm),
    ]);

    const material = createTerrainMaterial(colorTex, heightTex, {
      heightMinKm: meta.heightMinKm,
      heightMaxKm: meta.heightMaxKm,
      radiusKm: meta.radiusKm,
      texWidth: grid.w,
      texHeight: grid.h,
    });

    const group = new THREE.Group();
    group.add(new THREE.Mesh(this.sphereGeo, material));

    // 名所マーカー+ラベル
    const labelHolders: BodyAssets["labelHolders"] = [];
    for (const landmark of LANDMARKS[bodyId]) {
      const wrapper = document.createElement("div");
      const el = document.createElement("div");
      el.className = "sta-label sta-label--major landmark-label";
      el.textContent = landmark.name;
      wrapper.appendChild(el);
      const obj = new CSS2DObject(wrapper);
      group.add(obj);
      labelHolders.push({ obj, landmark });
    }

    this.scene.add(group);
    group.visible = false;
    return {
      group,
      material,
      heightGrid: grid.data,
      gridW: grid.w,
      gridH: grid.h,
      radiusKm: meta.radiusKm,
      heightMaxKm: meta.heightMaxKm,
      labelHolders,
    };
  }

  /** 高さPNG(RG=16bit)をCPU側の実標高[km]配列に展開する */
  private loadHeightGrid(
    url: string,
    minKm: number,
    maxKm: number
  ): Promise<{ data: Float32Array; w: number; h: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = img.width;
        cv.height = img.height;
        const ctx = cv.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, img.width, img.height).data;
        const data = new Float32Array(img.width * img.height);
        for (let i = 0; i < data.length; i++) {
          const h01 = (px[i * 4] * 256 + px[i * 4 + 1]) / 65535;
          data[i] = minKm + (maxKm - minKm) * h01;
        }
        resolve({ data, w: img.width, h: img.height });
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /** 実標高[km]をCPUグリッドから取得 */
  heightKmAt(bodyId: BodyId, lat: number, lon: number): number {
    const assets = this.bodies.get(bodyId);
    if (!assets) return 0;
    const u = (((lon + 180) / 360) % 1 + 1) % 1;
    const v = (90 - lat) / 180;
    const x = Math.min(assets.gridW - 1, Math.max(0, Math.round(u * assets.gridW)));
    const y = Math.min(assets.gridH - 1, Math.max(0, Math.round(v * assets.gridH)));
    return assets.heightGrid[y * assets.gridW + x];
  }

  private displacementUnits(assets: BodyAssets, lat: number, lon: number): number {
    const h = this.heightKmAt(this.activeBody!, lat, lon);
    return (h / assets.radiusKm) * SCENE_RADIUS * this.exaggeration;
  }

  private applyExaggeration(): void {
    for (const assets of this.bodies.values()) {
      assets.material.uniforms.uExagg.value = this.exaggeration;
    }
    // ラベルを地形の上に追従させる
    const assets = this.activeBody ? this.bodies.get(this.activeBody) : null;
    if (assets) {
      const dir = new THREE.Vector3();
      for (const { obj, landmark } of assets.labelHolders) {
        latLonToDir(landmark.lat, landmark.lon, dir);
        const r =
          SCENE_RADIUS + this.displacementUnits(assets, landmark.lat, landmark.lon) + 1.2;
        obj.position.copy(dir).multiplyScalar(r);
      }
    }
    this.applyMinDistance();
  }

  /**
   * カメラの最接近距離(地形へのめり込み防止)。
   * ターゲットが中心にあるとき: 球半径+最大標高まで。
   * ターゲットが地表付近にあるとき(ツアー中): 近接を許可する。
   * → 「必要クランプ = 球面までの距離 − ターゲットの中心からの距離」で連続的に扱う
   */
  private applyMinDistance(): void {
    const assets = this.activeBody ? this.bodies.get(this.activeBody) : null;
    const maxDisp = assets
      ? (assets.heightMaxKm / assets.radiusKm) * SCENE_RADIUS * this.exaggeration
      : 0;
    this.controls.minDistance = Math.max(
      3,
      SCENE_RADIUS + maxDisp + 2 - this.controls.target.length()
    );
  }

  private applySun(): void {
    const az = (this.sunAzimuthDeg * Math.PI) / 180;
    const el = (32 * Math.PI) / 180;
    const dir = new THREE.Vector3(
      Math.cos(el) * Math.cos(az),
      Math.sin(el),
      Math.cos(el) * Math.sin(az)
    );
    for (const assets of this.bodies.values()) {
      assets.material.uniforms.uSunDir.value.copy(dir);
    }
  }

  private animateCamera(toPos: THREE.Vector3, toTarget: THREE.Vector3, duration: number): void {
    this.camAnim = {
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
      start: performance.now(),
      duration,
    };
  }

  private tick = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.tick);

    if (this.camAnim) {
      const a = this.camAnim;
      const k = Math.min((performance.now() - a.start) / a.duration, 1);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(a.fromPos, a.toPos, e);
      this.controls.target.lerpVectors(a.fromTarget, a.toTarget, e);
      if (k >= 1) this.camAnim = null;
    }

    // ターゲット位置(中心⇔地表)に応じてめり込み防止クランプを更新
    this.applyMinDistance();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDown = { x: e.clientX, y: e.clientY, button: e.button };
  };

  private onPointerUp = (e: PointerEvent): void => {
    const moved =
      Math.abs(e.clientX - this.pointerDown.x) +
      Math.abs(e.clientY - this.pointerDown.y);
    if (this.pointerDown.button !== 0 || moved > 6) return;
    const assets = this.activeBody ? this.bodies.get(this.activeBody) : null;
    if (!assets || !this.activeBody) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    // 変位前の基準球に対して判定(可視上の誤差は許容)
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), SCENE_RADIUS);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectSphere(sphere, hit)) {
      this.callbacks.onPointClick(null);
      return;
    }
    const n = hit.normalize();
    const lat = 90 - (Math.acos(n.y) * 180) / Math.PI;
    let phi = Math.atan2(n.z, -n.x); // latLonToDir の逆変換
    if (phi < 0) phi += Math.PI * 2;
    const lon = (phi / (Math.PI * 2)) * 360 - 180;
    this.callbacks.onPointClick({
      bodyId: this.activeBody,
      lat,
      lon,
      heightKm: this.heightKmAt(this.activeBody, lat, lon),
      screenX: e.clientX,
      screenY: e.clientY,
    });
  };
}
