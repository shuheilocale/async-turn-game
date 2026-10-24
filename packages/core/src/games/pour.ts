import { IllegalMoveError, other, type GameDefinition, type GameStatus, type Rng, type Seat } from "../types.ts";

/**
 * みずそそぎ：1 つのコップに 2 人が交互に水を注ぐ。注いだ水であふれさせた人の負け。
 * 1 回の手番では「そそぐ」ボタンを 1 回だけ長押しし、押している間だけ水が出る（やり直しはできない）。
 * コップのふちは 200 ml。ふちまではあふれないが、ふちを越えても表面張力でもつことがあり、
 * どこまでもつか（200〜230 ml）はコップごとにちがって、2 人には見えない（終局後に見せる）。
 *
 * 1 回に注ぐ量は 20〜45 ml（短く押しても 20 ml は出て、長く押しても 45 ml で止まる）。
 * 少しずつ注いでしのぐことはできないので、ふちのすぐ下（181〜200 ml）で相手に渡せば、
 * 相手はふちを越えて注ぐしかない。そこをねらい合うのがこのゲームの読みどころ。
 *
 * みずそそぎ・ハード（pourhard）は、水位が 150 ml 以上になったら「目隠し」になる。
 * 目隠し中は水位も、目隠しに入った手からあとに注いだ量も 2 人とも見えない（自分の分も。終局後に見せる）。
 * そのかわり 1 回に注ぐ量の最低が 3 ml まで下がり、1 回ごとに 3 ml ずつ増える（3 → 6 → 9 …）。
 * 押していた時間の感覚だけを頼りに、ふちのすぐ下で相手に渡せるかをきそう。
 * 2 つは同じ作り（makePour）で、目隠しの設定があるかどうかだけがちがう。
 */

/** コップのふち（ml） */
export const RIM = 200;
/** ふちを越えてもつ量の上限。もつ量は RIM〜RIM + MAX_EXTRA のどれか */
export const MAX_EXTRA = 30;
/** 1 回に注ぐ量の下限と上限（ml） */
export const MIN_POUR = 20;
export const MAX_POUR = 45;
/** 押している間に出る水の量（1 秒あたりの ml）。画面の長押しと、相手の手の再生で使う */
export const FLOW_PER_SEC = 20;

/** 目隠しの設定 */
export interface BlindRule {
  /** 水位がこれ（ml）以上になったら目隠しになる */
  from: number;
  /** 目隠しになって 1 回目に注ぐ量の最低（ml） */
  firstMin: number;
  /** そこから 1 回ごとに最低が増える量（ml） */
  step: number;
}

/**
 * みずそそぎ・ハードの目隠し。150 ml なら、目隠しに入る手（149 ml から 45 ml）でもふちに届かない。
 * 最低の増え方は、コンピュータ同士・いつも最低量の人との対局を試して決めた（3 ml ずつがいちばん、
 * いつも最低量の人が勝ちにくかった）
 */
export const HARD_BLIND: BlindRule = { from: 150, firstMin: 3, step: 3 };

export interface PourMove {
  /** 注いだ量（ml）。画面が押していた時間から決めて送る */
  amount: number;
}

/** 1 回分の記録 */
export interface PourEntry {
  seat: Seat;
  amount: number;
}

export interface PourState {
  /** このコップがもつ量。水位がこれを超えたらあふれる。2 人には見せない */
  limit: number;
  /** 今の水位（ml） */
  level: number;
  pours: PourEntry[];
  turn: Seat;
  /** あふれさせた人。まだあふれていなければ null */
  spilledBy: Seat | null;
  /** 目隠しになったか。目隠しのないコップ（みずそそぎ）ではずっと false */
  blind: boolean;
  /** 目隠しになってから注いだ回数（目隠しに入った手は数えない）。今の最低量はこれで決まる */
  blindPours: number;
}

/** 画面に渡す 1 回分。目隠しで伏せた量は null */
export interface PourEntryView {
  seat: Seat;
  amount: number | null;
}

/** 画面に渡す形。もつ量は終局まで null。目隠し中は水位と、目隠しに入った手からあとの量も null */
export type PourView = Omit<PourState, "limit" | "level" | "pours"> & {
  limit: number | null;
  level: number | null;
  pours: PourEntryView[];
};

