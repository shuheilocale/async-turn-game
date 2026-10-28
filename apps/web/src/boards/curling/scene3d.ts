import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  RingGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Texture,
} from "three";
import { Curling, type Seat } from "@atg/core";

/**
 * カーリングの 3D の場面（Three.js）。盤から dynamic import で読み込むので、ほかの画面の読み込みは重くならない。
 * 画像やモデルは使わず、氷・石・ハウスの模様もすべてここで作る。
 *
 * 座標：ゲームの (x, y)（メートル、y はハウスの方向）を、Three.js の (x, 高さ, -y) に置く。
 * 投げる人の後ろにいるカメラは -z の方を向く。
 *
 * iPhone でも軽く動くよう、何かが動いているときだけ描き直す。影の解像度は 1024、ピクセル比は 2 まで
 * （描くのが遅い端末では自動で下げる）
 */

const { STONE_R, SHEET_W, TEE_Y, HOG_Y, BACK_Y, SHEET_END, RINGS } = Curling;

/** シートの手前の端（投げる場所の後ろ） */
const SHEET_START = -3.2;
/** ハック（投げる人が足をかける台）の位置 */
const HACK_Y = -1.6;
/** 石の高さ */
const STONE_H = 0.115;
/** 1 エンドに使う石の数（投げる前の石も含めて、同時にシートに出るのはこれだけ） */
const POOL = Curling.THROWS;

export type ViewMode = "aim" | "follow" | "house";

/** シートの上に描く石 */
export interface StoneView {
  id: number;
  seat: Seat;
  x: number;
  y: number;
  angle: number;
  /** 0（消えた）〜1 */
  opacity: number;
  /** いま点になる石（足もとに輪を出す） */
  counts?: boolean;
}

/** 投げる前のねらい */
export interface AimView {
  aim: number;
  /** 強さのつまみ 0〜1 */
  power: number;
  spin: Curling.Spin;
  seat: Seat;
}

/** すべっている石の前をこするブラシ。投げた石の位置・進む向き（0 が奥、正なら右）と、こすりの強さ（0〜1） */
export interface SweepView {
  x: number;
  y: number;
  heading: number;
  level: number;
  seat: Seat;
}

export interface Palette {
  p0: string;
  p1: string;
  dark: boolean;
}

export interface CurlingScene {
  resize(width: number, height: number): void;
  setPalette(palette: Palette): void;
  setStones(stones: StoneView[]): void;
  setAim(aim: AimView | null): void;
  /** こすっているブラシ。こすっていなければ null */
  setSweep(sweep: SweepView | null): void;
  /** カメラの向け方。follow のときは追いかける石の位置を渡す。instant なら動かさずにすぐ切り替える */
  setView(mode: ViewMode, focus?: { x: number; y: number }, instant?: boolean): void;
  dispose(): void;
}

/** ゲームの座標を Three.js の座標に */
const v3 = (x: number, h: number, y: number) => new Vector3(x, h, -y);

/** 同じ種から同じ並びを返す乱数（mulberry32）。氷の傷や石の模様を毎回同じにする */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

// ---------- 模様（プログラムで描くテクスチャ） ----------

/**
 * 氷の表面。白〜水色の地に、こまかい粒（ペブル）と、石がすべった細い傷を描く。
 * 端と端がつながる（くり返して貼っても継ぎ目が見えない）ように、はみ出した分は反対側にも描く
 */
