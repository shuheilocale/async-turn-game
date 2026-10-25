import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Arena, softDot, type Theme } from "./arena.ts";
import { bodyOf, lerpBody, NEUTRAL_STATS, type BodyDims } from "./body.ts";
import { Effects, Trail } from "./effects.ts";
import { clamp, damp, easings } from "./math.ts";
import { basePoseOf, buildExchange, distOf, powerOf, sampleTrack, type Exchange, type Impact, type Position, type Side } from "./moves.ts";
import { addPose, lerpPose, mirrorPose, newPose, P, type Pose } from "./pose.ts";
import { createKit, FighterRig, NO_CUES, type Kit, type RigCues } from "./rig.ts";
import { breathRate, breathWave, fatigueOf, idleDelta, rhythmOf, tiredPose } from "./stances.ts";
import { StageFx } from "./fx.ts";
import { LASER_REACH, performOf, ROCKET_RETURN } from "./special.ts";
import type { Fx } from "./track.ts";
import type { FighterLook, FighterStageProps, StageEvent, StyleId } from "./types.ts";

/**
 * 3D の舞台の本体（three を使うところ）。FighterStage から dynamic import で読み込む。
 * createStage で描きはじめ、update で props を渡し、setActive で描くのを止めたり再開したりする
 */

export interface StageHandle {
  update(props: FighterStageProps): void;
  /** 画面に見えているか。見えていないあいだは描かない */
  setActive(active: boolean): void;
  dispose(): void;
}

export interface StageOptions {
  reduceMotion: boolean;
  /** WebGL の描画先を失って戻らなかったとき（2D の舞台に切りかえる） */
  onLost?(): void;
}

/** 肌の色（seat ごとに少し変える） */
const SKIN = ["#c8946f", "#a8714f"] as const;
/** 見た目が切り替わる動きの長さ */
const SWAP = 0.6;
/** 画面の左手前と右奥を結ぶ線の傾き */
const AXIS = 0.2;
/** 2 人を結ぶ線の向きと、カメラのある側（線に直交する向きから、少し自分の背中のほうへ回す） */
const AX = new THREE.Vector3(Math.cos(AXIS), 0, -Math.sin(AXIS));
const NORMAL = new THREE.Vector3(Math.sin(AXIS), 0, Math.cos(AXIS)).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.22);
/** 体格が変わるときに、半分近づくまでの時間 */
const BODY_HALF_LIFE = 0.09;

const ROT_FIELDS: number[] = [];
for (const at of [P.hipRot, P.spine, P.chest, P.neck, P.fist, P.fist + 3, P.footRot, P.footRot + 3]) ROT_FIELDS.push(at, at + 1, at + 2);
/** 角度を ref の ±π に収める（ひと回りした技のあとを、逆回りせずに戻すため） */
function wrapNear(p: Pose, ref: Pose) {
  for (const i of ROT_FIELDS) {
    const d = p[i]! - ref[i]!;
    p[i] = ref[i]! + d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
  }
}

const sameLook = (a: FighterLook | null, b: FighterLook | null) => (a === null || b === null ? a === b : a.style === b.style && a.seat === b.seat);

class Actor {
  readonly rig: FighterRig;
  look: FighterLook | null = null;
  /** 見えている見た目（切り替えの途中は前のまま） */
  shown: FighterLook | null = null;
  inited = false;
  dims: BodyDims = bodyOf(NEUTRAL_STATS);
  target: BodyDims = this.dims;
  dimsMoving = true;
  dimsVersion = 0;
  breath = Math.random() * 6;
  beat = Math.random() * 6;
  time = Math.random() * 10;
  hp = 100;
  fatigue = 0;
  koLatched = false;
  hpAtKo = 0;
  bodyKey = "";
  /** stats が変わったときの、力を入れる小さな動き（1 → 0） */
  flex = 0;
  swap: { t: number; applied: boolean; next: FighterLook | null } | null = null;
  /** 構えの切り替え（前の構えから、ゆっくり新しい構えへ） */
  fadeFrom: Pose | null = null;
  fadeT = 0;
  fadeLen = 0.6;
  dip = 0;
  private baseKey = "";
  private baseCache: Pose = newPose();
  readonly shownBase = newPose();
  readonly pose = newPose();
  private readonly idle = newPose();
  idleW = 1;
  fading: { pose: Pose; w: number; t: number }[] = [];
  readonly world = new THREE.Vector3();
  yaw = 0;
  placed = false;
  mirror = false;
  glow = 0;
  /** 技に合わせて変えている見た目 */
  cues: RigCues = NO_CUES;

  constructor(
    kit: Kit,
    readonly seat: 0 | 1,
  ) {
    this.rig = new FighterRig(kit);
  }

  get style(): StyleId | null {
    return this.shown?.style ?? null;
  }

  side(): Side {
    return { d: this.dims, style: this.style, base: this.shownBase, mirror: this.mirror };
  }

  /** いまの位置関係での構え（左足前の向き）。入力が変わったときだけ作り直す */
  base(position: Position, role: "top" | "bottom" | null, dist: number, downed: boolean): Pose {
    const tired = Math.round(this.fatigue * 50) / 50;
    const kind = `${this.style}|${position}|${role}|${downed}|${this.mirror}`;
    const key = `${kind}|${dist.toFixed(3)}|${tired}|${this.dimsVersion}`;
    if (key !== this.baseKey) {
      if (this.baseKind && kind !== this.baseKind && !this.snapNext) {
        // 構えが変わった：いま見えている構えから、ゆっくり移る
        this.fadeFrom = Float64Array.from(this.shownBase);
        this.fadeT = 0;
      }
      if (kind !== this.baseKind && this.snapNext) this.fadeFrom = null;
      this.baseKey = key;
      this.baseKind = kind;
      const side: Side = { d: this.dims, style: this.style, base: this.baseCache, mirror: this.mirror };
      let p = basePoseOf(side, position, role, dist, downed);
      if (!downed && position !== "ground") p = tiredPose(p, this.dims, tired);
      this.baseCache = p;
    }
    // 技の最後の姿勢と同じ構えに切りかえるときは、ゆっくり移らない（そのコマだけ）
    this.snapNext = false;
    return this.baseCache;
  }
  /** 次の構えの切り替えを、ゆっくりでなくすぐにする（技の最後の姿勢と同じとき） */
  snapNext = false;
  private baseKind = "";