/** 今注げる最低の量。目隠しのないコップや、目隠しの前は 20 ml */
export function minPourFor(rule: BlindRule | null, s: Pick<PourState, "blind" | "blindPours">): number {
  if (!rule || !s.blind) return MIN_POUR;
  return Math.min(MAX_POUR, rule.firstMin + rule.step * s.blindPours);
}

/** 目隠しに入った手が pours の何番目か。目隠しの前なら null */
export const blindStart = (s: Pick<PourState, "blind" | "blindPours"> & { pours: unknown[] }) =>
  s.blind ? s.pours.length - s.blindPours - 1 : null;

/** 押していた時間（ミリ秒）から、注いだ量を決める。最低量（ふつうは 20 ml）〜45 ml の整数におさめる */
export function amountForHold(ms: number, min = MIN_POUR): number {
  const raw = Math.round((Math.max(0, ms) * FLOW_PER_SEC) / 1000);
  return Math.min(MAX_POUR, Math.max(min, raw));
}

/** その量が出るまでに押している時間（ミリ秒） */
export const holdMsFor = (amount: number) => (amount * 1000) / FLOW_PER_SEC;

/** ここより上で渡すと、相手はふちを越えて注ぐしかない水位（181 ml） */
const TRAP = RIM - MIN_POUR + 1;

/** lo..hi の整数から rng で 1 つ選ぶ */
const between = (lo: number, hi: number, r: number) => lo + Math.min(hi - lo, Math.floor(r * (hi - lo + 1)));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** みずそそぎのコンピュータ。水位がすべて見えている */
function plainBotMove(level: number, rng: Rng): PourMove {
  // 注いだあとの水位にできる範囲
  const lo = level + MIN_POUR;
  const hi = level + MAX_POUR;
  let target: number;
  if (lo > RIM) {
    // ふちを越えるしかないなら、いちばん少なく注ぐ
    target = lo;
  } else if (hi >= TRAP) {
    // ふちのすぐ下に届くなら、ふちを越えない高さで相手に渡す
    target = between(Math.max(lo, TRAP), Math.min(hi, RIM), rng());
  } else {
    // 遠いうちは、半分くらいの割合で「相手にふちのすぐ下をねらわれない高さ」に止める（手加減のため毎回はしない）
    const safeTop = TRAP - MAX_POUR - 1;
    const careful = rng() < 0.5 && lo <= safeTop;
    target = careful ? between(lo, Math.min(hi, safeTop), rng()) : between(lo, hi, rng());
  }
  return { amount: target - level };
}

/** ハードのコンピュータが目隠しに入るときにねらう高さ（目隠しの始まりより何 ml 上か） */
const ENTRY_AIM = 25;
/** 目隠し中にねらう高さ（ふちの 5 ml 下）。見積もりがずれても越えにくいよう、少し手前にする */
const BLIND_AIM = RIM - 5;
/** 押す量のゆらぎ（±ml）。人が押す長さのように、ねらった量から少しずれる */
const WOBBLE = 2;

/**
 * みずそそぎ・ハードのコンピュータ。目隠しの前は見えている水位で、目隠しに届くなら少し上をねらって入る。
 * 目隠し中は、見えている最後の水位（目隠しに入った手の直前）と、それからの手数で水位を見積もる。
 * 相手は最低量を、自分は同じ考えで選んだ量を注いだとみて（自分の量は選び直して思い出す。ゆらぎの分はずれる）、
 * ふちの少し下まで届くならそこまで、もう越えていそうなら最低量を注ぐ
 */