function iceTexture(dark: boolean): CanvasTexture {
  const N = 512;
  const [c, g] = canvas2d(N, N);
  const rnd = seeded(7);
  g.fillStyle = dark ? "#dfe7ef" : "#f4f8fb";
  g.fillRect(0, 0, N, N);
  /** 端をまたぐものは、上下左右にずらして描き足す */
  const tile = (x: number, y: number, r: number, draw: (x: number, y: number) => void) => {
    for (const ox of [-N, 0, N])
      for (const oy of [-N, 0, N]) {
        if (x + ox + r < 0 || x + ox - r > N || y + oy + r < 0 || y + oy - r > N) continue;
        draw(x + ox, y + oy);
      }
  };
  // 大きなむら（少し青い所と白い所）。くり返しが縞に見えないよう、うすく
  for (let i = 0; i < 34; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const r = 50 + rnd() * 150;
    const tone = rnd() < 0.55 ? "200, 216, 234" : "255, 255, 255";
    tile(x, y, r, (px, py) => {
      const grad = g.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, `rgba(${tone}, ${0.07 + rnd() * 0.08})`);
      grad.addColorStop(1, `rgba(${tone}, 0)`);
      g.fillStyle = grad;
      g.fillRect(px - r, py - r, 2 * r, 2 * r);
    });
  }
  // ペブル（氷にまいた水滴の粒）
  for (let i = 0; i < 7000; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const r = 0.4 + rnd() * 1.1;
    const light = rnd() < 0.4;
    g.fillStyle = light ? `rgba(255, 255, 255, ${0.35 + rnd() * 0.4})` : `rgba(120, 146, 172, ${0.05 + rnd() * 0.1})`;
    tile(x, y, r, (px, py) => {
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
    });
  }
  // 石がすべった傷。たいていシートの向き（縦）に、少し曲がって
  g.lineCap = "round";
  for (let i = 0; i < 150; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const len = 30 + rnd() * 260;
    const tilt = (rnd() - 0.5) * 0.5;
    const bend = (rnd() - 0.5) * 40;
    const dx = Math.sin(tilt) * len;
    const dy = Math.cos(tilt) * len;
    g.strokeStyle = rnd() < 0.5 ? `rgba(150, 172, 196, ${0.1 + rnd() * 0.2})` : `rgba(255, 255, 255, ${0.4 + rnd() * 0.4})`;
    g.lineWidth = 0.4 + rnd() * 0.9;
    tile(x, y, len, (px, py) => {
      g.beginPath();
      g.moveTo(px, py);
      g.quadraticCurveTo(px + dx / 2 + bend, py + dy / 2, px + dx, py + dy);
      g.stroke();
    });
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  return tex;
}

/**
 * 花こう岩の石の模様。灰色の地に黒・白・こげ茶の粒。まん中の帯（石どうしが当たる所）は
 * みがいていないので、少し白っぽくする。LatheGeometry の v（下から上）に合わせて描く
 */
function graniteTexture(band: [number, number]): CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, g] = canvas2d(W, H);
  const rnd = seeded(11);
  g.fillStyle = "#9a9ea6";
  g.fillRect(0, 0, W, H);
  const dots: [string, number, number][] = [
    ["rgba(48, 50, 56, 0.75)", 2600, 1.6],
    ["rgba(220, 222, 226, 0.7)", 2200, 1.3],
    ["rgba(118, 96, 86, 0.55)", 900, 1.5],
    ["rgba(70, 74, 82, 0.5)", 1800, 2.4],
  ];
  for (const [color, n, size] of dots) {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const r = 0.4 + rnd() * size;
      g.beginPath();
      g.ellipse(x, y, r * (0.7 + rnd() * 0.6), r, rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  }
  // 当たる帯（canvas は上が v = 1）
  const top = (1 - band[1]) * H;
  const bottom = (1 - band[0]) * H;
  const grad = g.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, "rgba(235, 236, 238, 0)");
  grad.addColorStop(0.3, "rgba(235, 236, 238, 0.32)");
  grad.addColorStop(0.7, "rgba(235, 236, 238, 0.32)");
  grad.addColorStop(1, "rgba(235, 236, 238, 0)");
  g.fillStyle = grad;
  g.fillRect(0, top, W, bottom - top);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  return tex;
}

