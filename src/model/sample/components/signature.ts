import type { ComponentSource } from "../../types";
import { text } from "../util";

/**
 * A signature block with an ink pad: sign with a mouse, pen or finger in Edit
 * mode. Strokes are saved as points and drawn as filled SVG outlines by
 * perfect-freehand (pressure-aware with a pen), so print is pure vectors.
 */
export const signature: ComponentSource = {
  id: "signature",
  name: "Signature",
  entry: "index.tsx",
  dependencies: { "perfect-freehand": "1.2.3" },
  files: {
    "index.tsx": text(`import { defineElement, Editable, useElementState } from "@paged/sdk";
import { useMemo, useRef, useState } from "react";
import { addPoint, strokePath, PAD_W, PX_PER_MM, type Stroke } from "./ink";

type Props = { name: string; date: string; ink: string; height: number; penSize: number };

export default defineElement<Props>({
  label: "Signature",
  icon: "✍",
  fields: {
    name: { kind: "text", default: "Alex Morgan" },
    date: { kind: "text", default: "", placeholder: "e.g. 27 November 2026" },
    ink: { kind: "color", label: "Ink", default: "#2b2bff" },
    height: { kind: "number", label: "Height (mm)", default: 28, min: 12, max: 90 },
    penSize: { kind: "number", label: "Pen size", default: 5, min: 1, max: 20 },
  },
  render: ({ props, mode }) => {
    // Persisted with the element: the strokes, as points; drawn again with perfect-freehand.
    const [saved, setStrokes] = useElementState<Stroke[]>("strokes", []);
    const strokes = Array.isArray(saved) ? saved : [];
    const height = Math.max(10, Number(props.height) || 28);
    const viewH = Math.round(height * PX_PER_MM);
    const size = Math.max(0.5, Number(props.penSize) || 5);
    const paths = useMemo(() => strokes.map((s) => strokePath(s, size)), [saved, size]);

    // The stroke being drawn lives in a ref (redrawn on each move) until release.
    const live = useRef<{ id: number; stroke: Stroke; map: (x: number, y: number) => [number, number] } | null>(null);
    const [, redraw] = useState(0);
    const latest = useRef(strokes);
    latest.current = strokes;

    const edit = mode === "edit";
    const add = (ev: PointerEvent) => {
      const l = live.current!;
      const [x, y] = l.map(ev.clientX, ev.clientY);
      addPoint(l.stroke.pts, x, y, l.stroke.pen ? ev.pressure || 0.5 : 0.5);
    };
    const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      // The drawing is scaled to fit the pad's height, anchored bottom left.
      const s = Math.min(rect.width / PAD_W, rect.height / viewH) || 1;
      const top = rect.bottom - viewH * s;
      e.currentTarget.setPointerCapture(e.pointerId);
      live.current = {
        id: e.pointerId,
        stroke: e.pointerType === "pen" ? { pts: [], pen: true } : { pts: [] },
        map: (x, y) => [(x - rect.left) / s, (y - top) / s],
      };
      add(e.nativeEvent);
      redraw((n) => n + 1);
    };
    const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
      if (live.current?.id !== e.pointerId) return;
      // Every sample since the last frame, for smooth fast strokes.
      const events = e.nativeEvent.getCoalescedEvents?.();
      for (const ev of events && events.length ? events : [e.nativeEvent]) add(ev);
      redraw((n) => n + 1);
    };
    const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
      const l = live.current;
      if (l?.id !== e.pointerId) return;
      live.current = null;
      // One undo step per stroke (strokes drawn in quick succession merge into one).
      if (l.stroke.pts.length) setStrokes([...latest.current, l.stroke]);
      redraw((n) => n + 1);
    };
    const livePath = live.current ? strokePath(live.current.stroke, size, false) : "";
    const empty = !strokes.length && !livePath;

    return (
      <div className="signature">
        <div className="signature-pad" style={{ height: height + "mm" }}>
          <svg
            className={edit ? "signature-svg is-live" : "signature-svg"}
            viewBox={"0 0 " + PAD_W + " " + viewH}
            preserveAspectRatio="xMinYMax meet"
            {...(edit ? { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd } : {})}
          >
            <g fill={props.ink || "#2b2bff"}>
              {paths.map((d, i) => d && <path key={i} d={d} />)}
              {livePath && <path d={livePath} />}
            </g>
          </svg>
          <span className="signature-x" aria-hidden>×</span>
          {edit && empty && <span className="signature-hint">Sign here</span>}
          {edit && strokes.length > 0 && (
            <div className="signature-tools" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
              <button onClick={() => setStrokes(strokes.slice(0, -1))}>Undo stroke</button>
              <button onClick={() => setStrokes([])}>Clear</button>
            </div>
          )}
        </div>
        <Editable as="div" field="date" className="signature-date" placeholder="Date" />
        <div className="signature-rule" />
        <div className="signature-rule" />
        <div className="signature-label">Signature</div>
        <div className="signature-label">Date</div>
        <Editable as="div" field="name" className="signature-name" placeholder="Full name" />
      </div>
    );
  },
});
`),
    "ink.ts": text(`import { getStroke } from "perfect-freehand";

/**
 * One stroke as saved: flat [x, y, pressure, x, y, pressure, …] in pad units,
 * x and y to one decimal. \`pen\` marks real pen pressure; mouse and touch
 * strokes get pressure simulated from speed instead.
 */
export interface Stroke { pts: number[]; pen?: boolean }

/** The pad's drawing size in view units (about CSS px), for its share of an A4 line. */
export const PAD_W = 420;
export const PX_PER_MM = 96 / 25.4;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Adds a point to a stroke being drawn, skipping jitter closer than half a unit. */
export function addPoint(pts: number[], x: number, y: number, pressure: number) {
  const n = pts.length;
  if (n >= 3 && Math.hypot(pts[n - 3] - x, pts[n - 2] - y) < 0.5) return pts;
  pts.push(round1(x), round1(y), Math.round(pressure * 100) / 100);
  return pts;
}

/** A stroke's outline as SVG path data: a filled shape, thicker where pressed harder. */
export function strokePath(stroke: Stroke, size: number, done = true): string {
  const points: number[][] = [];
  for (let i = 0; i + 2 < stroke.pts.length; i += 3) points.push([stroke.pts[i], stroke.pts[i + 1], stroke.pts[i + 2]]);
  if (!points.length) return "";
  // Tapered ends, shortened on short strokes so a dot stays a dot.
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  const outline = getStroke(points, {
    size,
    thinning: 0.62,
    smoothing: 0.55,
    streamline: 0.4,
    simulatePressure: !stroke.pen,
    start: { taper: Math.min(size * 1.5, length / 4), cap: true },
    end: { taper: Math.min(size * 2.5, length / 3), cap: true },
    last: done,
  });
  return outlinePath(outline);
}

/** perfect-freehand's polygon, smoothed with quadratic curves through the midpoints. */
function outlinePath(points: number[][]): string {
  const n = points.length;
  if (n < 4) return "";
  const f = (v: number) => String(Math.round(v * 10) / 10);
  const mid = (a: number[], b: number[]) => f((a[0] + b[0]) / 2) + "," + f((a[1] + b[1]) / 2);
  let d = "M" + f(points[0][0]) + "," + f(points[0][1]) + "Q" + f(points[1][0]) + "," + f(points[1][1]) + " " + mid(points[1], points[2]) + "T";
  for (let i = 2; i < n - 1; i++) d += mid(points[i], points[i + 1]) + " ";
  return d + "Z";
}
`),
    "signature.css": text(`/* A contract signature block: the pad over a rule, the date beside it. */
.signature {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46mm;
  column-gap: 10mm;
  margin: 0 0 1em;
  break-inside: avoid;
}
.signature-pad { position: relative; min-width: 0; }
.signature-svg { display: block; width: 100%; height: 100%; }
.signature-svg.is-live { cursor: crosshair; touch-action: none; user-select: none; -webkit-user-select: none; }
.signature-x {
  position: absolute; left: 0; bottom: 0.6mm; font-size: 12pt; line-height: 1; color: #6b6760; pointer-events: none;
}
.signature-hint {
  position: absolute; inset: 0; display: grid; place-items: center;
  border: 1px dashed #ff5a1f; border-radius: 1.5mm; color: #ff5a1f;
  font: 600 9pt ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase;
  pointer-events: none;
}
.signature-tools { position: absolute; top: 1mm; right: 0; display: flex; gap: 1.5mm; }
.signature-tools button {
  font: 8pt ui-sans-serif, system-ui, sans-serif; color: #14120f; background: #ffffff;
  border: 1px solid #e7e3dc; border-radius: 4px; padding: 2px 7px; cursor: pointer;
}
.signature-tools button:hover { border-color: #ff5a1f; color: #ff5a1f; }
.signature-date { align-self: end; min-height: 1.5em; padding-bottom: 1.2mm; }
.signature-rule { border-top: 0.75pt solid #14120f; }
.signature-label {
  margin-top: 1.2mm; font-size: 7pt; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6760;
}
.signature-name { grid-column: 1; min-height: 1.5em; margin-top: 0.5mm; font-weight: 600; }
`),
  },
};
