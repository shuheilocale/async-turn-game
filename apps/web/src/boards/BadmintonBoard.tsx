import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Badminton, other, type Seat } from "@atg/core";
import { useI18n } from "../i18n/index.tsx";
import type { BoardProps } from "./index.ts";
import { CourtRenderer, type PlayerPose, type Scene } from "./badminton/render.ts";
import { rallyText, shotName } from "./badminton/text.ts";
import "./BadmintonBoard.css";

const B = Badminton;
const { DT, RUN, HOME, SERVER_PX, RECEIVE_PX, SERVE_X, SERVE_Y } = B;

/** 「受ける」を押してから、相手が打つまで */
const LEAD_MS = 800;
/** 振ってから、もう一度振れるまで */
const SWING_MS = 300;
/** 指を置いてから、走り出すまで（はじくつもりで置いた指で走り出さないよう、少し待つ） */
const MOVE_DELAY_MS = 90;
/** はじいたかを見る時間の幅と、はじいたとみなす長さ（コートの幅に対して）と速さ（px/ms） */
const FLICK_MS = 110;
const FLICK_MIN = 0.07;
const FLICK_SPEED = 0.7;
/** いちばん強くはじいたときの長さ（コートの幅に対して） */
const FLICK_FULL = 0.55;
/** はじいたのが少し遅れても、このコマ数だけさかのぼって当たったことにする */
const GRACE_FRAMES = 8;
/** 落とす所（ネットからの距離）。弱いと手前、強いと奥（強すぎるとアウト） */
const DEPTH_MIN = 0.4;
const DEPTH_MAX = 7.6;
const SERVE_DEPTH_MIN = 1.2;
const SERVE_DEPTH_MAX = 7.4;
/** 下向きの球（スマッシュ）の速さ */
const SMASH_MIN = 9;
/** 決まったか・アウトかなどを見せておく時間 */
const CALL_MS = 1500;
/** 自分の球が相手のコートへ向かうところまで見せる割合 */
const WAIT_AT = 0.55;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const seqOf = (s: Badminton.BadmintonState) => (s.score[0] + s.score[1]) * 1000 + s.hits.length;
const lastOf = <T,>(a: readonly T[]) => a[a.length - 1];

/** ある時刻から、from から to へ走る選手 */
interface Runner {
  from: number;
  to: number;
  t0: number;
}
const runAt = (r: Runner, now: number) => B.moveToward(r.from, r.to, RUN * Math.max(0, (now - r.t0) / 1000));

/** 飛んでいるシャトル。t0 は打った時刻、stop のコマで止める */
interface Flying {
  fl: Badminton.Flight;
  t0: number;
  stop: number;
}
const frameAt = (fly: Flying, now: number) => clamp(((now - fly.t0) / 1000) / DT, 0, fly.stop);

/** 動いているものすべて（描くたびに時刻から位置を出す） */
interface Anim {
  /** 自分の選手。指で動かすときは control、決まった動きなら Runner */
  me: Runner | "control";
  opp: Runner;
  swing: Partial<Record<Seat, number>>;
  holding: Seat | null;
  fly: Flying | null;
  /** 打つ前に止まっているシャトル */
  rest: { x: number; y: number; vx: number; vy: number } | null;
  mark: { x: number; kind: "in" | "out" | "net"; at: number } | null;
}

/** 決まった・アウトなどの大きな文字 */
interface Call {
  text: string;
  sub?: string;
  tone: "good" | "bad" | "plain";
}

type Phase = "still" | "replay" | "ready" | "live" | "serve" | "after";

/** シャトルの止まり方の印 */
const markOf = (fl: Badminton.Flight, reason: Badminton.Reason): NonNullable<Anim["mark"]>["kind"] =>
  fl.net ? "net" : reason === "out" ? "out" : "in";

/**
 * バドミントンの盤。自分の番には、相手が打ったシャトルが飛んでくる（「受ける」を押してから）。
 * 指を置いた所へ選手が走り、シャトルが届く所に来たら（光ったら）打ちたい向きにはじいて打ち返す。
 * はじいた向きで高さ（上向きなら高く、下向きならスマッシュ）、強さで落とす所（強いほど奥）が決まる。
 * 打ったらすぐに送り、自分の球が相手のコートへ向かうところまで見せる。サーブの番は、はじくとサーブする
 */