/** 石の下のやわらかい影（まん中が濃く、外へ向かって消える） */
function blobTexture(): CanvasTexture {
  const N = 128;
  const [c, g] = canvas2d(N, N);
  const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grad.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  grad.addColorStop(0.42, "rgba(0, 0, 0, 0.38)");
  grad.addColorStop(0.7, "rgba(0, 0, 0, 0.1)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, N, N);
  return new CanvasTexture(c);
}

/**
 * 映り込みに使うまわりの景色。暗い屋内に、天井の照明が何列も並んだリンク。
 * つやのある氷にぼんやり光の帯が映る
 */
function rinkEnvironment(renderer: WebGLRenderer): Texture {
  const env = new Scene();
  const disposables: (BufferGeometry | Material)[] = [];
  const add = (geo: BufferGeometry, mat: Material, pos: Vector3) => {
    const mesh = new Mesh(geo, mat);
    mesh.position.copy(pos);
    env.add(mesh);
    disposables.push(geo, mat);
    return mesh;
  };
  add(new BoxGeometry(40, 14, 90), new MeshBasicMaterial({ color: 0x4a5466, side: BackSide }), new Vector3(0, 6, 0));
  const light = new MeshBasicMaterial({ color: new Color(1, 1, 1).multiplyScalar(5) });
  disposables.push(light);
  const panel = new BoxGeometry(1.6, 0.1, 4);
  disposables.push(panel);
  for (const x of [-7, 0, 7])
    for (let z = -40; z <= 40; z += 8) {
      const m = new Mesh(panel, light);
      m.position.set(x, 12.9, z);
      env.add(m);
    }
  // 遠くの観客席あたりの、少し明るい壁
  add(new BoxGeometry(40, 3, 0.2), new MeshBasicMaterial({ color: 0x9aa6b8 }), new Vector3(0, 2, -44));
  add(new BoxGeometry(40, 3, 0.2), new MeshBasicMaterial({ color: 0x9aa6b8 }), new Vector3(0, 2, 44));
  const pmrem = new PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  for (const d of disposables) d.dispose();
  return tex;
}

// ---------- 形 ----------

/** 石の断面（半径, 高さ）。下は細い輪（ランニングバンド）で氷に触れ、横はふくらみ、上は平ら */
const PROFILE: [number, number][] = [
  [0, 0.007],
  [0.052, 0.007],
  [0.06, 0.001],
  [0.07, 0],
  [0.082, 0.002],
  [0.106, 0.011],
  [0.128, 0.025],
  [0.141, 0.042],
  [0.145, 0.056],
  [0.143, 0.07],
  [0.135, 0.087],
  [0.12, 0.101],
  [0.1, 0.11],
  [0.075, STONE_H - 0.001],
  [0, STONE_H],
];
/** 当たる帯（いちばんふくらんだ所）は、断面の何番目から何番目か */
const BAND: [number, number] = [6 / (PROFILE.length - 1), 10 / (PROFILE.length - 1)];

function stoneGeometry(): BufferGeometry {
  return new LatheGeometry(
    PROFILE.map(([r, h]) => new Vector2(r, h)),
    48,
  );
}

/** 取っ手。まん中から立ち上がって、前へ曲がる棒 */
function handleGeometry(): BufferGeometry {
  const curve = new CatmullRomCurve3([
    new Vector3(0, STONE_H - 0.004, 0.035),
    new Vector3(0, STONE_H + 0.03, 0.04),
    new Vector3(0, STONE_H + 0.05, 0.012),
    new Vector3(0, STONE_H + 0.054, -0.05),
    new Vector3(0, STONE_H + 0.05, -0.11),
  ]);
  return new TubeGeometry(curve, 28, 0.016, 10, false);
}

/** 回転の向きを示す、石を囲む矢印（上から見て時計回り）。氷の上に寝かせる */
function spinArrowGeometry(): BufferGeometry {
  const r0 = 0.215;
  const r1 = 0.245;
  const start = Math.PI * 0.9;
  const end = -Math.PI * 0.55;
  const shape = new Shape();
  const steps = 28;
  // 外側の弧（start から end へ、時計回り）
  for (let i = 0; i <= steps; i++) {
    const a = start + ((end - start) * i) / steps;
    if (i === 0) shape.moveTo(r1 * Math.cos(a), r1 * Math.sin(a));
    else shape.lineTo(r1 * Math.cos(a), r1 * Math.sin(a));
  }
  // 矢じり
  const tip = end - 0.32;
  const mid = (r0 + r1) / 2;
  shape.lineTo((r1 + 0.03) * Math.cos(end), (r1 + 0.03) * Math.sin(end));
  shape.lineTo(mid * Math.cos(tip), mid * Math.sin(tip));
  shape.lineTo((r0 - 0.03) * Math.cos(end), (r0 - 0.03) * Math.sin(end));
  // 内側の弧（もどる）
  for (let i = steps; i >= 0; i--) {
    const a = start + ((end - start) * i) / steps;
    shape.lineTo(r0 * Math.cos(a), r0 * Math.sin(a));
  }
  const geo = new ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** 氷に描いた線（ライン）。y はゲームの座標、幅 w */
function lineMesh(x0: number, x1: number, y0: number, y1: number, mat: Material): Mesh {
  const geo = new PlaneGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0));
  geo.rotateX(-Math.PI / 2);
  const m = new Mesh(geo, mat);
  m.position.copy(v3((x0 + x1) / 2, 0.0012, (y0 + y1) / 2));
  m.receiveShadow = true;
  return m;
}

