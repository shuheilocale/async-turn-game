import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { bodyOf, NEUTRAL_STATS } from "./body.ts";
import { dist, easings, eulerYXZ, apply3, solveTwoBone, damp, type V3 } from "./math.ts";
import { chestFrame, headCenter, lerpPose, mirrorPose, newPose, P, pack, POSE_SIZE, unpack, type PoseDesc } from "./pose.ts";

const sample = (): PoseDesc => ({
  hip: [0.05, 0.9, -0.02],
  hipRot: [0.1, -0.5, 0.05],
  spine: [0.12, 0.03, -0.02],
  chest: [0.08, 0.06, 0.01],
  neck: [0.2, 0.4, -0.05],
  shrug: [0.01, 0.02],
  hand: [
    [0.1, 0.3, 0.25],
    [-0.12, 0.28, 0.12],
  ],
  elbow: [
    [0.3, -1, -0.2],
    [-0.3, -1, -0.1],
  ],
  fist: [
    [0.2, 0.4, 0],
    [0.1, -0.3, 0.1],
  ],
  foot: [
    [0.1, 0.075, 0.2],
    [-0.13, 0.09, -0.2],
  ],
  footRot: [
    [0, -0.3, 0],
    [0.3, -0.7, 0],
  ],
  knee: [
    [0.3, 0, 1],
    [-0.2, 0, 1],
  ],
  breath: 0.4,
});

describe("姿勢の数の並び", () => {
  it("書き出して読み戻すと、同じ姿勢になる", () => {
    const d = sample();
    expect(unpack(pack(d))).toEqual(d);
    expect(pack(d).length).toBe(POSE_SIZE);
  });

  it("左右を入れかえると、左右の手足が入れかわり、2 回で元に戻る", () => {
    const p = pack(sample());
    const m = mirrorPose(p);
    const d = unpack(m);
    expect(d.hand[0]).toEqual([0.12, 0.28, 0.12]);
    expect(d.hand[1]).toEqual([-0.1, 0.3, 0.25]);
    expect(d.hip[0]).toBeCloseTo(-0.05);
    expect(d.hipRot).toEqual([0.1, 0.5, -0.05]);
    expect(Array.from(mirrorPose(m))).toEqual(Array.from(p));
    // 同じ入れ物に書き戻しても正しい
    const q = Float64Array.from(p);
    mirrorPose(q, q);
    expect(Array.from(q)).toEqual(Array.from(m));
  });

  it("補間は両端で元の姿勢になる", () => {
    const a = pack(sample());
    const b = newPose();
    expect(Array.from(lerpPose(a, b, 0))).toEqual(Array.from(a));
    expect(Array.from(lerpPose(a, b, 1))).toEqual(Array.from(b));
    expect(lerpPose(a, b, 0.5)[P.hip + 1]).toBeCloseTo(0.45);
  });
});

describe("骨をたどる計算（three の骨の組み方と同じになる）", () => {
  it("胸と頭の位置が、three の Object3D で組んだ骨と一致する", () => {
    const d = bodyOf(NEUTRAL_STATS);
    const p = pack(sample());
    const g = (parent: THREE.Object3D | null) => {
      const o = new THREE.Object3D();
      o.rotation.order = "YXZ";
      parent?.add(o);
      return o;
    };
    const pelvis = g(null);
    const spine = g(pelvis);
    const chest = g(spine);
    const neck = g(chest);
    const head = g(neck);
    pelvis.position.set(p[P.hip]!, p[P.hip + 1]!, p[P.hip + 2]!);
    pelvis.rotation.set(p[P.hipRot]!, p[P.hipRot + 1]!, p[P.hipRot + 2]!);
    spine.position.set(0, d.pelvisUp, 0);
    spine.rotation.set(p[P.spine]!, p[P.spine + 1]!, p[P.spine + 2]!);
    chest.position.set(0, d.abdomen, 0);
    chest.rotation.set(p[P.chest]!, p[P.chest + 1]!, p[P.chest + 2]!);
    neck.position.set(0, d.chestH, 0);
    neck.rotation.set(p[P.neck]! / 2, p[P.neck + 1]! / 2, p[P.neck + 2]! / 2);
    head.position.set(0, d.neck, 0);
    head.rotation.copy(neck.rotation);
    pelvis.updateMatrixWorld(true);

    const c = chestFrame(p, d);
    const cw = chest.getWorldPosition(new THREE.Vector3());
    expect(dist(c.o, cw.toArray() as V3)).toBeLessThan(1e-9);
    const local: V3 = [0.1, 0.2, 0.3];
    const viaThree = chest.localToWorld(new THREE.Vector3(...local));
    const viaPure = apply3(c.r, local).map((v, i) => v + c.o[i]!) as V3;
    expect(dist(viaPure, viaThree.toArray() as V3)).toBeLessThan(1e-9);
    const h = head.localToWorld(new THREE.Vector3(0, d.headR * 0.8, 0.012));
    expect(dist(headCenter(p, d), h.toArray() as V3)).toBeLessThan(1e-9);
  });

  it("オイラー角の回転行列は three の YXZ と同じ", () => {
    const e: V3 = [0.3, -1.1, 0.4];
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...e, "YXZ"));
    const v = new THREE.Vector3(0.2, -0.5, 0.9).applyMatrix4(m);
    const w = apply3(eulerYXZ(e), [0.2, -0.5, 0.9]);
    expect(dist(w, v.toArray() as V3)).toBeLessThan(1e-12);
  });
});

describe("2 本の骨の IK", () => {
  const root: V3 = [0, 1.4, 0];
  it("届くときは、骨の長さを保ったまま手首が目標に着き、ひじは pole の側へ出る", () => {
    const target: V3 = [0.1, 1.5, 0.35];
    const { mid, end } = solveTwoBone(root, target, 0.3, 0.27, [0, -1, 0]);
    expect(dist(root, mid)).toBeCloseTo(0.3, 9);
    expect(dist(mid, end)).toBeCloseTo(0.27, 9);
    expect(dist(end, target)).toBeLessThan(1e-9);
    expect(mid[1]).toBeLessThan((root[1] + target[1]) / 2);
  });

  it("届かないときは、まっすぐ伸ばして目標の方向へ向ける", () => {
    const target: V3 = [0, 1.4, 2];
    const { mid, end } = solveTwoBone(root, target, 0.3, 0.27, [0, -1, 0]);
    expect(dist(root, end)).toBeCloseTo(0.57, 3);
    expect(end[2]).toBeGreaterThan(0.56);
    expect(Math.abs(mid[1] - 1.4)).toBeLessThan(0.01);
  });

  it("pole が骨の向きと重なっても、関節の位置は決まる", () => {
    const { mid } = solveTwoBone(root, [0, 1.1, 0], 0.3, 0.27, [0, -1, 0]);
    for (const v of mid) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("イージングと寄せ方", () => {
  it("どのイージングも 0 で 0、1 で 1", () => {
    for (const f of Object.values(easings)) {
      expect(f(0)).toBeCloseTo(0, 9);
      expect(f(1)).toBeCloseTo(1, 9);
    }
  });

  it("damp はコマの細かさによらず、同じ時間で同じだけ寄る", () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 0.2, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = damp(b, 1, 0.2, 1 / 30);
    expect(a).toBeCloseTo(b, 9);
    expect(damp(0, 1, 0.2, 0.2)).toBeCloseTo(0.5, 9);
  });
});
