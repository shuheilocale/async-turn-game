import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * 舞台：リング（マット・コーナー・ロープ・エプロン）と、照明・霧・背景の光。
 * 昼（ライトモード）は明るい体育館、夜（ダークモード）はスポットライトの当たるアリーナ
 */

/** リングの内側の半分の幅（ロープの内側） */
export const RING = 2.85;
const POST = RING + 0.08;
const ROPES = [0.42, 0.82, 1.22];

export interface Theme {
  dark: boolean;
  /** 2 人の色（CSS の --p0 / --p1） */
  p0: string;
  p1: string;
  /** 画面の地の色（霧をなじませる） */
  bg: string;
}

const LIGHT = {
  fog: "#d3d9e3",
  mat: "#bcc2cc",
  matLine: "#aab1bd",
  apron: "#2a3142",
  floor: "#a9b1be",
  rope: "#f6f6f3",
  post: "#3b4252",
  neutral: "#f2f2ee",
  hemiSky: "#ffffff",
  hemiGround: "#8d95a6",
  hemi: 0.55,
  key: 3.6,
  keyColor: "#fff3e3",
  rimA: 2.8,
  rimAColor: "#d4e2ff",
  rimB: 1.4,
  rimBColor: "#ffe0bd",
  env: 0.28,
};
const DARK = {
  fog: "#0c0f17",
  mat: "#2c313c",
  matLine: "#3a4150",
  apron: "#141824",
  floor: "#0e1118",
  rope: "#d9dde6",
  post: "#2a303d",
  neutral: "#d8dbe2",
  hemiSky: "#34405c",
  hemiGround: "#07080c",
  hemi: 0.55,
  key: 3.4,
  keyColor: "#fff0dc",
  rimA: 3.6,
  rimAColor: "#7f9fff",
  rimB: 2.6,
  rimBColor: "#ffad66",
  env: 0.28,
};