// ---------- カメラ ----------

interface Pose {
  pos: Vector3;
  target: Vector3;
  fov: number;
}

/** 見え方ごとのカメラの位置。aspect は横 / 縦 */
function poseOf(mode: ViewMode, focus: { x: number; y: number }, aspect: number): Pose {
  if (mode === "aim") {
    // 投げる人の後ろの少し高い所から、望遠でハウスまで見通す（中継でよく見る角度）。
    // 手前の石が下の方に、ハウスが上の方に来るようにする
    return { pos: v3(0, 2.6, -7.5), target: v3(0, 0, 5), fov: 24 };
  }
  if (mode === "follow") {
    // 石の少し後ろ・上から追いかける。行き先が見えるよう少し先を見る
    const x = focus.x * 0.85;
    return { pos: v3(x * 0.6, 1.35, focus.y - 4.2), target: v3(x, 0, focus.y + 5), fov: 34 };
  }
  // ハウスをほぼ真上から（少しだけ手前に傾ける）。奥の線から、ハウスの手前か focus.y（いちばん手前の石）
  // までが縦に、シートの幅が横に収まる高さにする
  const top = BACK_Y + 0.45;
  const bottom = Math.min(TEE_Y - 2.7, focus.y - 0.75);
  const center = (top + bottom) / 2;
  const fov = 40;
  const tan = Math.tan((fov / 2) * (Math.PI / 180));
  const halfW = SHEET_W / 2 + 0.06;
  const dist = Math.max((top - bottom) / 2 / tan, halfW / (tan * aspect));
  const tilt = 0.2;
  return { pos: v3(0, dist * Math.cos(tilt), center - dist * Math.sin(tilt)), target: v3(0, 0, center), fov };
}

// ---------- 石 ----------

interface StoneMesh {
  group: Group;
  /** 影を落とす部分（消えかけている間は影を落とさない） */
  casters: Mesh[];
  fading: boolean;
  bodyMat: MeshStandardMaterial;
  handleMat: MeshStandardMaterial;
  capMat: MeshStandardMaterial;
  blobMat: MeshBasicMaterial;
  ringMat: MeshBasicMaterial;
  ring: Mesh;
  seat: Seat | null;
}

/**
 * 3D の場面を作る。WebGL が使えなければ例外を投げる（呼ぶ側で 2D の図に切り替える）
 */
