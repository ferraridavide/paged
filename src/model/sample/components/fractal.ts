import type { ComponentSource } from "../../types";
import { text } from "../util";

/**
 * A Mandelbrot explorer drawn by a WebGL fragment shader: pan and zoom in
 * Edit mode; the view and a still are saved for print, like the 3D scene.
 */
export const fractal: ComponentSource = {
  id: "fractal",
  name: "Fractal",
  entry: "index.tsx",
  dependencies: {},
  files: {
    "index.tsx": text(`import { defineElement, Editable, useElementState } from "@paged/sdk";
import { useEffect, useRef, useState } from "react";
import {
  createFractal, clampView, minScale, iterationsFor, zoomOf, DEFAULT_VIEW,
  type Fractal, type Palette, type View,
} from "./fractal";

type Props = { palette: Palette; iterations: number; height: number; caption: string };

export default defineElement<Props>({
  label: "Fractal",
  icon: "❋",
  fields: {
    palette: { kind: "select", options: ["ember", "ultramarine", "mono"], default: "ember" },
    iterations: {
      kind: "number",
      label: "Iterations",
      help: "At the whole-set view; deeper zooms use more.",
      default: 200,
      min: 50,
      max: 1000,
    },
    height: { kind: "number", label: "Height (mm)", default: 85, min: 40, max: 220 },
    caption: { kind: "text", default: "The Mandelbrot set near Seahorse Valley, computed on the GPU as you pan and zoom" },
  },
  render: ({ props, mode }) => {
    // Persisted with the element: where the view is, and a still for print.
    const [view, setView] = useElementState<View>("view", DEFAULT_VIEW);
    const [snapshot, setSnapshot] = useElementState<string>("snapshot", "");
    // What the still shows, so it's only redrawn when something changed.
    const [snapshotOf, setSnapshotOf] = useElementState<string>("snapshotOf", "");
    const size = { height: props.height + "mm" };

    return (
      <figure className="fractal">
        {mode === "print" ? (
          snapshot ? (
            <img className="fractal-view" src={snapshot} style={size} alt="" />
          ) : (
            <div className="fractal-view fractal-empty" style={size}>Open in Edit mode to render this fractal</div>
          )
        ) : (
          <Viewport
            props={props}
            view={view}
            snapshotOf={snapshotOf}
            // State sets in a row are one undo step.
            onCommit={(v, still, of) => {
              if (v) setView(v);
              setSnapshot(still);
              setSnapshotOf(of);
            }}
            style={size}
          />
        )}
        {props.caption && <Editable as="figcaption" field="caption" />}
      </figure>
    );
  },
});

const HINT = "Drag to pan · scroll or double-click to zoom (shift: out)";

/** The live WebGL view (Edit mode only): pan and zoom, saved on release. */
function Viewport({ props, view, snapshotOf, onCommit, style }: {
  props: Props;
  view: View;
  snapshotOf: string;
  onCommit: (view: View | null, snapshot: string, of: string) => void;
  style: React.CSSProperties;
}) {
  const host = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLSpanElement>(null);
  const live = useRef<any>(null);
  const latest = useRef({ props, snapshotOf, onCommit });
  latest.current = { props, snapshotOf, onCommit };
  const [failed, setFailed] = useState(false);

  // Create the canvas and GL context once.
  useEffect(() => {
    const el = host.current!;
    const canvas = document.createElement("canvas");
    el.prepend(canvas);
    const gl: Fractal | null = createFractal(canvas);
    if (!gl) {
      canvas.remove();
      setFailed(true);
      return;
    }

    let cur: View = { ...view };
    let drag: { id: number; x: number; y: number; from: View; moved: boolean } | null = null;
    let frame = 0;
    let commitTimer: ReturnType<typeof setTimeout> | undefined;
    let snapTimer: ReturnType<typeof setTimeout> | undefined;
    const cssSize = () => ({ w: el.clientWidth, h: el.clientHeight });
    const dpr = () => Math.min(2, window.devicePixelRatio || 1);
    const keyOf = (v: View) => {
      const { w, h } = cssSize();
      const p = latest.current.props;
      return JSON.stringify([v.cx, v.cy, v.scale, p.palette, p.iterations, w, h]);
    };

    const draw = (ratio = dpr()) => {
      const { w, h } = cssSize();
      if (!w || !h) return false;
      const p = latest.current.props;
      gl.setSize(Math.round(w * ratio), Math.round(h * ratio));
      gl.draw(cur, p.palette, iterationsFor(p.iterations, cur.scale));
      if (hint.current) {
        const deepest = cur.scale <= minScale(cur, h, gl.highp) * 1.01;
        hint.current.textContent =
          HINT + " · ×" + Math.round(zoomOf(cur.scale)).toLocaleString("en-US") +
          (deepest ? " · as deep as 32-bit GPU floats go" : "");
      }
      return true;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
    };

    // The still for print: always 2× the box, whatever the screen.
    const still = () => {
      if (gl.lost() || !draw(2)) return null;
      const url = gl.canvas.toDataURL("image/jpeg", 0.86);
      draw();
      return url;
    };
    const commit = (v: View | null) => {
      clearTimeout(commitTimer);
      clearTimeout(snapTimer);
      const url = still();
      if (url) latest.current.onCommit(v, url, keyOf(cur));
    };
    // Props or size changed: redraw, and refresh the still if it no longer matches.
    const refresh = () => {
      draw();
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        if (!drag && keyOf(cur) !== latest.current.snapshotOf) commit(null);
      }, 300);
    };

    const toComplex = (e: { clientX: number; clientY: number }, v: View) => {
      const r = el.getBoundingClientRect();
      const { w, h } = cssSize();
      // The editor may scale the page: map screen pixels to the box's CSS pixels.
      const x = ((e.clientX - r.left) / r.width) * w - w / 2;
      const y = h / 2 - ((e.clientY - r.top) / r.height) * h;
      const k = (2 * v.scale) / h;
      return { x, y, k, cx: v.cx + x * k, cy: v.cy + y * k };
    };
    const zoomAt = (e: { clientX: number; clientY: number }, factor: number) => {
      const p = toComplex(e, cur);
      const next = clampView({ ...cur, scale: cur.scale * factor }, cssSize().h, gl.highp);
      const k = (2 * next.scale) / cssSize().h;
      cur = clampView({ cx: p.cx - p.x * k, cy: p.cy - p.y * k, scale: next.scale }, cssSize().h, gl.highp);
    };

    const onDown = (e: PointerEvent) => {
      if (drag) return;
      canvas.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: { ...cur }, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const r = el.getBoundingClientRect();
      const toCss = el.clientHeight / (r.height || 1);
      const dx = (e.clientX - drag.x) * toCss;
      const dy = (e.clientY - drag.y) * toCss;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      const k = (2 * drag.from.scale) / el.clientHeight;
      cur = clampView({ cx: drag.from.cx - dx * k, cy: drag.from.cy + dy * k, scale: drag.from.scale }, el.clientHeight, gl.highp);
      schedule();
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      if (moved) commit({ ...cur });
    };
    // Native and non-passive, so scrolling over the fractal zooms instead of scrolling the page.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      zoomAt(e, Math.exp(Math.max(-300, Math.min(300, e.deltaY * unit)) * 0.0025));
      schedule();
      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => commit({ ...cur }), 350);
    };
    const onDouble = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      zoomAt(e, e.shiftKey ? 2 : 0.5);
      commit({ ...cur });
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDouble);
    // A lost context (GPU reset, too many contexts) comes back on its own: redraw then.
    gl.onRestore(() => draw());

    const ro = new ResizeObserver(() => refresh());
    ro.observe(el);
    live.current = {
      setView(v: View) {
        cur = clampView(v, el.clientHeight || 1, gl.highp);
        draw();
      },
      refresh,
      reset() {
        cur = clampView(DEFAULT_VIEW, el.clientHeight || 1, gl.highp);
        commit({ ...cur });
      },
    };

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(commitTimer);
      clearTimeout(snapTimer);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDouble);
      gl.dispose();
      canvas.remove();
      live.current = null;
    };
  }, []);

  // Apply the saved view (first render, undo, Reset view).
  const viewKey = JSON.stringify(view);
  useEffect(() => {
    live.current?.setView(view);
    live.current?.refresh();
  }, [viewKey]);

  // Props change the picture, and the print still with it.
  useEffect(() => {
    live.current?.refresh();
  }, [props.palette, props.iterations, props.height]);

  return (
    <div
      ref={host}
      className="fractal-view"
      style={style}
      // Any button pans; keep the editor's menu out of the way.
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {failed ? (
        <div className="fractal-empty">WebGL isn't available in this browser</div>
      ) : (
        <>
          <span ref={hint} className="fractal-hint" />
          <button
            className="fractal-reset"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => live.current?.reset()}
          >
            Reset view
          </button>
        </>
      )}
    </div>
  );
}
`),
    "fractal.ts": text(`export type Palette = "ember" | "ultramarine" | "mono";
/** Centre of the view, and half its height, in the complex plane. */
export type View = { cx: number; cy: number; scale: number };

/** Seahorse Valley, between the main cardioid and the period-2 bulb. */
export const DEFAULT_VIEW: View = { cx: -0.7436, cy: 0.1316, scale: 0.0045 };
const WHOLE_SET = 1.25;
const MAX_SCALE = 2.5;
const MAX_ITER = 2500;

/** How far in, relative to the whole set. */
export const zoomOf = (scale: number) => WHOLE_SET / scale;

/** Deeper views need more iterations to resolve the boundary. */
export const iterationsFor = (base: number, scale: number) =>
  Math.min(MAX_ITER, Math.round(Math.max(50, base || 200) * Math.max(1, 1 + 0.4 * Math.log2(WHOLE_SET / scale))));

/**
 * Keeps the view where the GPU can draw it. Shaders compute in 32-bit floats
 * (about 7 digits): once a CSS pixel spans less than ~1e-7 of the plane,
 * neighbouring pixels round to the same point and the picture turns to blocks.
 */
export function clampView(v: View, cssHeight: number, highp = true): View {
  const finite = (n: unknown, d: number) => (typeof n === "number" && Number.isFinite(n) ? n : d);
  const cx = Math.max(-2.5, Math.min(1.5, finite(v.cx, DEFAULT_VIEW.cx)));
  const cy = Math.max(-1.5, Math.min(1.5, finite(v.cy, DEFAULT_VIEW.cy)));
  const scale = Math.max(minScale({ cx, cy, scale: 0 }, cssHeight, highp), Math.min(MAX_SCALE, finite(v.scale, DEFAULT_VIEW.scale)));
  return { cx, cy, scale };
}

/** The deepest zoom at this point: a CSS pixel spans ~1e-7 of the plane (mediump: far less deep). */
export function minScale(v: View, cssHeight: number, highp = true) {
  const pixel = (highp ? 1e-7 : 1e-3) * Math.max(1, Math.hypot(v.cx, v.cy));
  return (pixel * Math.max(1, cssHeight)) / 2;
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// Five stops around a cycle (the last joins the first), and the inside colour.
const PALETTES: Record<Palette, { stops: string[]; inside: string }> = {
  ember: { stops: ["#14120f", "#6e1d0b", "#ff5a1f", "#ffd8b5", "#14120f"], inside: "#14120f" },
  ultramarine: { stops: ["#0d0f1a", "#1c1c9e", "#2b2bff", "#d3d6ff", "#0d0f1a"], inside: "#0d0f1a" },
  mono: { stops: ["#f4f1ec", "#8f8a82", "#14120f", "#55514b", "#f4f1ec"], inside: "#14120f" },
};

const VERTEX = "attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }";

const fragment = (precision: string) => [
  "precision " + precision + " float;",
  "uniform vec2 u_res;",
  "uniform vec2 u_center;",
  "uniform float u_scale;",
  "uniform int u_iter;",
  "uniform vec3 u_pal[5];",
  "uniform vec3 u_inside;",
  "void main() {",
  "  vec2 c = u_center + (gl_FragCoord.xy - 0.5 * u_res) * (2.0 * u_scale / u_res.y);",
  // Inside the main cardioid or the period-2 bulb: skip the loop.
  "  float xq = c.x - 0.25;",
  "  float q = xq * xq + c.y * c.y;",
  "  if (q * (q + xq) <= 0.25 * c.y * c.y || (c.x + 1.0) * (c.x + 1.0) + c.y * c.y <= 0.0625) {",
  "    gl_FragColor = vec4(u_inside, 1.0);",
  "    return;",
  "  }",
  "  vec2 z = vec2(0.0);",
  "  float n = -1.0;",
  // WebGL 1 loops need a constant bound: break at the uniform count.
  "  for (int i = 0; i < " + MAX_ITER + "; i++) {",
  "    if (i >= u_iter) break;",
  "    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;",
  "    if (dot(z, z) > 65536.0) { n = float(i); break; }",
  "  }",
  "  if (n < 0.0) {",
  "    gl_FragColor = vec4(u_inside, 1.0);",
  "    return;",
  "  }",
  // Smooth (continuous) iteration count, then a cyclic palette over its square root.
  "  float mu = n - log2(log2(dot(z, z))) + 4.0;",
  "  float t = fract(sqrt(max(mu, 0.0)) * 0.14) * 4.0;",
  "  vec3 col = mix(u_pal[0], u_pal[1], clamp(t, 0.0, 1.0));",
  "  col = mix(col, u_pal[2], clamp(t - 1.0, 0.0, 1.0));",
  "  col = mix(col, u_pal[3], clamp(t - 2.0, 0.0, 1.0));",
  "  col = mix(col, u_pal[4], clamp(t - 3.0, 0.0, 1.0));",
  "  gl_FragColor = vec4(col, 1.0);",
  "}",
].join("\\n");

export interface Fractal {
  canvas: HTMLCanvasElement;
  /** False when the GPU only has mediump floats: the zoom stops much earlier. */
  highp: boolean;
  setSize(width: number, height: number): void;
  draw(view: View, palette: Palette, iterations: number): void;
  lost(): boolean;
  onRestore(fn: () => void): void;
  dispose(): void;
}

/** Raw WebGL: one full-screen triangle and the fragment shader above. Null without WebGL. */
export function createFractal(canvas: HTMLCanvasElement): Fractal | null {
  const options = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
  const gl = canvas.getContext("webgl", options) as WebGLRenderingContext | null;
  if (!gl) return null;
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const highp = !!hp && hp.precision > 0;

  let program: WebGLProgram | null = null;
  let loc: Record<string, WebGLUniformLocation | null> = {};
  let isLost = false;
  let restored = () => {};

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error("Fractal shader: " + gl.getShaderInfoLog(s));
    }
    return s;
  };
  // Builds everything the context owns: at start, and again after a context loss.
  const init = () => {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment(highp ? "highp" : "mediump")));
    gl.bindAttribLocation(program, 0, "a_pos");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error("Fractal program: " + gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    loc = {};
    for (const name of ["u_res", "u_center", "u_scale", "u_iter", "u_pal", "u_inside"]) {
      loc[name] = gl.getUniformLocation(program, name);
    }
  };
  try {
    init();
  } catch (err) {
    console.error(err);
    return null;
  }

  const onLost = (e: Event) => {
    e.preventDefault(); // allows the context to be restored
    isLost = true;
  };
  const onRestored = () => {
    isLost = false;
    try {
      init();
      restored();
    } catch (err) {
      console.error(err);
    }
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  return {
    canvas,
    highp,
    setSize(width, height) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    },
    draw(view, palette, iterations) {
      if (isLost || gl.isContextLost()) return;
      const p = PALETTES[palette] ?? PALETTES.ember;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(loc.u_res, canvas.width, canvas.height);
      gl.uniform2f(loc.u_center, view.cx, view.cy);
      gl.uniform1f(loc.u_scale, view.scale);
      gl.uniform1i(loc.u_iter, iterations);
      gl.uniform3fv(loc.u_pal, new Float32Array(p.stops.flatMap(hex)));
      gl.uniform3fv(loc.u_inside, new Float32Array(hex(p.inside)));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    lost: () => isLost || gl.isContextLost(),
    onRestore(fn) {
      restored = fn;
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      // Free the context now rather than at garbage collection: browsers cap live contexts.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
`),
    "fractal.css": text(`.fractal { margin: 0 0 1em; }
.fractal-view {
  position: relative;
  display: block;
  width: 100%;
  overflow: hidden;
  background: #0d0f1a;
  object-fit: cover;
}
.fractal-view canvas {
  position: absolute; inset: 0; display: block; width: 100%; height: 100%;
  cursor: grab; touch-action: none;
}
.fractal-view canvas:active { cursor: grabbing; }
.fractal-empty {
  position: absolute; inset: 0; display: grid; place-items: center;
  color: #6b6760; font-size: 9pt; background: #0d0f1a;
}
div.fractal-view.fractal-empty { position: relative; }
.fractal-hint {
  position: absolute; left: 2.5mm; bottom: 2.5mm; max-width: calc(100% - 5mm); font: 8pt ui-sans-serif, system-ui, sans-serif;
  color: rgba(255, 255, 255, 0.9); background: rgba(13, 15, 26, 0.62); border-radius: 4px; padding: 2px 7px;
  backdrop-filter: blur(4px); pointer-events: none;
}
.fractal-reset {
  position: absolute; right: 2.5mm; top: 2.5mm; font: 8pt ui-sans-serif, system-ui, sans-serif;
  color: #ffffff; background: rgba(13, 15, 26, 0.6); border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px; padding: 3px 8px; cursor: pointer;
}
.fractal-reset:hover { background: #ff5a1f; border-color: #ff5a1f; }
.fractal figcaption { margin-top: 2mm; }
`),
  },
};