  /** 技の姿勢を入れておく場所（コマごとに作らない） */
  readonly clipPoses: Pose[] = [];
  readonly clipW: number[] = [];
  clipCount = 0;
  pushClip(track: Exchange["clips"][number]["track"], t: number, wrapTo: Pose | null) {
    const i = this.clipCount;
    if (!this.clipPoses[i]) this.clipPoses[i] = newPose();
    const out = this.clipPoses[i]!;
    const w = sampleTrack(track, t, out);
    if (w <= 0) return;
    if (wrapTo) wrapNear(out, wrapTo);
    this.clipW[i] = w;
    this.clipCount++;
  }

  /** 構え・技・息づかいを重ねて、骨に当てる */
  compose(base: Pose, dt: number, energy: number, lying: boolean) {
    // 構えの切り替え
    if (this.fadeFrom) {
      this.fadeT += dt;
      const u = clamp(this.fadeT / this.fadeLen, 0, 1);
      lerpPose(this.fadeFrom, base, easings.inOut(u), this.shownBase);
      this.shownBase[P.hip + 1] = this.shownBase[P.hip + 1]! - this.dip * Math.sin(Math.PI * u);
      if (u >= 1) this.fadeFrom = null;
    } else this.shownBase.set(base);
    this.pose.set(this.shownBase);
    let w = 0;
    for (let i = 0; i < this.clipCount; i++) {
      lerpPose(this.pose, this.clipPoses[i]!, this.clipW[i]!, this.pose);
      w = Math.max(w, this.clipW[i]!);
    }
    // 技が終わったあと、構えへなめらかに戻る
    this.fading = this.fading.filter((f) => {
      f.t += dt;
      const k = f.w * (1 - easings.inOut(clamp(f.t / 0.4, 0, 1)));
      lerpPose(this.pose, f.pose, k, this.pose);
      w = Math.max(w, k);
      return f.t < 0.4;
    });
    this.idleW = damp(this.idleW, 1 - 0.85 * w, 0.07, dt);
    idleDelta(this.style, this.breath, this.beat, this.time, this.fatigue, energy, lying, this.idle);
    addPose(this.pose, this.idle, this.idleW);
    if (this.flex > 0) {
      this.flex = Math.max(0, this.flex - dt / 0.45);
      const k = Math.sin(Math.PI * (1 - this.flex));
      this.pose[P.hip + 1] = this.pose[P.hip + 1]! - 0.016 * k;
      this.pose[P.shrug] = this.pose[P.shrug]! + 0.014 * k;
      this.pose[P.shrug + 1] = this.pose[P.shrug + 1]! + 0.014 * k;
      this.pose[P.breath] = this.pose[P.breath]! + 0.8 * k;
    }
    if (this.mirror) mirrorPose(this.pose, this.pose);
    this.rig.applyPose(this.pose, this.dims);
  }

  sampleInto(track: Exchange["clips"][number]["track"], t: number) {
    const pose = newPose();
    const w = sampleTrack(track, t, pose);
    return { pose, w };
  }

  dispose() {
    this.rig.dispose();
  }
}

interface Playing {
  id: number;
  ex: Exchange;
  t: number;
  fired: boolean[];
  /** 動きに合わせた効果・頭の上の印を出したか */
  fxFired: boolean[];
  marksFired: boolean[];
  /** 続く効果の、次に粒を出すまでの時間 */
  fxAcc: number[];
  switched: boolean;
  downed: boolean;
  timer: ReturnType<typeof setTimeout>;
  /** 安全のためのタイマーが、前に見たときの再生の時刻 */
  checked: number;
}