export function BadmintonBoard({ state, status, you, names, interactive, onSubmit }: BoardProps) {
  const { t } = useI18n();
  const s = state as Badminton.BadmintonState;
  const me: Seat = you ?? 0;
  const opp = other(me);
  const turn = status.kind === "playing" ? status.turn : null;
  const myTurn = interactive && you !== null && turn === me;
  const seq = seqOf(s);
  const nameOf = (seat: Seat) => (seat === you ? t("game.badminton.you") : t("game.badminton.someone", { name: names[seat] }));

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<CourtRenderer | null>(null);
  const [width, setWidth] = useState(0);
  const [phase, setPhase] = useState<Phase>("still");
  const [call, setCall] = useState<Call | null>(null);
  const anim = useRef<Anim | null>(null);
  /** 指で動かしている自分の選手 */
  const ctrl = useRef({ px: 0, start: 0, target: null as number | null, pendingAt: 0, pending: null as number | null, stride: 0, last: 0 });
  /** 相手のシャトル（受けている間） */
  const incoming = useRef<Flying | null>(null);
  const samples = useRef<{ t: number; x: number; y: number }[]>([]);
  const lastSwing = useRef(-Infinity);
  /** 自分の 1 打を見せている間は、届いた局面を見せ方に使わない（お試しでは、すぐにコンピュータが打ち返す） */
  const busy = useRef(false);
  /** 見せ方を決めた局面の通しの番号 */
  const shown = useRef<number | null>(null);
  /** 自分が送った手のあとの通しの番号。その局面が届くまでは、古い局面で見せ方を決めない */
  const own = useRef(-1);
  const timers = useRef<number[]>([]);
  const submit = useRef(onSubmit);
  submit.current = onSubmit;

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // 幅に合わせて描き直す
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!canvas.current || width === 0) return;
    renderer.current ??= new CourtRenderer(canvas.current);
    const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    renderer.current.resize(width, window.devicePixelRatio || 1, dark);
    draw(performance.now());
  }, [width]);

  /** 今の局面を、止まった絵として用意する */
  function stillOf(now: number): Anim {
    const last = lastOf(s.hits);
    if (last) {
      // 打った球が、相手が開くまで空中で待っている
      const fl = B.flightOf(last);
      const hitter = last.seat;
      const recv = other(hitter);
      const stop = Math.max(1, Math.min(fl.end - 1, Math.round(fl.end * WAIT_AT)));
      const recvStart = B.startPx(s);
      return {
        me: { from: me === hitter ? last.px : recvStart, to: me === hitter ? last.px : recvStart, t0: now },
        opp: { from: opp === hitter ? last.px : recvStart, to: opp === hitter ? last.px : recvStart, t0: now },
        swing: {},
        holding: null,
        fly: { fl, t0: now - stop * DT * 1000, stop },
        rest: null,
        mark: null,
      };
    }
    // サーブを待っている
    const server = s.server;
    const at = (seat: Seat) => B.sideX(seat, seat === server ? SERVER_PX : RECEIVE_PX);
    const r = s.last;
    const fin = status.kind === "finished" && r;
    let mark: Anim["mark"] = null;
    if (fin) {
      const final = lastOf(r.hits)!;
      const fl = B.flightOf(final);
      mark = { x: fl.x[fl.end]!, kind: markOf(fl, r.reason), at: now };
    }
    return {
      me: { from: at(me), to: at(me), t0: now },
      opp: { from: at(opp), to: at(opp), t0: now },
      swing: {},
      holding: fin ? null : server,
      fly: null,
      rest: fin ? null : { x: B.sideX(server, SERVE_X - 0.1), y: SERVE_Y + 0.05, vx: 0, vy: -1 },
      mark,
    };
  }

  /** 相手の手で終わったラリーの最後を再生する。終わったら then */
  function replayRally(r: Badminton.Rally, then: () => void) {
    const now = performance.now() + 500;
    const final = lastOf(r.hits)!;
    const fl = B.flightOf(final);
    const hitter = final.seat;
    const recvStart = r.hits.length >= 1 ? B.startPx({ hits: r.hits }) : B.sideX(other(hitter), RECEIVE_PX);
    const recvTo = r.reason === "in" && r.missPx !== undefined ? r.missPx : B.sideX(other(hitter), HOME);
    const runner = (seat: Seat): Runner =>
      seat === hitter ? { from: final.px, to: B.sideX(seat, HOME), t0: now } : { from: recvStart, to: recvTo, t0: now };
    anim.current = {
      me: runner(me),
      opp: runner(opp),
      swing: { [hitter]: now - 120 },
      holding: null,
      fly: { fl, t0: now, stop: fl.end },
      rest: null,
      mark: { x: fl.x[fl.end]!, kind: markOf(fl, r.reason), at: now + fl.end * DT * 1000 },
    };
    setPhase("replay");
    setCall(null);
    const done = fl.end * DT * 1000 + 500;
    later(done, () => setCall(callOf(r)));
    later(done + CALL_MS, () => {
      setCall(null);
      then();
    });
  }

  function callOf(r: Badminton.Rally): Call {
    const final = lastOf(r.hits)!;
    const mine = r.winner === me;
    const text =
      r.reason === "in"
        ? final.seat === me
          ? t("game.badminton.call.win")
          : t("game.badminton.call.miss")
        : t(`game.badminton.call.${r.reason}`);
    return { text, sub: t("game.badminton.point", { who: nameOf(r.winner) }), tone: you === null ? "plain" : mine ? "good" : "bad" };
  }

  /** サーブを待つ */
  function toServe() {
    anim.current = stillOf(performance.now());
    setPhase("serve");
  }

  /** 相手のシャトルを受ける前（「受ける」を押すのを待つ） */
  function toReady() {
    const now = performance.now();
    const last = lastOf(s.hits)!;
    const start = B.startPx(s);
    anim.current = {
      me: "control",
      opp: { from: last.px, to: last.px, t0: now },
      swing: {},
      holding: null,
      fly: null,
      rest: { x: last.x, y: last.y, vx: last.vx, vy: last.vy },
      mark: null,
    };
    Object.assign(ctrl.current, { px: start, start, target: null, pending: null, stride: 0, last: now });
    setPhase("ready");
  }

  // 局面が変わったら（開いたとき・相手の手が届いたとき）、見せ方を決め直す
  useEffect(() => {
    if (!busy.current) decide();
  }, [seq, myTurn]);

  function decide() {
    // 別の対局に替わった
    if (shown.current !== null && seq < shown.current) own.current = -1;
    if (seq < own.current || shown.current === seq) return;
    const first = shown.current === null;
    shown.current = seq;
    clearTimers();
    if (seq === own.current) {
      // 自分の手（もう見せた）
      setCall(null);
      toStill();
      return;
    }
    setCall(null);
    if (myTurn && s.hits.length > 0) {
      toReady();
      return;
    }
    const r = s.last;
    const endedByOpp = r && (r.reason === "in" ? lastOf(r.hits)!.seat === me : lastOf(r.hits)!.seat === opp);
    if (s.hits.length === 0 && r && (myTurn ? endedByOpp : !first || status.kind === "finished")) {
      replayRally(r, () => (myTurn ? toServe() : toStill()));
      return;
    }
    if (myTurn) toServe();
    else toStill();
  }
  /** 時間がたってから呼ぶときは、そのときの局面で決める */
  const latest = useRef({ decide });
  latest.current = { decide };

  function toStill() {
    anim.current = stillOf(performance.now());
    setPhase("still");
  }

  // 動いている間は毎コマ描く
  const moving = phase === "replay" || phase === "live" || phase === "after";
  useEffect(() => {
    if (!moving) {
      draw(performance.now());
      return;
    }
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      tick(now);
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [moving, phase]);

  /** 自分の選手を、指の先へ走らせる。相手のシャトルが落ちたら「返せなかった」 */
  function tick(now: number) {
    const c = ctrl.current;
    const dt = Math.min(0.05, (now - c.last) / 1000);
    c.last = now;
    if (phase !== "live" || !incoming.current) return;
    const fly = incoming.current;
    const started = now >= fly.t0;
    if (c.pending !== null && now - c.pendingAt >= MOVE_DELAY_MS) {
      c.target = c.pending;
      c.pending = null;
    }
    if (started && c.target !== null) {
      const next = B.moveToward(c.px, c.target, RUN * dt);
      c.stride += Math.abs(next - c.px) * 3.2;
      c.px = next;
    }
    if (frameAt(fly, now) >= fly.fl.end) missed(now);
  }

  function missed(now: number) {
    const fly = incoming.current!;
    incoming.current = null;
    const px = Badminton.round3(ctrl.current.px);
    anim.current = {
      ...anim.current!,
      me: { from: px, to: px, t0: now },
      fly: { ...fly, stop: fly.fl.end },
      mark: { x: fly.fl.x[fly.fl.end]!, kind: "in", at: now },
    };
    setPhase("after");
    send({ kind: "miss", px }, () => {
      setCall({ text: t("game.badminton.call.miss"), sub: t("game.badminton.point", { who: nameOf(opp) }), tone: "bad" });
    });
  }

  /** 手を送る。送れたら、見せている動きが終わってから局面に合わせる */
  function send(move: Badminton.BadmintonMove, show: () => void, wait = 0) {
    let next: Badminton.BadmintonState;
    try {
      next = B.badminton.applyMove(s, B.badminton.parseMove(move)!, me);
    } catch {
      toStill();
      return;
    }
    busy.current = true;
    later(wait, show);
    const sent = submit.current(move);
    later(wait + CALL_MS, () => {
      void sent.then((ok) => {
        busy.current = false;
        // 送れたら、その局面（またはそのあとの相手の手）を見せる。送れなかったら、開いたときと同じく決め直す
        own.current = ok ? seqOf(next) : -1;
        if (!ok) {
          setCall(null);
          shown.current = null;
        }
        latest.current.decide();
      });
    });
  }

  /** はじいた。vec は画面での向き（右・下が正）、power は 0〜1 */
  function swing(vec: [number, number], power: number) {
    const now = performance.now();
    if (now - lastSwing.current < SWING_MS) return;
    lastSwing.current = now;
    const a = anim.current;
    if (!a) return;
    a.swing = { ...a.swing, [me]: now };
    // 画面の右が相手のコート（自分はいつも左）。後ろ向きにはじいても、前へ打つ
    const forward = Math.abs(vec[0]);
    const up = -vec[1];
    const angle = clamp(Math.atan2(up, Math.max(forward, 1e-6)), -1.1, 1.35);

    if (phase === "serve") {
      const x = B.sideX(me, SERVE_X);
      const y = SERVE_Y;
      const ang = Math.max(0.12, angle);
      const v = B.speedFor(me, x, y, ang, SERVE_DEPTH_MIN + power * (SERVE_DEPTH_MAX - SERVE_DEPTH_MIN), B.SERVE_SPEED_MAX);
      const move: Badminton.BadmintonMove = { kind: "serve", ...velocity(ang, v) };
      fire(move, { seat: me, f: 0, px: B.sideX(me, SERVER_PX), x, y, vx: move.vx, vy: move.vy }, now);
      return;
    }
    if (phase !== "live" || !incoming.current) return;
    const fly = incoming.current;
    const c = ctrl.current;
    const f = Math.floor(frameAt(fly, now));
    // 届くコマ（はじくのが少し遅れたぶんはさかのぼる）
    for (let g = f; g >= Math.max(1, f - GRACE_FRAMES); g--) {
      const px = Badminton.round3(B.clampPlayer(me, B.moveToward(c.start, c.px, RUN * g * DT)));
      if (!B.canHit(fly.fl, g, me, px, c.start)) continue;
      const x = fly.fl.x[g]!;
      const y = fly.fl.y[g]!;
      const v =
        angle < -0.05
          ? SMASH_MIN + power * (B.SPEED_MAX - SMASH_MIN)
          : B.speedFor(me, x, y, angle, DEPTH_MIN + power * (DEPTH_MAX - DEPTH_MIN));
      const vel = velocity(angle, v);
      const move: Badminton.BadmintonMove = { kind: "hit", f: g, px, x: Badminton.round3(x), y: Badminton.round3(y), ...vel };
      incoming.current = null;
      c.px = px;
      fire(move, { seat: me, f: g, px, x, y, ...vel }, now);
      return;
    }
    // 空振り
  }

  const velocity = (angle: number, v: number) => ({
    vx: Badminton.round3(Math.cos(angle) * v * B.dirOf(me)),
    vy: Badminton.round3(Math.sin(angle) * v),
  });

  /** 自分の 1 打を飛ばして送る */
  function fire(move: Badminton.BadmintonMove, hit: Badminton.Hit, now: number) {
    const fl = B.flightOf(hit);
    const serve = move.kind === "serve";
    const reason = B.judge(fl, me, serve);
    const a = anim.current!;
    const oppNow = a.opp ? runAt(a.opp, now) : B.sideX(opp, HOME);
    const stop = reason === "in" ? Math.max(1, Math.min(fl.end - 1, Math.round(fl.end * WAIT_AT))) : fl.end;
    anim.current = {
      ...a,
      me: { from: hit.px, to: hit.px, t0: now },
      opp: { from: oppNow, to: serve ? oppNow : B.sideX(opp, HOME), t0: now },
      holding: null,
      rest: null,
      fly: { fl, t0: now, stop },
      mark: reason === "in" ? null : { x: fl.x[fl.end]!, kind: markOf(fl, reason), at: now + fl.end * DT * 1000 },
    };
    setPhase("after");
    const flightMs = stop * DT * 1000;
    send(
      move,
      () => {
        if (reason === "in") setCall({ text: shotName(t, hit), tone: "plain" });
        else
          setCall({
            text: t(`game.badminton.call.${reason}`),
            sub: t("game.badminton.point", { who: nameOf(opp) }),
            tone: "bad",
          });
      },
      reason === "in" ? 150 : flightMs + 200,
    );
  }

  /** 「受ける」：少し待ってから相手が打つ */
  function receive() {
    const now = performance.now();
    const last = lastOf(s.hits)!;
    const fl = B.flightOf(last);
    const t0 = now + LEAD_MS;
    incoming.current = { fl, t0, stop: fl.end };
    const a = anim.current!;
    anim.current = {
      ...a,
      opp: { from: last.px, to: B.sideX(opp, HOME), t0 },
      swing: { [opp]: t0 - 120 },
      rest: null,
      fly: incoming.current,
    };
    ctrl.current.last = now;
    setPhase("live");
  }

  function skipReplay() {
    clearTimers();
    setCall(null);
    if (myTurn) toServe();
    else toStill();
  }

  // ---------- 指 ----------

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (phase !== "live" && phase !== "serve") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local2(e);
    samples.current = [{ t: e.timeStamp, ...p }];
    if (phase === "live") {
      ctrl.current.pending = B.clampPlayer(me, renderer.current!.worldX(p.x));
      ctrl.current.pendingAt = performance.now();
    }
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (samples.current.length === 0) return;
    const p = local2(e);
    const now = e.timeStamp;
    const list = samples.current;
    list.push({ t: now, ...p });
    while (list.length > 2 && now - list[0]!.t > FLICK_MS) list.shift();
    const old = list[0]!;
    const dx = p.x - old.x;
    const dy = p.y - old.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = dist / Math.max(1, now - old.t);
    if (dist >= FLICK_MIN * width && speed >= FLICK_SPEED) {
      // はじいた。走って行く先は、はじく前のまま
      ctrl.current.pending = null;
      samples.current = [];
      swing([dx, dy], clamp((dist / width - FLICK_MIN) / (FLICK_FULL - FLICK_MIN), 0, 1));
      return;
    }
    if (phase === "live" && speed < FLICK_SPEED * 0.6) {
      const x = B.clampPlayer(me, renderer.current!.worldX(p.x));
      if (ctrl.current.pending !== null) ctrl.current.pending = x;
      else ctrl.current.target = x;
    }
  }

  function onPointerUp() {
    samples.current = [];
  }

  const local2 = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // ---------- 描く ----------

  function draw(now: number) {
    const r = renderer.current;
    const a = anim.current;
    if (!r || !a) return;
    const c = ctrl.current;
    const pose = (seat: Seat, runner: Runner | "control"): PlayerPose => {
      const px = runner === "control" ? c.px : runAt(runner, now);
      const stride = runner === "control" ? c.stride : Math.abs(px - runner.from) * 3.2;
      const at = a.swing[seat];
      const k = at === undefined ? null : (now - at) / 260;
      return { seat, px, stride, swing: k === null || k < 0 || k > 1 ? (k !== null && k < 0 ? 0 : null) : k, holding: a.holding === seat };
    };
    let shuttle: Scene["shuttle"] = null;
    const trail: [number, number][] = [];
    if (a.fly && now >= a.fly.t0) {
      const fl = a.fly.fl;
      const f = frameAt(a.fly, now);
      const i = Math.floor(f);
      const j = Math.min(fl.end, i + 1);
      const u = f - i;
      const x = fl.x[i]! + (fl.x[j]! - fl.x[i]!) * u;
      const y = fl.y[i]! + (fl.y[j]! - fl.y[i]!) * u;
      const k = Math.max(1, i);
      const vx = (fl.x[k]! - fl.x[k - 1]!) / DT;
      const vy = (fl.y[k]! - fl.y[k - 1]!) / DT;
      let glow = false;
      if (phase === "live" && incoming.current) glow = B.canHit(fl, i, me, B.clampPlayer(me, c.px), c.start);
      shuttle = { x, y, vx, vy, glow };
      for (let g = Math.max(0, i - 30); g <= i; g += 3) trail.push([fl.x[g]!, fl.y[g]!]);
      trail.push([x, y]);
    } else if (a.fly) {
      const fl = a.fly.fl;
      shuttle = { x: fl.x[0]!, y: fl.y[0]!, vx: fl.x[1]! - fl.x[0]!, vy: fl.y[1]! - fl.y[0]!, glow: false };
    } else if (a.rest) {
      shuttle = { ...a.rest, glow: false };
    }
    r.draw({
      left: me,
      players: [pose(opp, a.opp), pose(me, a.me)],
      shuttle,
      trail,
      mark: a.mark && now >= a.mark.at ? a.mark : null,
      target: phase === "live" ? c.target : null,
    });
  }

  // 局面や向きが変わったら、止まった絵を描き直す
  useEffect(() => {
    if (!moving) draw(performance.now());
  });

  // ---------- 文字 ----------

  const finished = status.kind === "finished";
  let hint: string;
  if (finished) {
    const w = status.winner;
    hint = w === null ? t("game.badminton.draw") : t("game.badminton.won", { who: nameOf(w) });
  } else if (phase === "serve") hint = t("game.badminton.hint.serve");
  else if (phase === "ready") hint = t("game.badminton.hint.ready", { who: nameOf(opp) });
  else if (phase === "live") hint = t("game.badminton.hint.live");
  else if (phase === "replay" || phase === "after") hint = "";
  else if (turn !== null) hint = s.hits.length === 0 ? t("game.badminton.hint.waitServe", { who: nameOf(turn) }) : t("game.badminton.hint.wait", { who: nameOf(turn) });
  else hint = "";
  const mine = phase === "serve" || phase === "ready" || phase === "live";

  return (
    <div className="badminton-board stack-sm">
      <div className="badminton-score" aria-live="polite">
        {([me, opp] as Seat[]).map((seat) => (
          <div key={seat} className={`badminton-player seat${seat} ${turn === seat && !finished ? "turn" : ""}`}>
            <span className="badminton-dot" aria-hidden />
            <span className="badminton-name">{nameOf(seat)}</span>
            {s.server === seat && !finished && (
              <span className="badminton-serve" role="img" aria-label={t("game.badminton.serving")} title={t("game.badminton.serving")}>
                <ShuttleIcon />
              </span>
            )}
            <b className="badminton-points">{s.score[seat]}</b>
          </div>
        ))}
      </div>
      <p className="badminton-target muted">{t("game.badminton.target", { n: B.TARGET })}</p>

      {hint && (
        <p className={`badminton-hint ${mine ? "mine" : ""}`} role="status">
          {hint}
        </p>
      )}

      <div ref={wrap} className="badminton-court">
        <canvas
          ref={canvas}
          className={`badminton-canvas ${phase === "live" || phase === "serve" ? "active" : ""}`}
          role="img"
          aria-label={t("game.badminton.board")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {phase === "replay" && (
          <button type="button" className="badminton-pill" onClick={skipReplay}>
            {t("game.badminton.skip")}
          </button>
        )}
        {call && (
          <div className={`badminton-call ${call.tone}`} role="status">
            <b>{call.text}</b>
            {call.sub && <span>{call.sub}</span>}
          </div>
        )}
      </div>

      {phase === "ready" && (
        <button type="button" className="primary badminton-receive" onClick={receive}>
          {t("game.badminton.receive")}
        </button>
      )}

      {s.last && phase === "still" && (
        <p className="board-note">
          <span className="muted">{rallyText(t, s.last, nameOf)}</span>
        </p>
      )}
    </div>
  );
}

function ShuttleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="badminton-icon" aria-hidden>
      <path d="M8 20.5a3 3 0 1 1-4.2-4.2" />
      <path d="M5.2 14.9 12 4l8 8-10.9 6.8" />
      <path d="M8.6 9.1 14.9 15.4M10.3 6.5 17.5 13.7" />
    </svg>
  );
}
