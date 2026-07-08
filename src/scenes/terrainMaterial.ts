import * as THREE from "three";

/**
 * 地形シェーダ。
 * - 頂点: 高さテクスチャ(16bitをRGに格納)を読んで球面法線方向に変位。
 *   強調倍率は uniform なのでスライダー操作が再構築なしで即反映される
 * - フラグメント: 高さの勾配から法線を作り、太陽方向でライティング。
 *   頂点密度よりテクスチャ解像度が高いため、細部の起伏は陰影として現れる
 */

export const SCENE_RADIUS = 100;

const VERT = /* glsl */ `
uniform sampler2D uHeight;
uniform float uExagg;
uniform float uHeightMinKm;
uniform float uHeightMaxKm;
uniform float uRadiusKm;
varying vec2 vUv;
varying vec3 vNormalS;

float heightKm(vec2 uv) {
  vec3 t = texture2D(uHeight, uv).rgb;
  float h01 = (t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0;
  return mix(uHeightMinKm, uHeightMaxKm, h01);
}

void main() {
  vUv = uv;
  vNormalS = normal;
  float disp = heightKm(uv) / uRadiusKm * ${SCENE_RADIUS.toFixed(1)} * uExagg;
  vec3 p = position + normal * disp;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uHeight;
uniform sampler2D uColor;
uniform float uExagg;
uniform float uHeightMinKm;
uniform float uHeightMaxKm;
uniform float uRadiusKm;
uniform vec3 uSunDir;
uniform float uGrid;
uniform vec2 uTexel;
varying vec2 vUv;
varying vec3 vNormalS;

float heightKm(vec2 uv) {
  vec3 t = texture2D(uHeight, uv).rgb;
  float h01 = (t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0;
  return mix(uHeightMinKm, uHeightMaxKm, h01);
}

void main() {
  vec3 n = normalize(vNormalS);
  // 球面の接空間(東・北)。極では東西が定義できないため微小値で保護
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-4, 0.0, 0.0));
  vec3 north = cross(n, east);

  // 高さ勾配 → 法線の摂動
  float hL = heightKm(vUv - vec2(uTexel.x, 0.0));
  float hR = heightKm(vUv + vec2(uTexel.x, 0.0));
  float hU = heightKm(vUv - vec2(0.0, uTexel.y)); // v小 = 北
  float hD = heightKm(vUv + vec2(0.0, uTexel.y));
  float circumKm = 6.28318530718 * uRadiusKm;
  float lonScale = max(sqrt(max(1.0 - n.y * n.y, 0.0)), 0.06);
  float dxKm = circumKm * uTexel.x * lonScale;
  float dyKm = circumKm * 0.5 * uTexel.y;
  float gx = (hR - hL) * uExagg / (2.0 * dxKm);
  float gy = (hU - hD) * uExagg / (2.0 * dyKm);
  vec3 pn = normalize(n - east * gx - north * gy);

  float diff = max(dot(pn, normalize(uSunDir)), 0.0);
  vec3 base = texture2D(uColor, vUv).rgb;
  vec3 col = base * (0.26 + diff * 1.35);

  // 30度ごとの経緯線(トグル)
  if (uGrid > 0.5) {
    vec2 g = abs(fract(vec2(vUv.x * 12.0, vUv.y * 6.0)) - 0.5);
    float line = smoothstep(0.010, 0.0, min(g.x, g.y));
    col = mix(col, vec3(0.45, 0.62, 0.95), line * 0.28);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface TerrainUniforms {
  uHeight: { value: THREE.Texture };
  uColor: { value: THREE.Texture };
  uExagg: { value: number };
  uHeightMinKm: { value: number };
  uHeightMaxKm: { value: number };
  uRadiusKm: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uGrid: { value: number };
  uTexel: { value: THREE.Vector2 };
}

export function createTerrainMaterial(
  colorTex: THREE.Texture,
  heightTex: THREE.Texture,
  params: {
    heightMinKm: number;
    heightMaxKm: number;
    radiusKm: number;
    texWidth: number;
    texHeight: number;
  }
): THREE.ShaderMaterial & { uniforms: TerrainUniforms } {
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.anisotropy = 8;
  // 高さはデータなので補間はリニア・色空間変換なし
  heightTex.colorSpace = THREE.NoColorSpace;
  heightTex.minFilter = THREE.LinearFilter;
  heightTex.magFilter = THREE.LinearFilter;

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uHeight: { value: heightTex },
      uColor: { value: colorTex },
      uExagg: { value: 15 },
      uHeightMinKm: { value: params.heightMinKm },
      uHeightMaxKm: { value: params.heightMaxKm },
      uRadiusKm: { value: params.radiusKm },
      uSunDir: { value: new THREE.Vector3(1, 0.5, 0.6).normalize() },
      uGrid: { value: 0 },
      uTexel: {
        value: new THREE.Vector2(1 / params.texWidth, 1 / params.texHeight),
      },
    },
  });
  return material as THREE.ShaderMaterial & { uniforms: TerrainUniforms };
}
