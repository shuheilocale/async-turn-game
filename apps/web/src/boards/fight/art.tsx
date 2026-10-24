import type { ReactNode } from "react";
import type { Fight } from "@atg/core";

/**
 * バックボーン・ファイトの小さな絵（SVG）。色は currentColor なので、置いた場所の文字色になる。
 * 線は .fight-icon の stroke の指定（FightBoard.css）で描き、塗りは fill="currentColor" の部分だけ
 */

/** バックボーンの印。道具や道着など、その格闘技でいちばん目に入るもの */
const STYLE_ART: Record<Fight.StyleId, ReactNode> = {
  // 帯の結び目と、たれた 2 本の端
  karate: (
    <>
      <path d="M3 11h26v5H3z" fill="currentColor" stroke="none" />
      <rect x="12.5" y="8.5" width="7" height="10" rx="2" fill="currentColor" />
      <path d="M14 18 10.5 28M18 18l3.5 10" strokeWidth="3.2" />
    </>
  ),
  // モンコン（頭に付ける輪）と、後ろにたれる布
  muaythai: (
    <>
      <ellipse cx="15" cy="13" rx="11" ry="5.5" strokeWidth="3" />
      <path d="M25 16c3 4 3 8 1 12" strokeWidth="3" />
      <path d="M21 17.5c2 3 2 6 1 9" strokeWidth="2" />
    </>
  ),
  // ボクシンググローブ
  boxing: (
    <>
      <path d="M5 14c0-6 4-9 9-9h4c5 0 9 3 9 8v4c0 3-2 5-4 6v5H10v-5c-3-2-5-5-5-9z" fill="currentColor" />
      <path d="M7.5 15.5c2.5 2.2 6 2.2 8.5 0M10 23.5h13" className="fight-icon-cut" strokeWidth="1.8" />
    </>
  ),
  // 八角形の金網
  mma: (
    <>
      <path d="M11 3h10l7 7v10l-7 7H11l-7-7V10z" strokeWidth="2.6" />
      <path d="M11 3 16 15 21 3M28 10 16 15l12 5M21 27l-5-12-5 12M4 20l12-5L4 10" strokeWidth="1.2" />
    </>
  ),
  // 柔道着のえりと帯
  judo: (
    <>
      <path d="M7 6 12.5 4 16 13l3.5-9L25 6l2 22H5z" strokeWidth="2.4" />
      <path d="M12.5 4 18 20M19.5 4 14 20" strokeWidth="2.4" />
      <path d="M5.5 20h21" strokeWidth="3.4" />
    </>
  ),
  // 三角絞め（脚で作った三角の中に、相手の頭と腕）
  bjj: (
    <>
      <path d="M4 26 16 5l12 21z" strokeWidth="3" />
      <circle cx="16" cy="18" r="3.6" fill="currentColor" stroke="none" />
      <path d="M16 22v4" strokeWidth="2.4" />
    </>
  ),
  // ビリンバウ（弓に張った弦と、ひょうたん）
  capoeira: (
    <>
      <path d="M11 3c-6 8-6 18 0 26" strokeWidth="2.6" />
      <path d="M11 3v26" strokeWidth="1.3" />
      <circle cx="14.5" cy="22" r="4.5" fill="currentColor" stroke="none" />
      <path d="M17 11l7-3M18.5 13.5l6.5 1" strokeWidth="2" />
    </>
  ),
  // 胴（ホグ）と、まん中の丸
  taekwondo: (
    <>
      <path d="M8 4h16l2 7v9c0 5-5 8-10 8S6 25 6 20v-9z" strokeWidth="2.4" />
      <circle cx="16" cy="15.5" r="4.5" strokeWidth="2.2" />
      <path d="M11.6 15.5a4.4 4.4 0 0 0 8.8 0" fill="currentColor" />
    </>
  ),
  // レスリングのシングレット
  wrestling: (
    <>
      <path d="M11 3v6c3 3 7 3 10 0V3" strokeWidth="2.4" />
      <path d="M9 9.5c5 4 9 4 14 0l2 18H7z" fill="currentColor" stroke="none" />
      <path d="M16 15v9" className="fight-icon-cut" strokeWidth="1.6" />
    </>
  ),
  // まわしと、さがり
  sumo: (
    <>
      <path d="M4 8h24v7H4z" fill="currentColor" stroke="none" />
      <path d="M8 15v11M12 15v13M16 15v13M20 15v13M24 15v11" strokeWidth="2" />
    </>
  ),
};

