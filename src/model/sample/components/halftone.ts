import type { ComponentSource } from "../../types";
import { text } from "../util";

/**
 * A vector halftone: an image (or another element's snapshot, such as the 3D
 * scene's) screened into dots on a rotated grid. Sampling needs a canvas, so
 * it runs in Edit mode and saves one ink level per cell; every mode draws the
 * dots from those levels as SVG.
 */
export const halftone: ComponentSource = {
  id: "halftone",
  name: "Halftone",
  entry: "index.tsx",
  dependencies: {},
  files: {
    "index.tsx": text(`import { defineElement, Editable, useDocument, useElementState } from "@paged/sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { cellSize, hash, sampleScreen, screenPath, VIEW_W, PX_PER_MM, type Screen, type Shape } from "./screen";

type Props = {
  image: string;
  source: string;
  cell: number;
  angle: number;
  shape: Shape;
  ink: string;
  paper: string;
  invert: boolean;
  height: number;
  caption: string;
};

export default defineElement<Props>({
  label: "Halftone",
  icon: "⁘",
  fields: {
    image: { kind: "image", help: "Used when Source is empty." },
    source: {
      kind: "text",
      label: "Source element",
      help: "Class or id of another element to screen: its saved snapshot (a 3D scene) or its image.",
      default: "",
      placeholder: "e.g. hero-scene",
    },
    cell: { kind: "number", label: "Cell size (mm)", default: 1.8, min: 0.8, max: 8 },
    angle: { kind: "number", label: "Screen angle (°)", default: 45, min: 0, max: 180 },
    shape: { kind: "select", options: ["dot", "square", "line"], default: "dot" },
    ink: { kind: "color", default: "#14120f" },
    paper: { kind: "color", default: "#ffffff" },
    invert: { kind: "boolean", label: "Invert (ink on light areas)", default: false },
    height: { kind: "number", label: "Height (mm)", default: 80, min: 20, max: 250 },
    caption: { kind: "text", default: "A vector halftone, screened from the image" },
  },
  render: ({ props, mode }) => {
    // Persisted with the element: the sampled ink levels, drawn as vectors in every mode.
    const [screen, setScreen] = useElementState<Screen | null>("screen", null);
    const source = useSource(props);
    const height = Math.max(10, Number(props.height) || 80);
    const w = VIEW_W;
    const h = Math.round(height * PX_PER_MM);
    const cell = cellSize(Math.max(0.3, Number(props.cell) || 1.8), w, h);
    const angle = Math.round((Number(props.angle) || 0) * 10) / 10;
    const fingerprint = useMemo(() => (source.url ? hash(source.url) : ""), [source.url]);
    const key = fingerprint && [fingerprint, w, h, cell, angle].join(":");
    const status = useSampler(mode, key, source.url, { w, h, cell, angle }, screen, setScreen);

    // Shape, colours and invert only change the drawing, not the samples.
    const d = useMemo(() => (screen ? screenPath(screen, props.shape, !!props.invert) : ""), [screen, props.shape, props.invert]);
    const paper = props.paper || "#ffffff";

    // Edit mode only: what's happening, or what's missing.
    const note = mode !== "edit" ? "" : status?.error || (status ? "Screening…" : source.note || (screen ? "" : "Screening…"));
    return (
      <figure className="halftone">
        <div className="halftone-view" style={{ height: height + "mm", background: paper }}>
          {screen && (
            <svg className="halftone-svg" viewBox={"0 0 " + screen.w + " " + screen.h} preserveAspectRatio="xMidYMid slice">
              <path d={d} fill={props.ink || "#14120f"} />
            </svg>
          )}
          {note && <span className="halftone-note">{note}</span>}
        </div>
        {props.caption && <Editable as="figcaption" field="caption" />}
      </figure>
    );
  },
});

/** The image to screen: another element's snapshot or image (by class or id), else the Image field. */
function useSource(props: Props): { url: string; note: string } {
  const doc = useDocument();
  const name = String(props.source ?? "").trim().replace(/^[.#]/, "");
  if (name) {
    const el = doc.find(name);
    const url = el && (el.state.snapshot || el.props.src || el.props.image);
    if (typeof url === "string" && url) return { url, note: "" };
    if (!props.image) {
      return { url: "", note: el ? "“" + name + "” has no image yet" : "No element with class or id “" + name + "”" };
    }
  }
  return props.image ? { url: props.image, note: "" } : { url: "", note: "Choose an image, or name a source element" };
}

/**
 * Samples the source in Edit mode when the key (source + settings) changes,
 * and saves the result. Only a change of key starts sampling, never a change
 * of the saved screen: undoing the screen alone won't resample (and push a
 * new undo step) over and over.
 */
function useSampler(
  mode: string,
  key: string,
  url: string,
  geometry: { w: number; h: number; cell: number; angle: number },
  screen: Screen | null,
  setScreen: (s: Screen) => void,
) {
  const [status, setStatus] = useState<{ key: string; error?: string } | null>(null);
  const latest = useRef({ key, saved: "", setScreen });
  latest.current = { key, saved: screen?.key ?? "", setScreen };
  const running = useRef("");

  useEffect(() => {
    // Also skips StrictMode's second run while the first is still sampling.
    if (mode !== "edit" || !key || key === latest.current.saved || running.current === key) return;
    running.current = key;
    setStatus({ key });
    sampleScreen(url, geometry.w, geometry.h, geometry.cell, geometry.angle).then(
      (levels) => {
        if (running.current === key) running.current = "";
        const now = latest.current;
        // Superseded by newer settings: drop it.
        if (now.key !== key) return;
        if (now.saved !== key) now.setScreen({ key, ...geometry, levels });
        setStatus(null);
      },
      (err) => {
        if (running.current === key) running.current = "";
        if (latest.current.key !== key) return;
        console.warn("halftone:", err);
        setStatus({ key, error: "Couldn't read the image: " + ((err as Error)?.message || "unknown error") });
      },
    );
  }, [mode, key]);

  return status && status.key === key ? status : null;
}
`),
    "screen.ts": text(`/**
 * A halftone screen: a rotated square grid of cells, each holding one ink
 * level. Sampling an image needs a canvas (Edit mode only); turning levels
 * into SVG is pure, so print draws the same dots from the saved levels.
 */

/** The drawing's width in view units (about CSS px on an A4 page). */
export const VIEW_W = 640;
export const PX_PER_MM = 96 / 25.4;
/** Above this many cells the screen gets coarser, to keep the document small. */
const MAX_CELLS = 12000;
/** One character per cell: 62 ink levels, from 0 (paper) to z (solid ink). */
const LEVELS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TOP = LEVELS.length - 1;

/** What's saved in the element's state. */
export interface Screen {
  /** Hash of the source image and the settings below, to know when to sample again. */
  key: string;
  w: number;
  h: number;
  cell: number;
  angle: number;
  levels: string;
}

export type Shape = "dot" | "square" | "line";

/** The cell size in view units for a size in mm, coarsened if there would be too many cells. */
export function cellSize(mm: number, w: number, h: number) {
  const cell = Math.max(mm * PX_PER_MM, Math.sqrt((w * h) / MAX_CELLS), 2);
  return Math.round(cell * 100) / 100;
}

/** FNV-1a: a short fingerprint of a (long) data URL. */
export function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + "." + text.length.toString(36);
}

/**
 * The cell centres of a grid turned by \`angle\` degrees, covering w × h with a
 * cell to spare on each side, row by row (each row is a run of neighbours).
 */
export function lattice(w: number, h: number, cell: number, angle: number) {
  const a = (angle * Math.PI) / 180;
  const ux = Math.cos(a) * cell;
  const uy = Math.sin(a) * cell;
  const n = Math.ceil(Math.hypot(w, h) / 2 / cell) + 1;
  const rows: { x: number; y: number }[][] = [];
  for (let j = -n; j <= n; j++) {
    const row = [];
    for (let i = -n; i <= n; i++) {
      const x = w / 2 + i * ux - j * uy;
      const y = h / 2 + i * uy + j * ux;
      if (x > -cell && x < w + cell && y > -cell && y < h + cell) row.push({ x, y });
    }
    if (row.length) rows.push(row);
  }
  return rows;
}

/** Decodes an image and reads one ink level per cell (darker = more ink). Browser only. */
export async function sampleScreen(url: string, w: number, h: number, cell: number, angle: number): Promise<string> {
  const img = new Image();
  if (/^https?:/.test(url)) img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("The image is empty.");

  // Draw the image (cropped to fill, like object-fit: cover) at about two
  // pixels per cell: the downscale averages each cell's neighbourhood.
  const scale = 2 / cell;
  const cw = Math.max(2, Math.round(w * scale));
  const ch = Math.max(2, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const fit = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  const dw = img.naturalWidth * fit;
  const dh = img.naturalHeight * fit;
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  const data = ctx.getImageData(0, 0, cw, ch).data; // throws on a cross-origin image without CORS

  // Luminance at a canvas position, bilinear between the four nearest pixels.
  const lum = (px: number, py: number) => {
    const x = Math.max(0, Math.min(cw - 1.001, px - 0.5));
    const y = Math.max(0, Math.min(ch - 1.001, py - 0.5));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const at = (xx: number, yy: number) => {
      const k = (yy * cw + xx) * 4;
      return 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
    };
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return (top * (1 - fy) + bottom * fy) / 255;
  };

  // Each cell: its centre and four points around it, averaged.
  const o = 0.3 * cell * scale;
  let levels = "";
  for (const row of lattice(w, h, cell, angle)) {
    for (const p of row) {
      const cx = p.x * scale;
      const cy = p.y * scale;
      const l = (lum(cx, cy) * 2 + lum(cx - o, cy - o) + lum(cx + o, cy - o) + lum(cx - o, cy + o) + lum(cx + o, cy + o)) / 6;
      levels += LEVELS[Math.round((1 - l) * TOP)];
    }
  }
  return levels;
}

const f = (n: number) => String(Math.round(n * 10) / 10);

/** The screen as one SVG path: dots, squares or lines whose size follows the ink level. */
export function screenPath(s: Screen, shape: Shape, invert: boolean): string {
  if (!s || typeof s.levels !== "string") return "";
  const rows = lattice(s.w, s.h, s.cell, s.angle);
  const count = rows.reduce((n, r) => n + r.length, 0);
  // Saved by another version of this code: don't draw garbage.
  if (count !== s.levels.length) return "";

  const c = s.cell;
  const a = (s.angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const out: string[] = [];
  let k = 0;
  for (const row of rows) {
    const inks = row.map(() => {
      const v = LEVELS.indexOf(s.levels[k++]) / TOP;
      return invert ? 1 - v : Math.max(0, v);
    });

    if (shape === "line") {
      // One band per row, as thick as the ink there: an engraving look.
      // (Solid ink overlaps the next band a little, so no hairline seams show.)
      const top: string[] = [];
      const bottom: string[] = [];
      row.forEach((p, i) => {
        const t = (inks[i] * c * 1.04) / 2;
        top.push(f(p.x - sin * t) + " " + f(p.y + cos * t));
        bottom.unshift(f(p.x + sin * t) + " " + f(p.y - cos * t));
      });
      if (inks.some((v) => v > 0.02)) out.push("M" + top.join("L") + "L" + bottom.join("L") + "Z");
      continue;
    }

    row.forEach((p, i) => {
      const v = inks[i];
      if (v < 0.02) return;
      if (shape === "square") {
        // Area proportional to ink, turned with the screen; solid squares overlap a hair.
        const half = (c * Math.sqrt(v) * 1.03) / 2;
        const ax = (cos - sin) * half;
        const ay = (sin + cos) * half;
        out.push(
          "M" + f(p.x - ax) + " " + f(p.y - ay) +
          "l" + f(2 * cos * half) + " " + f(2 * sin * half) +
          "l" + f(-2 * sin * half) + " " + f(2 * cos * half) +
          "l" + f(-2 * cos * half) + " " + f(-2 * sin * half) + "z",
        );
      } else {
        // Area proportional to ink until the dots touch, then growing to cover the cell.
        const touch = Math.PI / 4;
        const r = v <= touch ? c * Math.sqrt(v / Math.PI) : c / 2 + ((v - touch) / (1 - touch)) * (c * 0.73 - c / 2);
        out.push("M" + f(p.x - r) + " " + f(p.y) + "a" + f(r) + " " + f(r) + " 0 1 0 " + f(2 * r) + " 0a" + f(r) + " " + f(r) + " 0 1 0 " + f(-2 * r) + " 0");
      }
    });
  }
  return out.join("");
}
`),
    "halftone.css": text(`.halftone { margin: 0 0 1em; break-inside: avoid; }
.halftone-view { position: relative; width: 100%; overflow: hidden; }
.halftone-svg { display: block; width: 100%; height: 100%; }
.halftone-note {
  position: absolute; left: 2.5mm; bottom: 2mm; padding: 2px 7px; border-radius: 4px;
  font: 8pt ui-sans-serif, system-ui, sans-serif; color: #6b6760; background: rgba(255, 255, 255, 0.85);
  border: 1px solid #e7e3dc; pointer-events: none;
}
.halftone figcaption { margin-top: 2mm; }
`),
  },
};