export function createScene(canvas: HTMLCanvasElement, initial: Palette): CurlingScene {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 120);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  /** 片付けるもの */
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => (owned.push(x), x);

  scene.environment = own(rinkEnvironment(renderer));
  scene.environmentIntensity = 0.85;

  // ---------- 明かり ----------
  const hemi = new HemisphereLight(0xffffff, 0xaab6c8, 1.15);
  scene.add(hemi);
  const sun = new DirectionalLight(0xffffff, 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  const sc = sun.shadow.camera;
  sc.left = -4.6;
  sc.right = 4.6;
  sc.top = 4.6;
  sc.bottom = -4.6;
  sc.near = 1;
  sc.far = 24;
  scene.add(sun, sun.target);
  /** 影を出す範囲の中心（いま見ている所）。光はそこを左うしろの上から照らす */
  const shadowAt = (x: number, y: number) => {
    sun.target.position.copy(v3(x, 0, y));
    sun.position.copy(v3(x - 2.4, 9, y - 3.2));
  };
  shadowAt(0, 0);

  // ---------- シート ----------
  let iceTex = iceTexture(initial.dark);
  const sheetLen = SHEET_END - SHEET_START;
  const iceMat = own(new MeshStandardMaterial({ map: iceTex, roughness: 0.09, metalness: 0, envMapIntensity: 1.1 }));
  const setIceTexture = (tex: CanvasTexture) => {
    tex.anisotropy = anisotropy;
    // 1 枚を 2.4 m 四方に貼る
    tex.repeat.set(SHEET_W / 2.4, sheetLen / 2.4);
    iceMat.map = tex;
    iceMat.needsUpdate = true;
  };
  setIceTexture(iceTex);
  const iceGeo = own(new PlaneGeometry(SHEET_W, sheetLen));
  iceGeo.rotateX(-Math.PI / 2);
  const ice = new Mesh(iceGeo, iceMat);
  ice.position.copy(v3(0, 0, (SHEET_START + SHEET_END) / 2));
  ice.receiveShadow = true;
  scene.add(ice);

  // シートの外の床（となりのシート）。少し暗い氷
  const floorMat = own(new MeshStandardMaterial({ color: 0xd5dde7, roughness: 0.3 }));
  const floorGeo = own(new PlaneGeometry(60, 140));
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new Mesh(floorGeo, floorMat);
  floor.position.copy(v3(0, -0.06, 12));
  floor.receiveShadow = true;
  scene.add(floor);

  // 横と奥の板（ボード）
  const boardMat = own(new MeshStandardMaterial({ color: 0x55637d, roughness: 0.6 }));
  const sideGeo = own(new BoxGeometry(0.07, 0.13, sheetLen + 0.14));
  for (const dir of [-1, 1]) {
    const m = new Mesh(sideGeo, boardMat);
    m.position.copy(v3(dir * (SHEET_W / 2 + 0.035), 0.05, (SHEET_START + SHEET_END) / 2));
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  const endGeo = own(new BoxGeometry(SHEET_W + 0.14, 0.13, 0.07));
  for (const y of [SHEET_START - 0.035, SHEET_END + 0.035]) {
    const m = new Mesh(endGeo, boardMat);
    m.position.copy(v3(0, 0.05, y));
    m.receiveShadow = true;
    scene.add(m);
  }

  // ハウス（氷の下に塗った模様。氷の傷が上に見えるよう、少し透かす）
  const paint = (color: number) =>
    own(
      new MeshStandardMaterial({
        color,
        roughness: 0.16,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
  const outerMat = paint(0x5677b4);
  const innerMat = paint(0xb85c6e);
  const buttonMat = paint(0xf7f9fb);
  const ringOf = (r0: number, r1: number, mat: Material) => {
    const geo = own(r0 === 0 ? new CircleGeometry(r1, 64) : new RingGeometry(r0, r1, 96, 1));
    geo.rotateX(-Math.PI / 2);
    const m = new Mesh(geo, mat);
    m.position.copy(v3(0, 0.0008, TEE_Y));
    m.receiveShadow = true;
    scene.add(m);
  };
  ringOf(RINGS[1], RINGS[0], outerMat);
  ringOf(RINGS[3], RINGS[2], innerMat);
  ringOf(0, RINGS[3], buttonMat);

  // ライン：ホッグライン（太い）・ティーライン・バックライン・センターライン・ハック
  const lineMat = paint(0x2c3953);
  const hogMat = paint(0xb85c6e);
  scene.add(lineMesh(-SHEET_W / 2, SHEET_W / 2, HOG_Y - 0.05, HOG_Y + 0.05, hogMat));
  scene.add(lineMesh(-SHEET_W / 2, SHEET_W / 2, TEE_Y - 0.01, TEE_Y + 0.01, lineMat));
  scene.add(lineMesh(-SHEET_W / 2, SHEET_W / 2, BACK_Y - 0.01, BACK_Y + 0.01, lineMat));
  scene.add(lineMesh(-0.01, 0.01, HOG_Y + 0.05, BACK_Y + 1.2, lineMat));
  scene.add(lineMesh(-0.01, 0.01, HACK_Y + 0.3, 0.6, lineMat));
  const hackMat = own(new MeshStandardMaterial({ color: 0x23262d, roughness: 0.8 }));
  const hackGeo = own(new BoxGeometry(0.15, 0.03, 0.2));
  for (const dir of [-1, 1]) {
    const m = new Mesh(hackGeo, hackMat);
    m.position.copy(v3(dir * 0.13, 0.015, HACK_Y));
    m.castShadow = true;
    scene.add(m);
  }

  // ---------- 石 ----------
  const graniteTex = own(graniteTexture(BAND));
  graniteTex.repeat.set(3, 1);
  graniteTex.anisotropy = anisotropy;
  const blobTex = own(blobTexture());
  const stoneGeo = own(stoneGeometry());
  const handleGeo = own(handleGeometry());
  const capGeo = own(new RingGeometry(0.06, 0.088, 48, 1));
  capGeo.rotateX(-Math.PI / 2);
  const blobGeo = own(new PlaneGeometry(0.66, 0.66));
  blobGeo.rotateX(-Math.PI / 2);
  const markGeo = own(new RingGeometry(0.17, 0.205, 48, 1));
  markGeo.rotateX(-Math.PI / 2);

  let palette = initial;
  const seatColor = (seat: Seat) => new Color(seat === 0 ? palette.p0 : palette.p1);

  const stones: StoneMesh[] = Array.from({ length: POOL }, () => {
    const group = new Group();
    const bodyMat = own(new MeshStandardMaterial({ map: graniteTex, roughness: 0.32, metalness: 0, envMapIntensity: 0.9 }));
    const handleMat = own(new MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 }));
    const capMat = own(new MeshStandardMaterial({ roughness: 0.4 }));
    const blobMat = own(new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0x0b1424 }));
    const ringMat = own(new MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }));
    const body = new Mesh(stoneGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    const handle = new Mesh(handleGeo, handleMat);
    handle.castShadow = true;
    const cap = new Mesh(capGeo, capMat);
    cap.position.y = STONE_H + 0.0008;
    const blob = new Mesh(blobGeo, blobMat);
    blob.position.y = 0.0016;
    blob.renderOrder = 1;
    const ring = new Mesh(markGeo, ringMat);
    ring.position.y = 0.002;
    ring.renderOrder = 2;
    group.add(body, handle, cap, blob, ring);
    group.visible = false;
    scene.add(group);
    return { group, casters: [body, handle], fading: false, bodyMat, handleMat, capMat, blobMat, ringMat, ring, seat: null };
  });

  const paintStone = (s: StoneMesh, seat: Seat) => {
    s.seat = seat;
    const c = seatColor(seat);
    s.handleMat.color.copy(c);
    s.capMat.color.copy(c).multiplyScalar(0.85);
    s.ringMat.color.copy(c);
  };

  /** 消えていく石は半透明にする（その間は影を落とさない） */
  const setOpacity = (s: StoneMesh, o: number) => {
    const fading = o < 0.999;
    if (s.fading !== fading) {
      s.fading = fading;
      for (const m of [s.bodyMat, s.handleMat, s.capMat]) {
        m.transparent = fading;
        m.needsUpdate = true;
      }
      for (const c of s.casters) c.castShadow = !fading;
    }
    for (const m of [s.bodyMat, s.handleMat, s.capMat, s.blobMat]) m.opacity = o;
  };

  // ---------- ねらい（点線と回転の矢印） ----------
  const DOTS = 22;
  const dotGeo = own(new CircleGeometry(0.035, 12));
  dotGeo.rotateX(-Math.PI / 2);
  const dotMat = own(new MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false }));
  const dots = new InstancedMesh(dotGeo, dotMat, DOTS);
  dots.renderOrder = 3;
  dots.visible = false;
  dots.frustumCulled = false;
  scene.add(dots);
  const arrowGeo = own(spinArrowGeometry());
  const arrowMat = own(new MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }));
  const arrow = new Mesh(arrowGeo, arrowMat);
  arrow.position.y = 0.003;
  arrow.renderOrder = 3;
  arrow.visible = false;
  scene.add(arrow);
  const tmp = new Object3D();

  // ---------- ブラシ（すべっている石の前の氷をこする） ----------
  /** ブラシの頭（氷をこする所）と柄。柄は頭から斜め上へのびる（こする人は石の横を一緒にすべっている） */
  const padGeo = own(new BoxGeometry(0.34, 0.045, 0.1));
  padGeo.translate(0, 0.0225, 0);
  const shaftGeo = own(new BoxGeometry(0.026, 1.0, 0.026));
  shaftGeo.translate(0, 0.5, 0);
  const padMat = own(new MeshStandardMaterial({ color: 0x1d2433, roughness: 0.85 }));
  const shaftMat = own(new MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 }));
  const brushes = new Group();
  brushes.visible = false;
  scene.add(brushes);
  /** 石の前の、2 本のブラシ。石からの距離・柄を傾ける側・揺らすときのずれ */
  const BRUSHES = [
    { ahead: 0.36, side: -1, phase: 0 },
    { ahead: 0.62, side: 1, phase: Math.PI },
  ];
  const brushParts = BRUSHES.map(({ side }) => {
    const holder = new Group();
    const pad = new Mesh(padGeo, padMat);
    pad.castShadow = true;
    const shaft = new Mesh(shaftGeo, shaftMat);
    shaft.castShadow = true;
    // 柄はこする人の側（横）へ倒し、少し手前へ傾ける
    shaft.rotation.set(0.3, 0, side * 0.6);
    holder.add(pad, shaft);
    brushes.add(holder);
    return holder;
  });

  // ---------- 色 ----------
  const applyPalette = (p: Palette) => {
    const sky = new Color(p.dark ? 0x141a26 : 0xe6ebf2);
    scene.background = sky;
    scene.fog = new Fog(sky, 30, 75);
    floorMat.color.set(p.dark ? 0x3a4352 : 0xd2dae5);
    hemi.intensity = p.dark ? 0.85 : 1.15;
    sun.intensity = p.dark ? 1.35 : 1.7;
    scene.environmentIntensity = p.dark ? 0.6 : 0.85;
    for (const s of stones) if (s.seat !== null) paintStone(s, s.seat);
  };
  applyPalette(initial);

  // ---------- 描く ----------
  let width = 1;
  let height = 1;
  let mode: ViewMode = "aim";
  let focus = { x: 0, y: 0 };
  const current: Pose = poseOf("aim", focus, 1);
  let raf = 0;
  let dirty = true;
  let lastTime = 0;
  let disposed = false;
  /** 描くのにかかった時間の記録（遅ければピクセル比を下げる） */
  let slowFrames = 0;
  let measured = 0;

  const apply = () => {
    camera.position.copy(current.pos);
    camera.fov = current.fov;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.lookAt(current.target);
  };

  /** カメラを目標へ近づける。まだ動いているなら true */
  const stepCamera = (dt: number): boolean => {
    const goal = poseOf(mode, focus, width / height);
    const rate = mode === "follow" ? 4.2 : 2.6;
    const k = 1 - Math.exp(-rate * dt);
    current.pos.lerp(goal.pos, k);
    current.target.lerp(goal.target, k);
    current.fov += (goal.fov - current.fov) * k;
    apply();
    return current.pos.distanceTo(goal.pos) > 0.003 || current.target.distanceTo(goal.target) > 0.003 || Math.abs(goal.fov - current.fov) > 0.02;
  };

  const frame = (now: number) => {
    raf = 0;
    if (disposed) return;
    const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;
    const moving = stepCamera(dt);
    renderer.render(scene, camera);
    dirty = false;
    // 動かし続けているのに 40 fps を切ることが多ければ、ピクセル比を少しずつ下げる
    if (moving) {
      measured++;
      if (dt > 1 / 40) slowFrames++;
      if (measured >= 45) {
        if (slowFrames > 20 && pixelRatio > 1) {
          pixelRatio = Math.max(1, pixelRatio - 0.25);
          renderer.setPixelRatio(pixelRatio);
          renderer.setSize(width, height, false);
        }
        measured = slowFrames = 0;
      }
    }
    if (moving || dirty) raf = requestAnimationFrame(frame);
    else lastTime = 0;
  };

  const invalidate = () => {
    dirty = true;
    if (!raf && !disposed) raf = requestAnimationFrame(frame);
  };

  // iOS は裏に回ると WebGL を手放すことがある。戻ってきたら描き直す
  const onLost = (e: Event) => e.preventDefault();
  const onRestored = () => invalidate();
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  apply();

  return {
    resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      renderer.setSize(width, height, false);
      apply();
      invalidate();
    },

    setPalette(p) {
      const darkChanged = p.dark !== palette.dark;
      palette = p;
      if (darkChanged) {
        const old = iceTex;
        iceTex = iceTexture(p.dark);
        setIceTexture(iceTex);
        old.dispose();
      }
      applyPalette(p);
      invalidate();
    },

    setStones(list) {
      const byId = new Map(list.map((s) => [s.id, s]));
      stones.forEach((mesh, id) => {
        const s = byId.get(id);
        if (!s || s.opacity <= 0.001) {
          mesh.group.visible = false;
          return;
        }
        if (mesh.seat !== s.seat) paintStone(mesh, s.seat);
        mesh.group.visible = true;
        mesh.group.position.copy(v3(s.x, 0, s.y));
        mesh.group.rotation.y = s.angle;
        mesh.ring.visible = !!s.counts && s.opacity > 0.5;
        setOpacity(mesh, s.opacity);
      });
      invalidate();
    },

    setAim(a) {
      dots.visible = arrow.visible = !!a;
      if (a) {
        const c = seatColor(a.seat);
        dotMat.color.copy(c);
        arrowMat.color.copy(c);
        // 点線：石の少し先から、ねらう向きにまっすぐ。強いほど長い
        const len = 1.6 + a.power * 4.4;
        const gap = 0.3;
        const n = Math.min(DOTS, Math.floor(len / gap));
        for (let i = 0; i < DOTS; i++) {
          const d = 0.42 + i * gap;
          const visible = i < n;
          tmp.position.copy(v3(Math.sin(a.aim) * d, 0.0025, Math.cos(a.aim) * d));
          // 先の方ほど小さく
          const s = visible ? 1 - (0.45 * i) / Math.max(1, n) : 0.0001;
          tmp.scale.set(s, 1, s);
          tmp.updateMatrix();
          dots.setMatrixAt(i, tmp.matrix);
        }
        dots.instanceMatrix.needsUpdate = true;
        // 矢印は時計回りの形。左回りなら裏返す
        arrow.scale.set(a.spin === 1 ? 1 : -1, 1, 1);
      }
      invalidate();
    },

    setSweep(sw) {
      brushes.visible = !!sw;
      if (sw) {
        shaftMat.color.copy(seatColor(sw.seat));
        brushes.position.copy(v3(sw.x, 0, sw.y));
        brushes.rotation.y = -sw.heading;
        // 左右にすばやく揺らす。こすりが強いほど大きく
        const t = performance.now() / 1000;
        brushParts.forEach((holder, k) => {
          const { ahead, phase } = BRUSHES[k]!;
          holder.position.set(Math.sin(t * Math.PI * 2 * 4.5 + phase) * 0.13 * (0.4 + 0.6 * sw.level), 0, -ahead);
        });
      }
      invalidate();
    },

    setView(m, f, instant) {
      mode = m;
      if (f) focus = { x: f.x, y: f.y };
      if (m === "follow") shadowAt(focus.x, focus.y + 1.5);
      else if (m === "house") shadowAt(0, (BACK_Y + Math.min(TEE_Y - 2.7, focus.y - 0.75)) / 2);
      else shadowAt(0, 1.2);
      if (instant) {
        const goal = poseOf(mode, focus, width / height);
        current.pos.copy(goal.pos);
        current.target.copy(goal.target);
        current.fov = goal.fov;
        apply();
      }
      invalidate();
    },

    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      iceTex.dispose();
      for (const d of owned) d.dispose();
      dots.dispose();
      renderer.dispose();
      // iOS は同時に持てる WebGL の数が少ないので、すぐに手放す
      renderer.forceContextLoss();
    },
  };
}
