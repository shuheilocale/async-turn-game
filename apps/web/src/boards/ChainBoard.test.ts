import { afterEach, describe, expect, it, vi } from "vitest";
import { Chain, getGame, type GameView, type Seat } from "@atg/core";
import { translator } from "../i18n/index.tsx";
import { progressCard } from "../notify.ts";
import { snapshotOf } from "../snapshot.ts";

/** まねっこチェーンの局面：pads を先手から順に足していき、miss なら手番の人がまちがえる */
function played(pads: number[], miss = false) {
  const def = getGame("chain")!;
  let s: Chain.ChainState = def.initialState(Math.random);
  for (const pad of pads) s = def.applyMove(s, { taps: [...s.seq, pad] }, s.turn);
  if (miss) s = def.applyMove(s, { taps: [(s.seq[0]! + 1) % Chain.PADS] }, s.turn);
  return s;
}

const viewOf = (state: Chain.ChainState): GameView => ({
  id: "g1",
  gameType: "chain",
  version: state.seq.length,
  state,
  status: getGame("chain")!.status(state),
  players: [
    { seat: 0, name: "あき", lang: "ja" },
    { seat: 1, name: "Som", lang: "ja" },
  ],
  you: (state.seq.length % 2 === 1 ? 0 : 1) as Seat,
  waitingForOpponent: false,
  inviteCode: null,
  nextGameId: null,
  updatedAt: "",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("まねっこチェーンの LINE のカード", () => {
  const states = [played([]), played([2, 0, 3]), played([1, 1, 2, 3, 0]), played([3, 2], true)];

  it("局面の図は作らない（カードを見て並びが分からないように）", () => {
    for (const s of states) expect(snapshotOf("chain", s)).toBeNull();
  });

  it("カードの文面にも並び（パッドの名前）は出ない", () => {
    vi.stubGlobal("location", { protocol: "https:", origin: "https://example.com" });
    for (const lang of ["ja", "en", "th"] as const) {
      const t = translator(lang);
      const pads = Array.from({ length: Chain.PADS }, (_, i) => t(`game.chain.pad${i}`));
      for (const s of states) {
        const card = progressCard(t, viewOf(s), t("line.moved", { name: "あき" }));
        expect(card.board).toBeUndefined();
        const text = JSON.stringify(card);
        for (const name of pads) expect(text).not.toContain(name);
      }
    }
  });
});
