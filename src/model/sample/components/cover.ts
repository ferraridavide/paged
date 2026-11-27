import type { ComponentSource } from "../../types";
import { text } from "../util";

/**
 * A full-bleed generative cover: seeded SVG art (contour lines, a flow field
 * or Truchet tiles) under an editable title. Pure SVG, so it prints as vectors.
 * It bleeds past the page margins by reading the page settings with
 * useDocument(), and shows live document stats.
 */
export const cover: ComponentSource = {
  id: "cover",
  name: "Cover",
  entry: "index.tsx",
  dependencies: {},
  files: {
    "index.tsx": text(`import { defineElement, Editable, useDocument, useElement } from "@paged/sdk";
import { useMemo } from "react";
import { drawArt, PALETTES, type ArtStyle, type PaletteName } from "./art";

type Props = {
  kicker: string;
  title: string;
  subtitle: string;
  style: ArtStyle;
  palette: PaletteName;
  seed: number;
};

/** Paper sizes in mm, portrait. */
const SIZES: Record<string, [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

export default defineElement<Props>({
  label: "Cover",
  icon: "✺",
  fields: {
    kicker: { kind: "text", default: "A document that dares" },
    title: { kind: "text", default: "Can your word processor do this?" },
    subtitle: { kind: "textarea", default: "Every block in this document is a React component." },
    style: { kind: "select", options: ["contours", "flow", "truchet"], default: "contours" },
    palette: { kind: "select", options: Object.keys(PALETTES), default: "signal" },
    seed: { kind: "number", help: "Same seed, same picture.", default: 7, min: 0, max: 99999 },
  },
  render: ({ props, mode }) => {
    const doc = useDocument();
    const { update } = useElement();
    const page = doc.page;
    let [w, h] = SIZES[page.size] ?? SIZES.A4;
    if (page.orientation === "landscape") [w, h] = [h, w];
    const margin = page.margin ?? { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" };
    const palette = PALETTES[props.palette] ?? PALETTES.signal;
    const art = useMemo(() => drawArt(props.style, palette, props.seed, w, h), [props.style, props.palette, props.seed, w, h]);

    // The element fills the content box; the art is pulled out to the paper's
    // edges. Nothing may hang past the page: focusing the title would scroll it.
    const bleed = {
      left: "calc(-1 * " + margin.left + ")",
      top: "calc(-1 * " + margin.top + ")",
      width: w + "mm",
      height: h + "mm",
      background: palette.bg,
      color: palette.text,
      "--cover-accent": palette.accent,
      "--cover-pad-x": margin.left,
      "--cover-pad-y": margin.top,
    } as React.CSSProperties;

    const stats = [
      doc.pages ? doc.pages + " pages" : null,
      doc.stats.components + " components",
      doc.stats.words.toLocaleString("en") + " words",
    ].filter(Boolean).join("  ·  ");

    return (
      <div className="cover" style={{ height: "calc(" + h + "mm - " + margin.top + " - " + margin.bottom + ")" }}>
        <div className="cover-bleed" style={bleed}>
          <svg className="cover-art" viewBox={"0 0 " + w + " " + h} preserveAspectRatio="xMidYMid slice">
            {art.map((p, i) => (
              <path key={i} d={p.d} fill={p.fill ?? "none"} stroke={p.stroke ?? "none"} strokeWidth={p.width} opacity={p.opacity} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            <defs>
              <linearGradient id="cover-fade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0.35" stopColor={palette.bg} stopOpacity="0" />
                <stop offset="0.92" stopColor={palette.bg} stopOpacity="0.92" />
              </linearGradient>
            </defs>
            <rect width={w} height={h} fill="url(#cover-fade)" />
          </svg>

          <div className="cover-top">
            <Editable as="span" field="kicker" className="cover-kicker" />
            <span className="cover-mark">¶ paged</span>
          </div>
          <div className="cover-bottom">
            <Editable as="div" field="title" className="cover-title" />
            <Editable as="div" field="subtitle" className="cover-subtitle" multiline />
            <div className="cover-stats">{stats}</div>
          </div>

          {mode === "edit" && (
            <button
              className="cover-reroll"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => update({ seed: Math.floor(Math.random() * 99999) })}
            >
              ↻ New cover
            </button>
          )}
        </div>
      </div>
    );
  },
});
`),
    "art.ts": text(`/**
 * Seeded generative art as SVG paths, in millimetres. Everything comes from
 * the seed, so the same seed draws the same cover in Edit, Preview and print.
 */
export type ArtStyle = "contours" | "flow" | "truchet";
export type PaletteName = keyof typeof PALETTES;

export interface Palette {
  bg: string;
  text: string;
  accent: string;
  ink: string[];
}

export const PALETTES = {
  signal: { bg: "#0d0f1a", text: "#ffffff", accent: "#ff5a1f", ink: ["#2b2bff", "#5b4dff", "#9b5cff", "#ff5a1f", "#ffb38a"] },
  paper: { bg: "#f4f1ea", text: "#14120f", accent: "#ff5a1f", ink: ["#d9d3c7", "#a39d92", "#6b6760", "#14120f", "#ff5a1f"] },
  aurora: { bg: "#06141b", text: "#f2fffb", accent: "#00e0b8", ink: ["#0b5f73", "#00e0b8", "#2b8cff", "#b14bff", "#ff5a8a"] },
} satisfies Record<string, Palette>;

export interface ArtPath {
  d: string;
  stroke?: string;
  fill?: string;
  width?: number;
  opacity?: number;
}

/** mulberry32: a tiny seeded PRNG. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D gradient (Perlin) noise with fractal octaves, in about -1..1. */
function makeNoise(rand: () => number) {
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h: number, x: number, y: number) => {
    const g = h & 7;
    const u = g < 4 ? x : y;
    const v = g < 4 ? y : x;
    return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v);
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x: number, y: number) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const a = perm[X] + Y;
    const b = perm[X + 1] + Y;
    const lerp = (t: number, m: number, n: number) => m + t * (n - m);
    return lerp(v, lerp(u, grad(perm[a], x, y), grad(perm[b], x - 1, y)), lerp(u, grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1))) / 2.2;
  };
  return (x: number, y: number) => noise(x, y) + 0.5 * noise(x * 2.1 + 17, y * 2.1 + 9) + 0.25 * noise(x * 4.3 + 3, y * 4.3 + 41);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Topographic lines: marching squares over a noise field. */
function contours(rand: () => number, pal: Palette, w: number, h: number): ArtPath[] {
  const noise = makeNoise(rand);
  const step = 2.5;
  const cols = Math.ceil(w / step) + 1;
  const rows = Math.ceil(h / step) + 1;
  const scale = 0.011 + rand() * 0.006;
  const ox = rand() * 100;
  const oy = rand() * 100;
  const field = new Float32Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      // A gentle slope lifts the top of the page into "mountains".
      const v = noise(ox + i * step * scale, oy + j * step * scale) - (j / rows) * 0.35;
      field[j * cols + i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const levels = 16;
  const out: ArtPath[] = [];
  for (let k = 1; k < levels; k++) {
    const t = k / levels;
    const iso = min + (max - min) * t;
    let d = "";
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = field[j * cols + i];
        const b = field[j * cols + i + 1];
        const c = field[(j + 1) * cols + i + 1];
        const e = field[(j + 1) * cols + i];
        const code = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (e > iso ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const x = i * step;
        const y = j * step;
        const lerp = (p: number, q: number) => (iso - p) / (q - p);
        const top = [x + step * lerp(a, b), y];
        const right = [x + step, y + step * lerp(b, c)];
        const bottom = [x + step * lerp(e, c), y + step];
        const left = [x, y + step * lerp(a, e)];
        const seg = (p: number[], q: number[]) => {
          d += "M" + r1(p[0]) + " " + r1(p[1]) + "L" + r1(q[0]) + " " + r1(q[1]);
        };
        switch (code) {
          case 1: case 14: seg(left, bottom); break;
          case 2: case 13: seg(bottom, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(top, right); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, top); break;
          case 5: seg(left, top); seg(bottom, right); break;
          case 10: seg(top, right); seg(left, bottom); break;
        }
      }
    }
    const ink = pal.ink[Math.min(pal.ink.length - 1, Math.floor(t * pal.ink.length))];
    out.push({ d, stroke: ink, width: k % 4 === 0 ? 0.55 : 0.28, opacity: 0.35 + t * 0.65 });
  }
  return out;
}

/** Streamlines through a noise-driven vector field. */
function flow(rand: () => number, pal: Palette, w: number, h: number): ArtPath[] {
  const noise = makeNoise(rand);
  const scale = 0.008 + rand() * 0.006;
  const turn = 2 + rand() * 2;
  const byInk: string[] = pal.ink.map(() => "");
  for (let n = 0; n < 520; n++) {
    let x = rand() * w;
    let y = rand() * h;
    const ink = Math.min(pal.ink.length - 1, Math.floor((y / h) * pal.ink.length * 0.999 + rand() * 0.8));
    let d = "M" + r1(x) + " " + r1(y);
    for (let s = 0; s < 46; s++) {
      const a = noise(x * scale, y * scale) * Math.PI * turn;
      x += Math.cos(a) * 1.6;
      y += Math.sin(a) * 1.6;
      if (x < -5 || y < -5 || x > w + 5 || y > h + 5) break;
      d += "L" + r1(x) + " " + r1(y);
    }
    byInk[ink] += d;
  }
  return byInk.map((d, i) => ({ d, stroke: pal.ink[i], width: 0.35, opacity: 0.85 }));
}

/** Quarter-circle Truchet tiles, with a few filled dots. */
function truchet(rand: () => number, pal: Palette, w: number, h: number): ArtPath[] {
  const size = 9 + Math.floor(rand() * 5);
  const r = size / 2;
  const byInk: string[] = pal.ink.map(() => "");
  let dots = "";
  for (let y = 0; y < h + size; y += size) {
    for (let x = 0; x < w + size; x += size) {
      const ink = Math.min(pal.ink.length - 1, Math.floor((1 - y / h) * pal.ink.length * 0.999 + rand() * 1.2));
      const flip = rand() < 0.5;
      const arc = (cx: number, cy: number, sx: number, sy: number, ex: number, ey: number) =>
        "M" + r1(sx) + " " + r1(sy) + "A" + r + " " + r + " 0 0 " + (cx === x === (cy === y) ? 1 : 0) + " " + r1(ex) + " " + r1(ey);
      byInk[Math.max(0, ink)] += flip
        ? arc(x, y, x + r, y, x, y + r) + arc(x + size, y + size, x + size - r, y + size, x + size, y + size - r)
        : arc(x + size, y, x + size - r, y, x + size, y + r) + arc(x, y + size, x + r, y + size, x, y + size - r);
      if (rand() < 0.04) dots += "M" + r1(x + r - 1.2) + " " + r1(y + r) + "a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0";
    }
  }
  return [
    ...byInk.map((d, i) => ({ d, stroke: pal.ink[i], width: 0.9, opacity: 0.9 })),
    { d: dots, fill: pal.accent },
  ];
}

export function drawArt(style: ArtStyle, pal: Palette, seed: number, w: number, h: number): ArtPath[] {
  const rand = rng(Number(seed) || 0);
  if (style === "flow") return flow(rand, pal, w, h);
  if (style === "truchet") return truchet(rand, pal, w, h);
  return contours(rand, pal, w, h);
}
`),
    "cover.css": text(`.cover { position: relative; }
.cover-bleed {
  position: absolute;
  box-sizing: border-box;
  overflow: hidden;
  padding: var(--cover-pad-y) var(--cover-pad-x);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.cover-art { position: absolute; inset: 0; width: 100%; height: 100%; }
.cover-top, .cover-bottom { position: relative; }
.cover-top {
  display: flex; justify-content: space-between; align-items: baseline;
  font: 600 8pt/1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.14em; text-transform: uppercase;
}
.cover-kicker { color: var(--cover-accent); }
.cover-mark { opacity: 0.75; }
.cover-bottom { padding-bottom: 6mm; }
.cover-title {
  font: italic 400 50pt/0.98 "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  letter-spacing: -0.02em; max-width: 150mm; margin: 0 0 7mm; text-wrap: balance;
}
.cover-subtitle { font-size: 12.5pt; line-height: 1.45; max-width: 120mm; opacity: 0.88; white-space: pre-wrap; text-wrap: pretty; }
.cover-stats {
  margin-top: 9mm; padding-top: 3mm; border-top: 0.3mm solid var(--cover-accent); display: inline-block;
  font: 500 7.5pt/1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;
}
.cover-reroll {
  position: absolute; right: var(--cover-pad-x); top: calc(var(--cover-pad-y) + 8mm);
  font: 600 8pt ui-sans-serif, system-ui, sans-serif; color: inherit; cursor: pointer;
  background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.35); border-radius: 99px; padding: 4px 11px;
  backdrop-filter: blur(6px);
}
.cover-reroll:hover { background: var(--cover-accent); border-color: var(--cover-accent); color: #fff; }
`),
  },
};