function hardBotMove(rule: BlindRule, v: PourView, seat: Seat, rng: Rng): PourMove {
  const start = blindStart(v);
  if (start === null) {
    const level = v.level!;
    const lo = level + MIN_POUR;
    const hi = level + MAX_POUR;
    // 目隠しに届かないうちは、でたらめに注ぐ
    if (hi < rule.from) return { amount: between(lo, hi, rng()) - level };
    return { amount: clamp(rule.from + ENTRY_AIM + between(-WOBBLE, WOBBLE, rng()), lo, hi) - level };
  }

  const minAt = (i: number) => minPourFor(rule, { blind: true, blindPours: i });
  /** 見積もった水位 est から、i 回目（目隠しのあと）にねらって注ぐ量。ゆらぎの前 */
  const aim = (est: number, i: number) => clamp(Math.round(BLIND_AIM - est), minAt(i), MAX_POUR);

  // 目隠しに入った手のあとの水位。入った手は 20〜45 ml で、そのあと目隠しの始まりを越えている
  const base = v.pours.slice(0, start).reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const lo = Math.max(base + MIN_POUR, rule.from);
  const hi = base + MAX_POUR;
  let est = v.pours[start]!.seat === seat ? clamp(rule.from + ENTRY_AIM, lo, hi) : (lo + hi) / 2;
  for (let i = 0; i < v.blindPours; i++) est += v.pours[start + 1 + i]!.seat === seat ? aim(est, i) : minAt(i);

  const min = minAt(v.blindPours);
  const amount = aim(est, v.blindPours);
  // もう越えていそうなら、いちばん短く押す
  if (amount <= min) return { amount: min };
  return { amount: clamp(amount + between(-WOBBLE, WOBBLE, rng()), min, MAX_POUR) };
}

/** みずそそぎのルールを作る。blind（目隠しの設定）が null なら目隠しのない、ふつうのみずそそぎ */
export function makePour(id: string, blind: BlindRule | null): GameDefinition<PourState, PourMove> {
  return {
    id,

    initialState(rng) {
      return {
        limit: RIM + Math.min(MAX_EXTRA, Math.floor(rng() * (MAX_EXTRA + 1))),
        level: 0,
        pours: [],
        turn: 0,
        spilledBy: null,
        blind: false,
        blindPours: 0,
      };
    },

    status(state): GameStatus {
      if (state.spilledBy !== null) return { kind: "finished", winner: other(state.spilledBy) };
      return { kind: "playing", turn: state.turn };
    },

    applyMove(state, { amount }, seat) {
      if (state.spilledBy !== null) throw new IllegalMoveError("game_over");
      if (seat !== state.turn) throw new IllegalMoveError("not_your_turn");
      const min = minPourFor(blind, state);
      if (!Number.isInteger(amount) || amount < min || amount > MAX_POUR)
        throw new IllegalMoveError(blind && state.blind ? "pour_blind_amount" : "pour_amount");
      const level = state.level + amount;
      const next: PourState = {
        ...state,
        level,
        pours: [...state.pours, { seat, amount }],
        turn: other(seat),
        spilledBy: level > state.limit ? seat : null,
      };
      if (!blind) return next;
      // 目隠しの間は数を数える。目隠しの始まりを越えた手で目隠しになる
      if (state.blind) return { ...next, blindPours: state.blindPours + 1 };
      return level >= blind.from ? { ...next, blind: true } : next;
    },

    parseMove(raw) {
      const amount = (raw as { amount?: unknown } | null)?.amount;
      return typeof amount === "number" && Number.isInteger(amount) ? { amount } : null;
    },

    viewState(state, _viewer, revealAll): PourView {
      const start = blindStart(state);
      if (revealAll || start === null) return { ...state, limit: revealAll ? state.limit : null };
      // 目隠し中は、水位と、目隠しに入った手からあとの量を 2 人とも伏せる（自分の分も）
      return {
        ...state,
        limit: null,
        level: null,
        pours: state.pours.map((p, i) => (i < start ? p : { seat: p.seat, amount: null })),
      };
    },

    viewMove(move) {
      // みずそそぎでは、注いだ量は水位として 2 人に見えているので加工しない
      if (!blind) return move;
      // ハードでは、手の記録だけでは目隠しの前の手か後の手か分からないので、量はすべて伏せる
      // （目隠しの前の量は、局面の pours で見えている）
      return { amount: null };
    },

    botMove(view, seat, rng) {
      const v = view as PourView;
      if (v.spilledBy !== null || v.turn !== seat) return null;
      return blind ? hardBotMove(blind, v, seat, rng) : plainBotMove(v.level!, rng);
    },
  };
}

export const pour = makePour("pour", null);
export const pourHard = makePour("pourhard", HARD_BLIND);