export function StyleIcon({ style, className = "" }: { style: Fight.StyleId; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`fight-icon ${className}`} aria-hidden>
      {STYLE_ART[style]}
    </svg>
  );
}

/** 技の種類の印。打撃はこぶし、組みはつかむ手、守りは盾（かわしは曲がった矢印、カウンターは稲妻、返しは回る矢印） */
type MoveArt = Fight.MoveClass | Fight.GuardKind;
const MOVE_ART: Record<MoveArt, ReactNode> = {
  strike: (
    <>
      <rect x="5" y="8" width="13" height="10" rx="3" fill="currentColor" stroke="none" />
      <path d="M9 8v4M13 8v4" className="fight-icon-cut" strokeWidth="1.5" />
      <path d="M5 13.5h4" className="fight-icon-cut" strokeWidth="1.5" />
      <path d="M20 6l2-2M21 11h2.5M20 16l2 2" strokeWidth="1.8" />
    </>
  ),
  // 2 本の手が組み合ったところ（かぎ形が互いに引っかかる）
  grab: (
    <>
      <path d="M3 14V11a5 5 0 0 1 10 0v3" strokeWidth="2.6" />
      <path d="M11 10v3a5 5 0 0 0 10 0v-3" strokeWidth="2.6" />
    </>
  ),
  guard: (
    <path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="currentColor" stroke="none" />
  ),
  block: (
    <path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="currentColor" stroke="none" />
  ),
  dodge: (
    <>
      <path d="M4 18c2-8 8-12 15-12" strokeWidth="2.4" />
      <path d="M15 3l4 3-3 4" strokeWidth="2.4" />
      <circle cx="7" cy="8" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  counter: (
    <>
      <path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" strokeWidth="2" />
      <path d="M13 6.5 9 13h4l-2 5 5-7h-4z" fill="currentColor" stroke="none" />
    </>
  ),
  catch: (
    <>
      <path d="M5 12a7 7 0 0 1 12-5" strokeWidth="2.4" />
      <path d="M17 3v4h-4" strokeWidth="2.4" />
      <path d="M19 12a7 7 0 0 1-12 5" strokeWidth="2.4" />
      <path d="M7 21v-4h4" strokeWidth="2.4" />
    </>
  ),
};

export function MoveIcon({ tech, className = "" }: { tech: Fight.Technique; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`fight-icon ${className}`} aria-hidden>
      {MOVE_ART[tech.guard ?? tech.cls]}
    </svg>
  );
}

/** 位置関係の印。立ちは離れた 2 人、組み合いはくっついた 2 人、寝技は横になった 2 人 */
const POSITION_ART: Record<Fight.Position, ReactNode> = {
  standing: (
    <>
      <circle cx="8" cy="5" r="2.6" fill="currentColor" stroke="none" />
      <path d="M8 9v6M8 15l-2.5 5M8 15l2.5 5M8 11l3 2" strokeWidth="2" />
      <circle cx="24" cy="5" r="2.6" fill="currentColor" stroke="none" />
      <path d="M24 9v6M24 15l-2.5 5M24 15l2.5 5M24 11l-3 2" strokeWidth="2" />
    </>
  ),
  clinch: (
    <>
      <circle cx="12" cy="5" r="2.6" fill="currentColor" stroke="none" />
      <path d="M12.5 9 14 15M14 15l-3 5M14 15l1.5 5M13 10.5l5 1" strokeWidth="2" />
      <circle cx="20" cy="5" r="2.6" fill="currentColor" stroke="none" />
      <path d="M19.5 9 18 15M18 15l3 5M18 15l-1.5 5M19 10.5l-5 1" strokeWidth="2" />
    </>
  ),
  ground: (
    <>
      <circle cx="5" cy="15" r="2.6" fill="currentColor" stroke="none" />
      <path d="M9 16h10l5 3M19 16l6-1" strokeWidth="2" />
      <circle cx="11" cy="8.5" r="2.6" fill="currentColor" stroke="none" />
      <path d="M14.5 9.5h8l4 3M22 9.5l4 -2" strokeWidth="2" />
      <path d="M2 21h28" strokeWidth="1.4" />
    </>
  ),
};

export function PositionIcon({ position, className = "" }: { position: Fight.Position; className?: string }) {
  return (
    <svg viewBox="0 0 32 22" className={`fight-icon ${className}`} aria-hidden>
      {POSITION_ART[position]}
    </svg>
  );
}
