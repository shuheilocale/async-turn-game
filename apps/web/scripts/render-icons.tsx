/**
 * ゲームのアイコン（icons.tsx・glyphs/ の SVG）を PNG に書き出す。LINE のカードは SVG を使えないため。
 * 画面のビルドの前に実行し、public/icons/<ゲームID>.png に置く（vite build が dist にそのまま写す）。
 * 色は styles.css の g-* の指定と、明るい画面の色の変数から読み取る
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { games } from "@atg/core";
import { GameGlyph } from "../src/icons.tsx";

const SIZE = 192;
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** styles.css から、明るい画面の色の変数と g-* の指定を取り出して、SVG の中に置ける CSS にする */
function glyphCss(): string {
  const css = readFileSync(here("../src/styles.css"), "utf8");
  const root = css.match(/:root\s*\{([^}]*)\}/)![1]!;
  const vars = Object.fromEntries([...root.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  const rules = [...css.matchAll(/(\.g-[\w.-]+)\s*\{([^}]*)\}/g)]
    .map((m) => `${m[1]} {${m[2]}}`)
    .join("\n")
    .replace(/var\((--[\w-]+)\)/g, (_, name: string) => vars[name] ?? "currentColor");
  return `path, circle, rect, text, line, ellipse, polygon, polyline { fill: none; stroke-linecap: round; stroke-linejoin: round; }\n${rules}`;
}

const style = glyphCss();
const out = here("../public/icons");
mkdirSync(out, { recursive: true });

for (const id of Object.keys(games)) {
  const markup = renderToStaticMarkup(<GameGlyph id={id} />);
  const inner = markup.slice(markup.indexOf(">") + 1, markup.lastIndexOf("</svg>"));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="-6 -6 76 76"><style>${style}</style>${inner}</svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: "Helvetica" } }).render().asPng();
  writeFileSync(`${out}/${id}.png`, png);
}
console.log(`icons: ${Object.keys(games).length} 個を public/icons/ に書き出しました`);