export function createStage(host: HTMLElement, overlay: HTMLElement, options: StageOptions): StageHandle {
  // 開発中に動きをゆっくり再生して確かめるための速さ
  const debug = { timeScale: 1, pending: 0, orbit: null as number | null };
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "default" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  const canvas = renderer.domElement;
  canvas.className = "fs-canvas";
  host.prepend(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 60);
  const arena = new Arena();
  scene.add(arena.group);
  const kit = createKit();
  const actors = [new Actor(kit, 0), new Actor(kit, 1)] as const;
  for (const a of actors) scene.add(a.rig.root);
  const effects = new Effects(overlay, camera);
  scene.add(effects.group);
  const sfx = new StageFx(camera);
  scene.add(sfx.group);
  // 技を出す手足の軌跡（1 人に 1 本）
  const trails = actors.map(() => {
    const t = new Trail(camera);
    scene.add(t.mesh);
    return t;
  });

  // 足もとのやわらかい影（光の影とは別に、床との接地を見せる）
  const blobTex = softDot("rgba(0,0,0,0.55)", "rgba(0,0,0,0)", 128);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, fog: false });
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobs = actors.map(() => {
    const m = new THREE.Mesh(blobGeo, blobMat);
    m.position.y = 0.004;
    m.renderOrder = 1;
    scene.add(m);
    return m;
  });

  let props: FighterStageProps = { fighters: [null, null], mode: "custom" };
  let active = true;
  let disposed = false;
  let running = false;
  let raf = 0;
  let last = performance.now();
  // 位置関係（攻防のあとに変わる）
  let position: Position = "standing";
  let top: 0 | 1 = 0;
  let dist = distOf("standing");
  let playing: Playing | null = null;
  let lastEventId: number | null = null;
  const done = new Set<number>();
  // カメラ
  const camPos = new THREE.Vector3(0, 1.2, 5);
  const camLook = new THREE.Vector3(0, 1, 0);
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  let camInit = false;
  let orbit = 0;
  let shake = 0;
  let hitStop = 0;
  let focusBoost = 0;
  const focusAt = new THREE.Vector3();
  let theme: Theme = { dark: false, p0: "#2b59f0", p1: "#f27a12", bg: "#e8ebf1" };
  let leftSeat: 0 | 1 = 0;
  // 端末が重いときは、描く細かさ（ピクセル比）を下げる
  let slowFrames = 0;
  const tv = new THREE.Vector3();
  const tv2 = new THREE.Vector3();
  const tv3 = new THREE.Vector3();

  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  function readTheme() {
    const css = getComputedStyle(host);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const dark = !!media?.matches;
    theme = {
      dark,
      p0: v("--p0", dark ? "#6d8cff" : "#2b59f0"),
      p1: v("--p1", dark ? "#ff9b3d" : "#f27a12"),
      bg: v("--bg", dark ? "#0f121a" : "#e8ebf1"),
    };
    arena.setTheme(theme, leftSeat, scene);
    for (const a of actors) {
      a.rig.silhouetteMaterial.color.set(theme.dark ? "#262c3b" : "#3a4254");
      if (a.inited) a.rig.setLook(a.style, colorsOf(a), a.shown === null);
      paintRim(a);
    }
  }
  const onTheme = () => readTheme();
  media?.addEventListener?.("change", onTheme);

  const colorsOf = (a: Actor) => ({ seat: (a.shown?.seat ?? a.seat) === 0 ? theme.p0 : theme.p1, skin: SKIN[a.seat] });
  const rimColor = new THREE.Color();
  /** 輪郭の光をその人の色にする（まだ決まっていない人は青みの灰色） */
  function paintRim(a: Actor) {
    rimColor.set(a.shown ? colorsOf(a).seat : "#8a97b8");
    a.rig.setRim(rimColor, theme.dark ? 0.6 : 0.34);
  }

  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  readTheme();

  // ---- 見た目 ----

  function setLook(a: Actor, look: FighterLook | null) {
    a.look = look;
    const s = look?.stats ?? NEUTRAL_STATS;
    const key = `${look?.style ?? "-"}|${s.power}|${s.guard}|${s.speed}|${s.stamina}`;
    if (key !== a.bodyKey) {
      // stats だけが変わったときは、体に力を入れるように少し沈む
      if (a.inited && a.bodyKey.split("|")[0] === key.split("|")[0] && !options.reduceMotion) a.flex = 1;
      a.bodyKey = key;
      a.target = bodyOf(s, look?.style ?? null);
      a.dimsMoving = true;
    }
    if (!a.inited) {
      a.inited = true;
      a.shown = look;
      a.dims = a.target;
      a.rig.setLook(look?.style ?? null, colorsOf(a), look === null);
      a.rig.setBody(a.dims);
      paintRim(a);
      return;
    }
    if (!sameLook(look, a.swap ? a.swap.next : a.shown)) {
      // ふっと切り替わる：少し沈んで光り、そのあいだに服と構えが変わる
      a.swap = { t: 0, applied: false, next: look };
      if (props.mode === "custom" && !options.reduceMotion) effects.ripple(a.world, look ? (look.seat === 0 ? theme.p0 : theme.p1) : "#8892a8");
    }
  }

  // ---- 攻防の再生 ----

  const roleOf = (seat: 0 | 1): "top" | "bottom" | null => (position === "ground" ? (seat === top ? "top" : "bottom") : null);
  const isDowned = (a: Actor) => {
    if (a.koLatched) return true;
    if (a.hp > 0) return false;
    // KO の攻防の途中は、倒れる動きが終わるまで倒れた姿勢にしない
    if (playing?.ex.ko?.who === a.seat && !playing.downed) return false;
    return true;
  };

  function start(ev: StageEvent) {
    if (playing) finish();
    const sides: [Side, Side] = [actors[0].side(), actors[1].side()];
    // 攻防の段取りは、いまの構え（疲れを含む）から作る
    for (const s of [0, 1] as const) sides[s] = { ...sides[s], base: Float64Array.from(actors[s].base(position, roleOf(s), dist, isDowned(actors[s]))) };
    const ex = buildExchange(ev, { sides, position, top, dist });
    playing = {
      id: ev.id,
      ex,
      t: 0,
      fired: ex.impacts.map(() => false),
      fxFired: ex.fx.map(() => false),
      marksFired: ex.marks.map(() => false),
      fxAcc: ex.fx.map(() => 0),
      switched: false,
      downed: false,
      // 画面の外にあって描いていないときも、攻防は終わらせる
      timer: setTimeout(function check() {
        // 描いているあいだは、再生が進んでいれば待つ（止まっていれば終わらせる）
        const p = playing;
        if (!p || p.id !== ev.id) return;
        if (running && p.t > p.checked + 0.05 && p.t < p.ex.end) {
          p.checked = p.t;
          p.timer = setTimeout(check, (p.ex.end - p.t + 0.8) * 1000);
        } else finish();
      }, (ex.end + 1.2) * 1000),
      checked: 0,
    };
    focusBoost = 0;
  }

  function finish() {
    const p = playing;
    if (!p) return;
    clearTimeout(p.timer);
    playing = null;
    if (!p.switched) applySwitch(p);
    if (p.ex.ko && !p.downed) {
      const a = actors[p.ex.ko.who];
      a.koLatched = true;
      a.hpAtKo = a.hp;
      a.snapNext = true;
      p.downed = true;
    }
    // 終わりで止まっている技の姿勢は、構えへなめらかに戻す
    for (const a of actors) {
      const base = a.base(position, roleOf(a.seat), dist, isDowned(a));
      for (const c of p.ex.clips) {
        if (c.who !== a.seat || c.start > p.t) continue;
        const last = c.track.keys[c.track.keys.length - 1]!;
        // 位置関係が変わる前に終わった技は、新しい構えと同じ姿勢で終わっているので戻さない
        if (last.w <= 0 || c.start + c.track.end <= p.ex.switchAt + 1e-6) continue;
        const s = a.sampleInto(c.track, Math.min(p.t - c.start, c.track.end));
        if (s.w <= 0) continue;
        wrapNear(s.pose, base);
        a.fading.push({ pose: s.pose, w: s.w, t: 0 });
      }
    }
    if (!done.has(p.id)) {
      done.add(p.id);
      props.onEventDone?.(p.id);
    }
  }

  function syncPosition(pos: Position, tp: 0 | 1) {
    if (pos === position && (pos !== "ground" || tp === top)) return;
    for (const a of actors) a.snapNext = true;
    position = pos;
    top = tp;
    dist = distOf(pos, [actors[0].side(), actors[1].side()]);
  }

  function applySwitch(p: Playing) {
    p.switched = true;
    if (p.ex.position !== position || p.ex.top !== top) for (const a of actors) a.snapNext = true;
    position = p.ex.position;
    top = p.ex.top;
    dist = p.ex.dist;
  }

  function fire(imp: Impact) {
    const def = actors[imp.target];
    const at = imp.zone === "head" ? def.rig.worldOf("head", tv) : imp.zone === "legs" ? def.rig.worldOf("hip", tv).setY(0.5) : def.rig.worldOf("chest", tv);
    const k = powerOf(imp.damage);
    const reduce = options.reduceMotion;
    if (imp.kind === "perform" && performOf(actors[imp.by].style) === "laser" && (imp.result === "hit" || imp.result === "countered")) {
      // ロボットのレーザー：光の線が当たった所が光り、少しゆれる（火花は光の線のほうで出す）
      effects.flash(at, "#ffe9e9", imp.by === 0 ? theme.p0 : theme.p1, k);
      shake = reduce ? 0 : 0.012 * k;
      if (imp.damage > 0) effects.number(def.rig.worldOf("head", tv2).add(tv3.set(0, 0.26, 0)), `${imp.damage}`, imp.by, imp.damage >= 15);
      focusAt.copy(at);
      focusBoost = 0.8;
      return;
    }
    if (imp.kind === "perform") {
      // 触れずに見せる技：火花やゆれはなく、相手のまわりに小さなきらめきだけ
      if (imp.result === "hit" || imp.result === "countered") {
        sparkle(def.rig.worldOf("head", tv2), 5, imp.by === 0 ? theme.p0 : theme.p1, 0.22);
        if (imp.damage > 0) effects.number(def.rig.worldOf("head", tv2).add(tv3.set(0, 0.26, 0)), `${imp.damage}`, imp.by, imp.damage >= 15);
      }
      focusAt.copy(at);
      focusBoost = 0.6;
      return;
    }
    if (imp.result === "hit" || imp.kind === "counter") {
      effects.flash(at, imp.zone === "grab" ? "#ffe2b0" : "#ffd96e", imp.by === 0 ? theme.p0 : theme.p1, k);
      if (!reduce && imp.zone !== "grab") {
        const dir = tv2.subVectors(def.rig.worldOf("chest", new THREE.Vector3()), actors[imp.by].rig.worldOf("chest", new THREE.Vector3())).setY(0.3).normalize();
        effects.burst(at, dir, Math.round(6 + 6 * k), theme.dark ? "#fff2d8" : "#ffffff");
      }
      shake = reduce ? 0 : 0.022 * k;
      hitStop = reduce ? 0 : 0.045 + 0.035 * k;
      if (imp.damage > 0) effects.number(def.rig.worldOf("head", tv2).add(tv3.set(0, 0.26, 0)), `${imp.damage}`, imp.by, imp.damage >= 15);
    } else if (imp.result === "blocked") {
      effects.flash(at, "#d9e6ff", "#9fb8e8", 0.5);
      shake = reduce ? 0 : 0.008;
      hitStop = reduce ? 0 : 0.03;
    }
    focusAt.copy(at);
    focusBoost = 1;
  }

  /** 攻防の時計を進める。進んだ時間（当たった瞬間は止まる）を返す */
  function stepExchange(dt: number): number {
    const p = playing;
    if (!p) return dt;
    if (hitStop > 0) {
      hitStop -= dt;
      dt *= 0.08;
    }
    // KO の瞬間は少しゆっくり
    if (p.ex.ko && p.t > p.ex.ko.at && p.t < p.ex.ko.at + 0.5 && !options.reduceMotion) dt *= 0.55;
    p.t += dt;
    p.ex.impacts.forEach((imp, i) => {
      if (!p.fired[i] && p.t >= imp.at) {
        p.fired[i] = true;
        fire(imp);
      }
    });
    p.ex.fx.forEach((f, i) => {
      if (!p.fxFired[i] && p.t >= f.at) {
        p.fxFired[i] = true;
        startFx(f);
      }
    });
    p.ex.marks.forEach((m, i) => {
      if (p.marksFired[i] || p.t < m.at) return;
      p.marksFired[i] = true;
      const head = actors[m.who].rig.worldOf("head", tv).add(tv2.set(0, 0.3, 0));
      if (m.heal) effects.heal(head, m.heal);
      else if (m.stat && m.dir) {
        const n = p.ex.marks.slice(0, i).filter((x) => x.who === m.who && x.stat).length;
        effects.buff(head, m.stat, m.dir, n);
      }
    });
    if (!p.switched && p.t >= p.ex.switchAt) applySwitch(p);
    if (p.ex.ko && !p.downed && p.t >= p.ex.ko.downAt) {
      p.downed = true;
      const a = actors[p.ex.ko.who];
      a.koLatched = true;
      a.hpAtKo = a.hp;
      a.snapNext = true;
      shake = options.reduceMotion ? 0 : 0.02;
    }
    if (p.ex.ko && p.t >= p.ex.ko.at + 0.35 && p.t - dt < p.ex.ko.at + 0.35) effects.banner("K.O.");
    if (p.t >= p.ex.end) finish();
    return dt;
  }

  // ---- 新しい技の効果 ----

  const seatColor = (who: 0 | 1) => ((actors[who].shown?.seat ?? who) === 0 ? theme.p0 : theme.p1);
  /** 骨の左右（左右を入れかえて描く人は、手の左右も入れかわる） */
  const boneSide = (a: Actor, side: 0 | 1 | undefined): 0 | 1 => ((a.mirror ? 1 - (side ?? 1) : (side ?? 1)) as 0 | 1);
  const tvA = new THREE.Vector3();
  const tvB = new THREE.Vector3();
  const tvC = new THREE.Vector3();
  const rnd = (k: number) => (Math.random() - 0.5) * k;

  /** at のまわりに、きらめきを count 個 */
  function sparkle(at: THREE.Vector3, count: number, color: string, r = 0.3) {
    if (options.reduceMotion) count = Math.ceil(count / 2);
    for (let i = 0; i < count; i++) {
      const p = tvC.copy(at).add(tvB.set(rnd(r * 2), rnd(r * 1.6), rnd(r * 2)));
      sfx.spawn("star", p, tvB.set(0, 0.25, 0), { color: i % 2 ? "#ffffff" : color, size: 0.09 + Math.random() * 0.07, life: 0.55 + Math.random() * 0.25, spin: rnd(6) });
    }
  }

  /** a から相手のほうへの向き（水平） */
  function towardFoe(f: Fx, out: THREE.Vector3) {
    return out.subVectors(actors[f.target].world, actors[f.who].world).setY(0).normalize();
  }

  function startFx(f: Fx) {
    const a = actors[f.who];
    const color = seatColor(f.who);
    switch (f.type) {
      case "shot": {
        const def = actors[f.target];
        const side = boneSide(a, f.side);
        const from = a.rig.strikePoint("hand", side, new THREE.Vector3());
        if (f.shot === "orb") from.lerp(a.rig.strikePoint("hand", (1 - side) as 0 | 1, tvA), 0.5).add(towardFoe(f, tvB).multiplyScalar(0.08));
        const to = def.rig.worldOf("chest", new THREE.Vector3());
        // 空振りは相手の横を通す
        if (f.result === "whiff") to.add(tvB.set(-AX.z, 0.12, AX.x).multiplyScalar(0.3));
        const home = f.shot === "rocket" ? () => a.rig.strikePoint("hand", side, tvA) : null;
        sfx.launch(f.shot ?? "orb", from, to, f.until - f.at, f.result, color, home, ROCKET_RETURN);
        if (f.shot === "cards") sparkle(from, 3, color, 0.08);
        break;
      }
      case "ghost":
        // 分身：いまの姿を、その人の色を明るくした半透明の残像として残す
        sfx.ghost(a.rig.root, `#${glowColor.set(color).lerp(white, 0.35).getHexString()}`);
        break;
      case "smoke": {
        // 煙：体のまわりにもくもくと広がる（忍者の煙玉は白く、足もとから立つ）
        const ninja = a.style === "ninja";
        const at = a.rig.worldOf("hip", tvA).add(tvB.set(0, ninja ? 0.05 : 0.25, 0));
        const n = options.reduceMotion ? 7 : ninja ? 18 : 15;
        for (let i = 0; i < n; i++) {
          const p = tvC.copy(at).add(tvB.set(rnd(0.5), rnd(1.0), rnd(0.5)));
          sfx.spawn("smoke", p, tvB.set(rnd(0.6), 0.25 + Math.random() * 0.3, rnd(0.6)), {
            color: ninja ? (i % 3 ? "#eceef2" : "#d4d8e0") : theme.dark ? "#a3abbd" : i % 3 ? "#b7bdca" : "#d3d7e0",
            size: 0.38 + Math.random() * 0.26,
            life: 0.7 + Math.random() * 0.4,
            grow: 0.9,
            spin: rnd(1.5),
            alpha: 0.92,
          });
        }
        sparkle(at, 4, color, 0.35);
        break;
      }
      case "sparkle":
        sparkle(a.rig.worldOf("head", tvA).add(tvB.set(0, -0.15, 0)), 9, color, 0.35);
        break;
      case "palm": {
        const hand = a.rig.strikePoint("hand", boneSide(a, f.side), tvA);
        effects.flash(hand, "#fff4c9", color, 0.6);
        break;
      }
      default:
        break;
    }
  }

  /** 続く効果（ハート・音符・光の枠・回復の光・湯気・再起動）。u は 0〜1 の進み */
  function sustainFx(f: Fx, i: number, u: number, dt: number) {
    const p = playing!;
    const a = actors[f.who];
    const color = seatColor(f.who);
    const env = Math.min(1, u * 6, (1 - u) * 5);
    const every = (sec: number) => {
      p.fxAcc[i]! -= dt;
      if (p.fxAcc[i]! > 0) return false;
      p.fxAcc[i] = (options.reduceMotion ? sec * 2 : sec) * (0.7 + Math.random() * 0.6);
      return true;
    };
    switch (f.type) {
      case "hearts": {
        if (!every(0.07)) break;
        const dir = towardFoe(f, tvA);
        const from = a.rig.worldOf("head", tvB).addScaledVector(dir, 0.14);
        const v = tvC.copy(dir).multiplyScalar(1.0 + Math.random() * 0.5).add(tvA.set(rnd(0.5), 0.35 + Math.random() * 0.3, rnd(0.5)));
        const hue = ["#ff5fa2", color, "#ffd0e4"][Math.floor(Math.random() * 3)]!;
        sfx.spawn("heart", from, v, { color: hue, size: 0.1 + Math.random() * 0.06, life: 0.85, sway: 0.4, spin: rnd(2) });
        break;
      }
      case "notes": {
        if (!every(0.1)) break;
        const dir = towardFoe(f, tvA);
        const from = a.rig.worldOf("head", tvB).addScaledVector(dir, 0.16).add(tvC.set(0, -0.06, 0));
        const v = tvC.copy(dir).multiplyScalar(0.9 + Math.random() * 0.4).add(tvA.set(rnd(0.4), 0.3 + Math.random() * 0.3, rnd(0.4)));
        sfx.spawn("note", from, v, { color: Math.random() < 0.5 ? color : theme.dark ? "#ffffff" : "#2a2f3c", size: 0.11 + Math.random() * 0.05, life: 1.0, sway: 0.6, spin: rnd(1.5), additive: false });
        break;
      }
      case "frame": {
        const dir = towardFoe(f, tvA);
        const at = a.rig.worldOf("chest", tvB).addScaledVector(dir, 0.34).add(tvC.set(0, 0.16, 0));
        sfx.showFrame(at, env, color);
        if (every(0.06)) sfx.spawn("pixel", tvC.copy(at).add(tvA.set(rnd(0.5), rnd(0.3), rnd(0.2))), tvA.set(0, 0.15, 0), { color: Math.random() < 0.5 ? color : "#ffffff", size: 0.03, life: 0.35, additive: true });
        break;
      }
      case "palm": {
        if (!every(0.045)) break;
        const hand = a.rig.strikePoint("hand", boneSide(a, f.side), tvB);
        const v = towardFoe(f, tvA).multiplyScalar(1.6 + Math.random()).add(tvC.set(rnd(0.6), rnd(0.5), rnd(0.6)));
        sfx.spawn("star", hand, v, { color: Math.random() < 0.5 ? "#fff3c4" : color, size: 0.09, life: 0.5, spin: rnd(6) });
        break;
      }
      case "heal": {
        const chest = a.rig.worldOf("chest", tvB);
        sfx.showAura(chest, env, "#7dffb2");
        if (!every(0.05)) break;
        const hip = a.rig.worldOf("hip", tvA);
        const ang = Math.random() * Math.PI * 2;
        const at = tvC.set(hip.x + Math.cos(ang) * 0.3, hip.y - 0.3 + Math.random() * 0.9, hip.z + Math.sin(ang) * 0.3);
        sfx.spawn("orb", at, tvA.set(0, 0.5 + Math.random() * 0.4, 0), {
          color: theme.dark ? (Math.random() < 0.5 ? "#7dffb2" : "#d8ffe6") : Math.random() < 0.5 ? "#2fc274" : "#8fe8b6",
          size: 0.06 + Math.random() * 0.05,
          life: 0.8,
          additive: theme.dark,
        });
        break;
      }
      case "steam": {
        if (!every(0.12)) break;
        const at = a.rig.worldOf("head", tvA).addScaledVector(towardFoe(f, tvB), 0.16).add(tvC.set(rnd(0.08), -0.08, rnd(0.08)));
        sfx.spawn("smoke", at, tvB.set(rnd(0.1), 0.35, rnd(0.1)), { color: "#ffffff", size: 0.07, life: 0.9, grow: 1.4, alpha: 0.7, sway: 0.2 });
        break;
      }
      case "reboot": {
        // 後半に、足もとから頭へ光の輪が 2 本走る
        const k = clamp((u - 0.45) / 0.5, 0, 1);
        const hip = a.rig.worldOf("hip", tvA);
        const top = a.rig.worldOf("head", tvB).y + 0.15;
        const ys: [number, number] = [0.05 + (top - 0.05) * k, 0.05 + (top - 0.05) * clamp(k * 1.4 - 0.3, 0, 1)];
        sfx.showRings(hip, ys, u > 0.45 && u < 0.98 ? 1 : 0, colorsOf(a).seat);
        break;
      }
      case "laser": {
        // 目（バイザー）から相手の胸へ。かわされたら横を抜け、防がれたら手前で止まる
        const def = actors[f.target];
        const dir = towardFoe(f, tvA);
        const from = a.rig.worldOf("head", tvB).addScaledVector(dir, 0.13).add(tvC.set(0, 0.01, 0));
        const to = def.rig.worldOf("chest", laserTo).add(tvC.set(0, 0.08, 0));
        if (f.result === "dodged" || f.result === "whiff") to.addScaledVector(tvC.set(-dir.z, 0.25, dir.x), 0.35).addScaledVector(dir, 1.2);
        else if (f.result === "blocked") to.lerp(from, 0.12);
        const reach = clamp((p.t - f.at) / LASER_REACH, 0, 1);
        const k = Math.min(1, (1 - u) * 6);
        sfx.showLaser(from, to, reach, k, color);
        if (reach >= 1 && f.result !== "dodged" && f.result !== "whiff" && every(0.035))
          sfx.spawn("star", to, tvC.set(rnd(1.2), 0.4 + Math.random() * 0.8, rnd(1.2)), { color: Math.random() < 0.5 ? "#ffffff" : color, size: 0.06, life: 0.3, gravity: 3 });
        break;
      }
      case "horn": {
        // クラクションの音の波：右手から相手のほうへ、弧が広がりながら進む（画面の上で相手のほうへ開く向きにそろえる）
        if (!every(0.09)) break;
        const dir = towardFoe(f, tvA);
        const from = a.rig.strikePoint("hand", boneSide(a, 1), tvB).addScaledVector(dir, 0.1).add(tvC.set(0, 0.12, 0));
        const sx = tvC.copy(actors[f.target].world).applyMatrix4(camera.matrixWorldInverse).x - laserTo.copy(a.world).applyMatrix4(camera.matrixWorldInverse).x;
        sfx.spawn("wave", from, tvC.copy(dir).multiplyScalar(1.7).add(tvA.set(0, 0.15, 0)), {
          color: Math.random() < 0.6 ? color : theme.dark ? "#ffffff" : "#2a2f3c",
          size: 0.2,
          life: 0.6,
          grow: 2.8,
          rot: sx >= 0 ? 0 : Math.PI,
          additive: false,
        });
        break;
      }
      case "shake": {
        // シェイカーのしぶきと氷のきらめき（手のまわりに飛び散って落ちる）
        if (!every(0.05)) break;
        const hand = a.rig.strikePoint("hand", boneSide(a, 1), tvB).add(tvC.set(0, 0.12, 0));
        const ice = Math.random() < 0.35;
        sfx.spawn(ice ? "star" : "orb", hand, tvC.set(rnd(1.0), 0.5 + Math.random() * 0.6, rnd(1.0)), {
          color: ice ? "#ffffff" : Math.random() < 0.5 ? "#e8cfb0" : "#c99a6b",
          size: ice ? 0.06 : 0.04,
          life: 0.5,
          gravity: 3.5,
          additive: false,
        });
        break;
      }
      case "wisp": {
        // 印を結んだ手から、白い煙がゆらりと立ちのぼる
        if (!every(0.08)) break;
        const hands = a.rig.strikePoint("hand", 0, tvB).lerp(a.rig.strikePoint("hand", 1, tvC), 0.5);
        sfx.spawn("smoke", hands, tvC.set(rnd(0.15), 0.35, rnd(0.15)), { color: theme.dark ? "#cdd2dc" : "#eef0f4", size: 0.1, life: 0.8, grow: 1.6, alpha: 0.7, sway: 0.3 });
        break;
      }
      case "dust": {
        // 足もとの土ぼこり（後ろへ流れる）
        if (!every(0.035)) break;
        const back = towardFoe(f, tvA).multiplyScalar(-0.7);
        const foot = a.rig.strikePoint("foot", Math.random() < 0.5 ? 0 : 1, tvB).setY(0.05);
        sfx.spawn("smoke", foot, back.add(tvC.set(rnd(0.3), 0.25, rnd(0.3))), {
          color: theme.dark ? "#8d8573" : "#cdbfa6",
          size: 0.14,
          life: 0.55,
          grow: 1.6,
          alpha: 0.75,
        });
        break;
      }
      default:
        break;
    }
  }
  const laserTo = new THREE.Vector3();

  /** 攻防の効果のうち、体の見た目を変えるもの（消える・手を飛ばす・ウインク・包帯など）と、続く効果 */
  function cuesOf(a: Actor, dt: number): RigCues {
    const p = playing;
    if (!p) return NO_CUES;
    const c: RigCues = { ...NO_CUES };
    p.ex.fx.forEach((f, i) => {
      if (f.who !== a.seat || p.t < f.at || p.t >= f.until) return;
      const u = clamp((p.t - f.at) / Math.max(0.01, f.until - f.at), 0, 1);
      switch (f.type) {
        case "hide":
          c.hidden = true;
          break;
        case "detach":
          c.detached = boneSide(a, f.side);
          break;
        case "wink":
          c.wink = Math.min(1, u * 8, (1 - u) * 8);
          break;
        case "bandage":
          c.bandage = boneSide(a, f.side);
          break;
        case "spoon":
          c.spoon = boneSide(a, f.side);
          break;
        case "form":
          c.form = f.form ?? 0;
          break;
        case "held":
          c.held = boneSide(a, f.side);
          break;
        case "tray":
          c.tray = boneSide(a, f.side);
          break;
        case "ghost":
          // 一度きり（startFx で出す）
          break;
        case "reboot":
          // 目の光が消え、ちらついてから戻る
          c.lamp = u < 0.4 ? 0.05 : u < 0.62 ? (Math.sin(p.t * 70) > 0 ? 1 : 0.1) : 1;
          sustainFx(f, i, u, dt);
          break;
        default:
          sustainFx(f, i, u, dt);
      }
    });
    return c;
  }

  /** いまの攻防の、この人の技の姿勢を（重なる順に）入れる */
  function collectClips(a: Actor, base: Pose) {
    a.clipCount = 0;
    const p = playing;
    if (!p) return;
    for (const c of p.ex.clips) {
      if (c.who !== a.seat) continue;
      const local = p.t - c.start;
      if (local < 0) continue;
      if (local > c.track.end) {
        // 終わった技：最後の姿勢のまま止まるものだけ残す（位置関係が変わったあとは、新しい構えに任せる）
        const last = c.track.keys[c.track.keys.length - 1]!;
        if (last.w <= 0 || (p.switched && c.start + c.track.end <= p.ex.switchAt + 1e-6)) continue;
        a.pushClip(c.track, c.track.end, base);
      } else a.pushClip(c.track, local, null);
    }
  }

  // ---- 1 コマ ----

  function layout(dt: number) {
    const fight = props.mode === "fight";
    // 立ち技の間合いは、2 人の構え（手の出し方）と腕の長さで決める
    if (!playing && position === "standing") dist = distOf("standing", [actors[0].side(), actors[1].side()]);
    const focus = props.focus ?? 0;
    leftSeat = props.me ?? 0;
    arena.setCorners(theme, fight ? [leftSeat, leftSeat === 0 ? 1 : 0] : [focus, focus]);
    const ax = AX;
    for (const a of actors) {
      const left = a.seat === leftSeat;
      const visible = fight || a.seat === focus;
      a.rig.root.visible = visible;
      blobs[a.seat]!.visible = visible;
      let x = 0;
      let z = 0;
      let yaw = 0;
      if (fight) {
        const s = left ? -1 : 1;
        x = ax.x * (dist / 2) * s;
        z = ax.z * (dist / 2) * s;
        yaw = Math.atan2(-s * ax.x, -s * ax.z);
        a.mirror = !left;
      } else {
        // キャラ作り：真ん中で、胸がカメラのほうを向くように回す（半身の構えでも体の正面が見える）
        const turn = a.shownBase[P.hipRot + 1]! + a.shownBase[P.spine + 1]! + a.shownBase[P.chest + 1]!;
        yaw = -0.25 - turn * 0.5;
        a.mirror = false;
      }
      // 攻防で位置関係が変わったときはすぐに、それ以外はなめらかに動かす
      const snap = !a.placed || !!playing;
      a.world.x = snap ? x : damp(a.world.x, x, 0.12, dt);
      a.world.z = snap ? z : damp(a.world.z, z, 0.12, dt);
      a.yaw = snap ? yaw : damp(a.yaw, yaw, 0.12, dt);
      a.placed = true;
      a.rig.root.position.copy(a.world);
      a.rig.root.rotation.y = a.yaw;
    }
  }

  function updateActor(a: Actor, dt: number) {
    // 見た目の切り替え
    if (a.swap) {
      a.swap.t += dt;
      const u = a.swap.t / (options.reduceMotion ? SWAP * 0.5 : SWAP);
      if (!a.swap.applied && u >= 0.4) {
        a.swap.applied = true;
        a.shown = a.swap.next;
        a.rig.setLook(a.shown?.style ?? null, colorsOf(a), a.shown === null);
        paintRim(a);
        a.fadeLen = 0.55;
        a.dip = options.reduceMotion ? 0 : 0.03;
      }
      a.glow = Math.sin(Math.PI * clamp(u, 0, 1)) * (options.reduceMotion ? 0.1 : 0.22);
      if (u >= 1) {
        a.swap = null;
        a.glow = 0;
      }
      a.rig.setGlow(a.glow, glowColor.set(a.shown?.seat === 1 || (!a.shown && a.seat === 1) ? theme.p1 : theme.p0).lerp(white, 0.3));
    }
    // 体格をなめらかに寄せる
    if (a.dimsMoving) {
      const next = lerpBody(a.dims, a.target, 1 - Math.pow(2, -dt / BODY_HALF_LIFE));
      let diff = 0;
      for (const k of Object.keys(next) as (keyof BodyDims)[]) diff = Math.max(diff, Math.abs(next[k] - a.target[k]));
      a.dims = diff < 1e-4 ? a.target : next;
      if (diff < 1e-4) a.dimsMoving = false;
      a.dimsVersion++;
      a.rig.setBody(a.dims);
    }
    // 息・リズム・疲れ
    const hpRaw = props.hp?.[a.seat] ?? 100;
    if (a.koLatched && hpRaw > 0 && hpRaw !== a.hpAtKo) a.koLatched = false;
    a.hp = hpRaw;
    a.fatigue = damp(a.fatigue, fatigueOf(a.hp), 0.35, dt);
    a.breath += 2 * Math.PI * breathRate(a.dims.stamina, a.hp) * dt;
    a.beat += 2 * Math.PI * rhythmOf(a.style, a.dims.speed) * dt;
    a.time += dt;
  }
  const glowColor = new THREE.Color();
  const white = new THREE.Color("#ffffff");

  function updateCamera(dt: number) {
    const fight = props.mode === "fight";
    const reduce = options.reduceMotion;
    if (!fight) {
      const a = actors[props.focus ?? 0];
      orbit += dt;
      // ゆっくり回り込む（左右へ大きく振れる）。少し下から見上げる
      let az = reduce ? -0.45 : -0.4 + 0.6 * Math.sin((orbit / 22) * Math.PI * 2);
      if (import.meta.env.DEV && debug.orbit !== null) az = debug.orbit;
      const r = 3.95;
      wantLook.set(a.world.x, 0.92, a.world.z);
      wantPos.set(a.world.x + Math.sin(az) * r, 0.72, a.world.z + Math.cos(az) * r);
    } else {
      const ax = AX;
      const mid = tv.copy(actors[0].world).add(actors[1].world).multiplyScalar(0.5);
      const ground = position === "ground";
      if (ground) {
        // 寝ている人の頭のほうへ少し寄せる
        const bottom = actors[top === 0 ? 1 : 0];
        mid.addScaledVector(tv2.subVectors(bottom.world, mid).normalize(), 0.25);
      }
      // 倒れている人がいれば、その人の頭まで入るように寄せて、少し引く
      let wide = 1;
      for (const a of actors)
        if (!ground && isDowned(a)) {
          mid.addScaledVector(tv2.subVectors(a.world, mid).normalize(), 0.3);
          wide = 1.08;
        }
      const n = NORMAL;
      const near = playing ? 1 - 0.1 * Math.min(1, playing.t * 2) : 1;
      const d = (ground ? 3.5 : position === "clinch" ? 3.6 : 3.95) * near * wide;
      const h = ground ? 1.25 : 0.42;
      wantLook.set(mid.x, ground ? 0.42 : 0.98, mid.z);
      // 攻防の当たった場所へ少し寄る
      if (focusBoost > 0) {
        wantLook.lerp(tv2.copy(focusAt).setY(wantLook.y * 0.6 + focusAt.y * 0.4), 0.25 * focusBoost);
        focusBoost = Math.max(0, focusBoost - dt * 0.8);
      }
      wantPos.copy(wantLook).addScaledVector(n, d).add(tv2.set(0, h, 0)).addScaledVector(ax, -0.05);
    }
    if (!camInit) {
      camPos.copy(wantPos);
      camLook.copy(wantLook);
      camInit = true;
    }
    const k = 1 - Math.pow(2, -dt / (fight ? 0.22 : 0.3));
    camPos.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    if (shake > 0.0005) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.pow(2, -dt / 0.06);
    }
    camera.lookAt(camLook);
    arena.cull(camPos, camLook);
  }

  /** 技を出している手足の軌跡を伸ばす（出していなければ縮めて消す） */
  function updateTrails() {
    const p = playing;
    actors.forEach((a, i) => {
      let at: THREE.Vector3 | null = null;
      let width = 0.03;
      if (p && props.mode === "fight" && !options.reduceMotion)
        for (const c of p.ex.clips) {
          if (c.who !== a.seat || !c.limb) continue;
          const local = p.t - c.start;
          if (local < c.limb.from || local > c.limb.to) continue;
          // 左右を入れかえて描く人は、手足の左右も入れかわる
          const side = (a.mirror ? 1 - c.limb.side : c.limb.side) as 0 | 1;
          at = c.limb.part === "prop" ? a.rig.propTip(tv) : a.rig.strikePoint(c.limb.part, side, tv);
          width = c.limb.part === "hand" ? 0.045 : c.limb.part === "prop" ? 0.07 : 0.065;
        }
      trails[i]!.push(at, (a.shown?.seat ?? a.seat) === 0 ? theme.p0 : theme.p1, width);
    });
  }

  function updateBlob(a: Actor, i: number) {
    const b = blobs[i]!;
    const hip = a.rig.worldOf("hip", tv);
    const head = a.rig.worldOf("head", tv2);
    // 寝ているときは体に沿って長く
    const lying = clamp(1 - (head.y - 0.3) / 1.0, 0, 1);
    b.position.set((hip.x + head.x * lying) / (1 + lying), 0.004, (hip.z + head.z * lying) / (1 + lying));
    const len = Math.hypot(head.x - hip.x, head.z - hip.z);
    b.rotation.y = Math.atan2(head.x - hip.x, head.z - hip.z);
    b.scale.set(0.8 + 0.1 * a.dims.guard, 1, 0.8 + len * 1.4);
  }

  function frame(now: number) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    let dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    if (import.meta.env.DEV) {
      dt = dt * debug.timeScale + debug.pending;
      debug.pending = 0;
    }
    last = now;
    // 重い端末では、ピクセル比を下げる
    if (dt > 0.026) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 90 && dpr > 1.25) {
      dpr = Math.max(1.25, dpr - 0.25);
      renderer.setPixelRatio(dpr);
      resize();
      slowFrames = 0;
    }
    // 1 か所の不具合で舞台全体が止まらないよう、動きの計算で失敗しても描くことは続ける
    try {
      update(dt);
    } catch (e) {
      if (!warned) console.error(e);
      warned = true;
    }
    renderer.render(scene, camera);
  }
  let warned = false;

  function update(dt: number) {
    const exDt = stepExchange(dt);
    layout(dt);
    const energy = options.reduceMotion ? 0.35 : 1;
    sfx.showFrame(tv, 0, "#fff");
    sfx.showRings(tv, [0, 0], 0, "#fff");
    sfx.showAura(tv, 0, "#fff");
    sfx.showLaser(tv, tv, 0, 0, "#fff");
    for (const a of actors) {
      if (!a.rig.root.visible) continue;
      updateActor(a, dt);
      a.rig.setMirror(a.mirror);
      a.cues = props.mode === "fight" ? cuesOf(a, dt) : NO_CUES;
      a.rig.setCues(a.cues);
      a.rig.tick(a.time, breathWave(a.breath));
      const downed = isDowned(a);
      const role = props.mode === "fight" ? roleOf(a.seat) : null;
      const pos = props.mode === "fight" ? position : "standing";
      const base = a.base(pos, role, props.mode === "fight" ? dist : distOf("standing"), downed && props.mode === "fight");
      const lying = downed || (pos === "ground" && role === "bottom");
      if (props.mode === "fight") collectClips(a, base);
      else a.clipCount = 0;
      a.compose(base, dt, energy, lying);
    }
    scene.updateMatrixWorld();
    actors.forEach((a, i) => {
      blobs[i]!.visible = a.rig.root.visible && !a.cues.hidden;
      if (blobs[i]!.visible) updateBlob(a, i);
    });
    updateTrails();
    updateCamera(dt);
    effects.update(dt);
    sfx.update(dt, playing ? exDt : dt);
  }

  function schedule() {
    const should = active && !disposed && document.visibilityState !== "hidden";
    if (should && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  }
  // 開発中だけ、確認ページから舞台の中身を見られるようにする
  if (import.meta.env.DEV) (window as unknown as { __fsDebug?: unknown }).__fsDebug = Object.assign(debug, { scene, camera, renderer, actors });
  const onVisibility = () => schedule();
  document.addEventListener("visibilitychange", onVisibility);
  // 描画先を失ったら止め、しばらく戻らなければ 2D に切りかえる（戻れば three が作り直す）
  let lostTimer: ReturnType<typeof setTimeout> | null = null;
  const onLost = (e: Event) => {
    e.preventDefault();
    active = false;
    schedule();
    lostTimer = setTimeout(() => options.onLost?.(), 1500);
  };
  const onRestored = () => {
    if (lostTimer) clearTimeout(lostTimer);
    lostTimer = null;
    active = true;
    schedule();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  schedule();

  return {
    update(next) {
      const prevMe = props.me ?? 0;
      props = next;
      setLook(actors[0], next.fighters[0]);
      setLook(actors[1], next.fighters[1]);
      if ((next.me ?? 0) !== prevMe) readTheme();
      // 再生していないときは、渡された位置関係にそろえる（開き直したとき、寝技のまま始められるように）
      if (!playing && next.mode === "fight" && next.position) syncPosition(next.position, next.top ?? top);
      const ev = next.event;
      if (ev && ev.id !== lastEventId && !done.has(ev.id)) {
        lastEventId = ev.id;
        if (next.mode === "fight") start(ev);
        else {
          // キャラ作りの画面では再生しない（すぐに終わったことにする）
          done.add(ev.id);
          next.onEventDone?.(ev.id);
        }
      }
    },
    setActive(on) {
      active = on;
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      schedule();
      if (playing) clearTimeout(playing.timer);
      if (lostTimer) clearTimeout(lostTimer);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      document.removeEventListener("visibilitychange", onVisibility);
      media?.removeEventListener?.("change", onTheme);
      ro.disconnect();
      for (const a of actors) a.dispose();
      trails.forEach((t) => t.dispose());
      kit.dispose();
      arena.dispose();
      effects.dispose();
      sfx.dispose();
      blobTex.dispose();
      blobMat.dispose();
      blobGeo.dispose();
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