/** マットのテクスチャ。キャンバス地のむらと、真ん中の円の模様 */
function matTexture(base: string, line: string) {
  const W = 512;
  const c = document.createElement("canvas");
  c.width = c.height = W;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, W, W);
  // 布のむら
  const img = g.getImageData(0, 0, W, W);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 9;
    img.data[i] = img.data[i]! + n;
    img.data[i + 1] = img.data[i + 1]! + n;
    img.data[i + 2] = img.data[i + 2]! + n;
  }
  g.putImageData(img, 0, 0);
  // 真ん中の円と、縁の線
  g.strokeStyle = line;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(W / 2, W / 2, W * 0.19, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(W / 2, W / 2, W * 0.16, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 6;
  g.strokeRect(W * 0.035, W * 0.035, W * 0.93, W * 0.93);
  // 光の輪（スポットライトの当たり）：外側ほど少し暗く
  const grad = g.createRadialGradient(W / 2, W / 2, W * 0.15, W / 2, W / 2, W * 0.72);
  grad.addColorStop(0, "rgba(255,255,255,0.06)");
  grad.addColorStop(1, "rgba(0,0,0,0.22)");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, W);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 丸くぼかした点（影・光の玉に使う） */
export function softDot(inner: string, outer: string, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Arena {
  readonly group = new THREE.Group();
  readonly hemi = new THREE.HemisphereLight();
  readonly key = new THREE.DirectionalLight();
  readonly rimA = new THREE.DirectionalLight();
  readonly rimB = new THREE.DirectionalLight();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly matMat = new THREE.MeshStandardMaterial({ roughness: 0.82 });
  private readonly apronMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  private readonly floorMat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.1 });
  private readonly ropeMat = new THREE.MeshStandardMaterial({ roughness: 0.42 });
  private readonly postMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.7 });
  /** コーナーのパッド（奥の左・奥の右・手前の 2 つ） */
  private readonly padMats = [0, 1, 2].map(() => new THREE.MeshPhysicalMaterial({ roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.35 }));
  /** ロープ（4 辺）とコーナー（4 隅）。カメラの手前に来るものは隠す */
  private readonly sides: { mesh: THREE.Object3D; normal: THREE.Vector3 }[] = [];
  private readonly corners: { group: THREE.Group; at: THREE.Vector3 }[] = [];
  private readonly beams: THREE.Mesh[] = [];
  private readonly bokeh: THREE.Points;
  private readonly bokehMat: THREE.PointsMaterial;
  private matTex: THREE.Texture | null = null;
  private themeKey = "";
  private readonly tmp = new THREE.Vector3();
  private readonly fog = new THREE.Fog("#000", 7, 20);

  constructor() {
    const g = this.group;
    this.disposables.push(this.matMat, this.apronMat, this.floorMat, this.ropeMat, this.postMat, ...this.padMats);

    // マット（上の面は y = 0）とエプロン
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(POST * 2 + 0.3, POST * 2 + 0.3), this.matMat);
    mat.rotation.x = -Math.PI / 2;
    mat.receiveShadow = true;
    const apron = new THREE.Mesh(new RoundedBoxGeometry(POST * 2 + 0.34, 1.0, POST * 2 + 0.34, 2, 0.04), this.apronMat);
    apron.position.y = -0.5 - 0.004;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    floor.receiveShadow = true;
    g.add(mat, apron, floor);
    this.disposables.push(mat.geometry, apron.geometry, floor.geometry);

    // ロープ：辺ごとに 3 本を 1 つの形にまとめる
    const ropeLen = POST * 2;
    for (const [nx, nz] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const parts = ROPES.map((y) => {
        const geo = new THREE.CylinderGeometry(0.022, 0.022, ropeLen, 10, 1);
        geo.rotateZ(Math.PI / 2);
        geo.translate(0, y, 0);
        return geo;
      });
      const merged = mergeGeometries(parts)!;
      parts.forEach((p) => p.dispose());
      const rope = new THREE.Mesh(merged, this.ropeMat);
      rope.position.set(nx * POST, 0, nz * POST);
      rope.rotation.y = nx !== 0 ? Math.PI / 2 : 0;
      rope.castShadow = false;
      g.add(rope);
      this.disposables.push(merged);
      this.sides.push({ mesh: rope, normal: new THREE.Vector3(nx, 0, nz) });
    }
    // コーナー：柱とパッド
    const postGeo = new THREE.CylinderGeometry(0.045, 0.05, 1.55, 14);
    postGeo.translate(0, 0.775, 0);
    const padGeo = new RoundedBoxGeometry(0.19, 1.02, 0.19, 3, 0.06);
    padGeo.translate(0, 0.83, 0);
    this.disposables.push(postGeo, padGeo);
    const cornerAt = [
      [-1, -1, 0],
      [1, -1, 1],
      [1, 1, 2],
      [-1, 1, 2],
    ] as const;
    for (const [x, z, m] of cornerAt) {
      const cg = new THREE.Group();
      cg.position.set(x * POST, 0, z * POST);
      const post = new THREE.Mesh(postGeo, this.postMat);
      const pad = new THREE.Mesh(padGeo, this.padMats[m]!);
      pad.rotation.y = Math.PI / 4;
      pad.castShadow = true;
      cg.add(post, pad);
      g.add(cg);
      this.corners.push({ group: cg, at: cg.position.clone() });
    }

    // 夜のアリーナ：上から差す光の筋と、遠くの客席の明かり（ぼけた光の玉）
    const beamGeo = new THREE.CylinderGeometry(0.3, 1.9, 9, 28, 1, true);
    beamGeo.translate(0, 4.5, 0);
    this.disposables.push(beamGeo);
    for (const [x, z] of [
      [0, 0],
      [-2.4, -1.8],
      [2.6, -1.4],
    ] as const) {
      // 縁ほど薄く、床に近いほど消える光の筋（見る向きに対する面の傾きで濃さを変える）
      const m = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color("#a9bcf5") }, opacity: { value: x === 0 ? 0.11 : 0.07 } },
        vertexShader: `
          varying float vY;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            vY = position.y / 9.0;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 color;
          uniform float opacity;
          varying float vY;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.5);
            float fall = smoothstep(0.02, 0.3, vY) * (1.0 - smoothstep(0.8, 1.0, vY)) * mix(0.55, 1.0, vY);
            gl_FragColor = vec4(color * edge * fall * opacity, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.disposables.push(m);
      const beam = new THREE.Mesh(beamGeo, m);
      beam.position.set(x, -0.2, z);
      beam.renderOrder = 2;
      g.add(beam);
      this.beams.push(beam);
    }
    const n = 90;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const warm = new THREE.Color("#ffc58a");
    const cool = new THREE.Color("#9fb6ff");
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.05 + Math.random() * 0.9) + Math.PI;
      const r = 9 + Math.random() * 7;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.2 + Math.random() * 4.5;
      pos[i * 3 + 2] = Math.sin(a) * r;
      const c = Math.random() < 0.55 ? warm : cool;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    bgeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const dot = softDot("rgba(255,255,255,1)", "rgba(255,255,255,0)", 64);
    this.bokehMat = new THREE.PointsMaterial({
      size: 0.55,
      map: dot,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.bokeh = new THREE.Points(bgeo, this.bokehMat);
    g.add(this.bokeh);
    this.disposables.push(bgeo, dot, this.bokehMat);

    // 照明：上からのキーライト（影を落とす）、後ろからの 2 つのリムライト、空と床からの環境光
    this.key.position.set(2.6, 7.2, 3.6);
    this.key.castShadow = true;
    const sc = this.key.shadow.camera;
    sc.left = sc.bottom = -2.6;
    sc.right = sc.top = 2.6;
    sc.near = 2;
    sc.far = 16;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.025;
    this.key.shadow.radius = 5;
    this.rimA.position.set(3.2, 3.2, -4.5);
    this.rimB.position.set(-4.2, 2.6, -3.2);
    g.add(this.hemi, this.key, this.key.target, this.rimA, this.rimB);
  }

  /** 昼・夜と、2 人の色に合わせる。leftSeat は画面の左（奥の左のコーナー）の人の色 */
  setTheme(theme: Theme, leftSeat: 0 | 1, scene: THREE.Scene) {
    const L = theme.dark ? DARK : LIGHT;
    const key = `${theme.dark}`;
    if (key !== this.themeKey) {
      this.themeKey = key;
      this.matTex?.dispose();
      this.matTex = matTexture(L.mat, L.matLine);
      this.matMat.map = this.matTex;
      this.matMat.needsUpdate = true;
    }
    this.apronMat.color.set(L.apron);
    this.floorMat.color.set(L.floor);
    this.ropeMat.color.set(L.rope);
    this.postMat.color.set(L.post);
    this.setCorners(theme, leftSeat === 0 ? [0, 1] : [1, 0]);
    this.padMats[2]!.color.set(L.neutral);
    this.hemi.color.set(L.hemiSky);
    this.hemi.groundColor.set(L.hemiGround);
    this.hemi.intensity = L.hemi;
    this.key.color.set(L.keyColor);
    this.key.intensity = L.key;
    this.rimA.color.set(L.rimAColor);
    this.rimA.intensity = L.rimA;
    this.rimB.color.set(L.rimBColor);
    this.rimB.intensity = L.rimB;
    for (const b of this.beams) b.visible = theme.dark;
    this.bokehMat.opacity = theme.dark ? 0.75 : 0.22;
    scene.environmentIntensity = L.env;
    // 霧は CSS の背景（地平線のあたり）の色に合わせる
    this.fog.color.set(L.fog);
    this.fog.near = theme.dark ? 6.5 : 6;
    this.fog.far = theme.dark ? 17 : 16;
    scene.fog = this.fog;
  }

  /** 奥の 2 つのコーナーの色（左・右）。対戦では画面の左の人と右の人、キャラ作りでは見せている人の色 */
  setCorners(theme: Theme, seats: [0 | 1, 0 | 1]) {
    const key = `${theme.p0}|${theme.p1}|${seats.join()}`;
    if (key === this.cornerKey) return;
    this.cornerKey = key;
    seats.forEach((s, i) => this.padMats[i]!.color.set(s === 0 ? theme.p0 : theme.p1));
  }
  private cornerKey = "";

  /** カメラとリングの真ん中の間に入るロープ・コーナーを隠す（手前のロープで人が見えなくならないように） */
  cull(camera: THREE.Vector3, target: THREE.Vector3) {
    const dir = this.tmp.subVectors(camera, target).setY(0).normalize();
    for (const s of this.sides) s.mesh.visible = s.normal.dot(dir) < 0.35;
    for (const c of this.corners) c.group.visible = (c.at.x * dir.x + c.at.z * dir.z) / Math.hypot(c.at.x, c.at.z) < 0.25;
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.matTex?.dispose();
  }
}
