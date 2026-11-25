import { newId } from "./ids";
import type { ComponentFile, ComponentSource, DocumentModel, ElementNode, StyleMap } from "./types";

const chart = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 200" font-family="sans-serif" font-size="12">
<rect width="480" height="200" fill="#fafaf9"/>
<g fill="#4f46e5">
<rect x="50" y="110" width="60" height="60" rx="3"/>
<rect x="150" y="80" width="60" height="90" rx="3"/>
<rect x="250" y="55" width="60" height="115" rx="3"/>
<rect x="350" y="30" width="60" height="140" rx="3"/>
</g>
<line x1="30" y1="170" x2="450" y2="170" stroke="#a8a29e"/>
<g fill="#57534e" text-anchor="middle"><text x="80" y="188">Q1</text><text x="180" y="188">Q2</text><text x="280" y="188">Q3</text><text x="380" y="188">Q4</text></g>
</svg>`)}`;

function el<P>(type: string, props: P, style: StyleMap = {}): ElementNode {
  return { id: newId(), type, props: props as Record<string, unknown>, style };
}

const filler =
  "The paginator measures this document once, unpaginated, then fills pages from the page settings, splitting paragraphs by line, lists by item and tables by row. Headers and footers are drawn in each page's margins. Try changing the page size or margins in the sidebar and watch the pages update while you edit.";

const text = (content: string): ComponentFile => ({ kind: "text", content });

const INFO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`;

/** A multi-file component: entry module, a helper module, CSS and an SVG asset. */
const callout: ComponentSource = {
  id: "callout",
  name: "Callout",
  entry: "index.tsx",
  dependencies: {},
  files: {
    "index.tsx": text(`import { defineElement, Editable } from "@paged/sdk";
import { tones, type Tone } from "./tones";
import infoIcon from "./assets/info.svg";

export default defineElement<{ tone: Tone; title: string; body: string }>({
  label: "Callout",
  icon: "!",
  fields: {
    tone: { kind: "select", options: Object.keys(tones), default: "info" },
    title: { kind: "text", default: "Note" },
    body: { kind: "textarea", default: "Something worth pointing out." },
  },
  render: ({ props }) => {
    console.log("render callout", props.tone);
    return (
      <div className="callout" style={{ "--tone": tones[props.tone] } as React.CSSProperties}>
        <img className="callout-icon" src={infoIcon} alt="" />
        <div>
          <Editable as="h4" field="title" />
          <Editable as="p" field="body" multiline />
        </div>
      </div>
    );
  },
});
`),
    "tones.ts": text(`export const tones = {
  info: "#4f46e5",
  success: "#16a34a",
  warning: "#d97706",
};

export type Tone = keyof typeof tones;
`),
    "callout.css": text(`/* Every .css file in a component applies to the document. */
.callout {
  display: flex;
  gap: 3mm;
  border-left: 4px solid var(--tone);
  background: color-mix(in srgb, var(--tone) 7%, white);
  padding: 3mm 4mm;
  margin: 0 0 1em;
}
.callout-icon { width: 5mm; height: 5mm; flex: none; margin-top: 0.5mm; opacity: 0.8; }
.callout h4 { margin: 0 0 1mm; color: var(--tone); font-size: 1em; }
.callout p { margin: 0; white-space: pre-wrap; }
`),
    "assets/info.svg": { kind: "asset", mime: "image/svg+xml", data: `data:image/svg+xml;utf8,${encodeURIComponent(INFO_ICON)}` },
  },
};

/**
 * A chart.js chart. Chart.js draws on a canvas, which can't be printed from
 * static markup, so the chart is drawn synchronously to an off-screen canvas
 * and shown as an image: the same box in Edit, Preview and print.
 */
const chartComponent: ComponentSource = {
  id: "chart",
  name: "Chart",
  entry: "index.tsx",
  dependencies: { "chart.js": "4.6.2" },
  files: {
    "index.tsx": text(`import { defineElement, Editable } from "@paged/sdk";
import { drawChart, type ChartProps } from "./draw";

export default defineElement<ChartProps & { caption: string }>({
  label: "Chart",
  icon: "▥",
  fields: {
    type: { kind: "select", options: ["bar", "line", "area", "pie", "doughnut"], default: "bar" },
    data: {
      kind: "textarea",
      label: "Data",
      help: "First row: label, then one column per series. Comma, tab or semicolon separated.",
      default: "Quarter, Europe, North America, Asia Pacific\\nQ1, 0.9, 2.0, 0.6\\nQ2, 1.0, 2.1, 0.65\\nQ3, 1.1, 2.3, 0.7\\nQ4, 1.2, 2.4, 0.8",
    },
    title: { kind: "text", default: "" },
    palette: { kind: "select", options: ["indigo", "warm", "mono"], default: "indigo" },
    stacked: { kind: "boolean", label: "Stacked (bar, area)", default: false },
    legend: { kind: "select", options: ["bottom", "top", "right", "none"], default: "bottom" },
    unit: { kind: "text", label: "Value suffix", default: "", placeholder: "e.g. M€ or %" },
    height: { kind: "number", label: "Height (mm)", default: 70, min: 30, max: 200 },
    caption: { kind: "text", default: "" },
  },
  render: ({ props }) => {
    const result = drawChart(props);
    return (
      <figure className="chart">
        {"error" in result ? (
          <div className="chart-error" style={{ height: props.height + "mm" }}>{result.error}</div>
        ) : (
          <img className="chart-image" src={result.url} alt={props.title || "Chart"} style={{ height: props.height + "mm" }} />
        )}
        {props.caption && <Editable as="figcaption" field="caption" />}
      </figure>
    );
  },
});
`),
    "draw.ts": text(`import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

export interface ChartProps {
  type: "bar" | "line" | "area" | "pie" | "doughnut";
  data: string;
  title: string;
  palette: "indigo" | "warm" | "mono";
  stacked: boolean;
  legend: "bottom" | "top" | "right" | "none";
  unit: string;
  height: number;
}

const PALETTES = {
  indigo: ["#4f46e5", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"],
  warm: ["#c2410c", "#ea580c", "#f59e0b", "#b91c1c", "#a16207", "#78350f"],
  mono: ["#18181b", "#52525b", "#a1a1aa", "#d4d4d8", "#3f3f46", "#71717a"],
};

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
// Drawn at a typical A4 content width; the image scales to the page.
const WIDTH_PX = 640;
const PX_PER_MM = 96 / 25.4;
// Enough pixels to stay sharp in print.
const PIXEL_RATIO = 3;

/** "Label, A, B" header plus rows of numbers. */
export function parseData(text: string) {
  const rows = text
    .split(/\\r?\\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\\s*[,;\\t]\\s*/));
  if (rows.length < 2) throw new Error("Add a header row and at least one data row.");
  const [header, ...body] = rows;
  const series = header.slice(1);
  if (!series.length) throw new Error("The header needs at least one series after the label column.");
  return {
    labels: body.map((r) => r[0]),
    series: series.map((name, i) => ({
      name,
      values: body.map((r) => {
        const n = parseFloat((r[i + 1] ?? "").replace(/[^0-9.+-]/g, ""));
        return Number.isFinite(n) ? n : null;
      }),
    })),
  };
}

const cache = new Map<string, { url: string } | { error: string }>();

/** Draws synchronously (no animation) and returns a PNG data URL. Cached per settings. */
export function drawChart(props: ChartProps): { url: string } | { error: string } {
  const key = JSON.stringify(props);
  const hit = cache.get(key);
  if (hit) return hit;

  let result: { url: string } | { error: string };
  try {
    const { labels, series } = parseData(props.data);
    const colors = PALETTES[props.palette] ?? PALETTES.indigo;
    const round = props.type === "pie" || props.type === "doughnut";
    const area = props.type === "area";
    const canvas = document.createElement("canvas");
    const height = Math.max(30, props.height) * PX_PER_MM;
    canvas.width = WIDTH_PX * PIXEL_RATIO;
    canvas.height = height * PIXEL_RATIO;

    const chart = new Chart(canvas, {
      type: round ? props.type : area ? "line" : props.type,
      data: {
        labels,
        datasets: (round ? series.slice(0, 1) : series).map((s, i) => ({
          label: s.name,
          data: s.values,
          backgroundColor: round ? labels.map((_, j) => colors[j % colors.length]) : colors[i % colors.length] + (area ? "55" : ""),
          borderColor: round ? "#ffffff" : colors[i % colors.length],
          borderWidth: round ? 2 : props.type === "bar" ? 0 : 2,
          borderRadius: props.type === "bar" ? 3 : 0,
          fill: area,
          tension: 0.3,
          pointRadius: props.type === "line" ? 3 : 0,
        })),
      },
      options: {
        animation: false,
        responsive: false,
        devicePixelRatio: PIXEL_RATIO,
        font: { family: FONT },
        plugins: {
          title: { display: !!props.title, text: props.title, font: { family: FONT, size: 14, weight: "bold" }, color: "#18181b" },
          legend: {
            display: props.legend !== "none",
            position: props.legend === "none" ? "bottom" : props.legend,
            labels: { font: { family: FONT, size: 11 }, color: "#3f3f46", boxWidth: 12, boxHeight: 12 },
          },
          tooltip: { enabled: false },
        },
        scales: round
          ? {}
          : {
              x: { stacked: props.stacked, grid: { display: false }, ticks: { font: { family: FONT, size: 11 }, color: "#52525b" } },
              y: {
                stacked: props.stacked,
                beginAtZero: true,
                grid: { color: "#e4e4e7" },
                border: { display: false },
                ticks: { font: { family: FONT, size: 11 }, color: "#52525b", callback: (v) => v + (props.unit ? " " + props.unit : "") },
              },
            },
      },
    });
    // The constructor size for a detached canvas: CSS pixels, scaled by devicePixelRatio.
    chart.resize(WIDTH_PX, height);
    result = { url: canvas.toDataURL("image/png") };
    chart.destroy();
  } catch (err) {
    result = { error: (err as Error).message };
  }

  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
`),
    "chart.css": text(`.chart { margin: 0 0 1em; break-inside: avoid; }
.chart-image { display: block; width: 100%; object-fit: contain; }
.chart-error {
  display: flex; align-items: center; justify-content: center; padding: 4mm;
  border: 1px dashed #fca5a5; border-radius: 4px; color: #b91c1c; font-size: 0.85em; text-align: center;
}
.chart figcaption { margin-top: 0.4em; font-size: 0.85em; color: #78716c; text-align: center; }
`),
  },
};

const qr: ComponentSource = {
  id: "qr",
  name: "QR code",
  entry: "index.tsx",
  // Packages are added deliberately in the component's Configuration.
  dependencies: { "react-qr-code": "2.2.0" },
  files: {
    "index.tsx": text(`import { defineElement, Editable } from "@paged/sdk";
import QRCode from "react-qr-code";

export default defineElement({
  label: "QR code",
  icon: "▩",
  fields: {
    value: { kind: "text", label: "Link or text", default: "https://example.com" },
    size: { kind: "number", label: "Size (px)", default: 88, min: 32, max: 400 },
    caption: { kind: "text", default: "Scan for the online version" },
  },
  css: \`
    .qr { display: flex; align-items: center; gap: 5mm; margin: 0 0 1em; }
    .qr span { font-size: 0.85em; color: #78716c; }
  \`,
  render: ({ props }) => (
    <div className="qr">
      <QRCode value={props.value} size={props.size} />
      <Editable as="span" field="caption" />
    </div>
  ),
});
`),
  },
};

/** A three.js scene: orbit it in Edit mode; print uses the saved still. */
const scene3d: ComponentSource = {
  id: "scene3d",
  name: "3D scene",
  entry: "index.tsx",
  dependencies: { three: "0.187.0" },
  files: {
    "index.tsx": text(`import { defineElement, useElementState } from "@paged/sdk";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createScene, type Shape } from "./scene";

type Camera = { position: number[]; target: number[] };
const DEFAULT_CAMERA: Camera = { position: [4.2, 2.6, 5.6], target: [0, 1.1, 0] };

type Props = { shape: Shape; color: string; height: number; caption: string };

export default defineElement<Props>({
  label: "3D scene",
  icon: "◈",
  fields: {
    shape: { kind: "select", options: ["knot", "crystal", "rings"], default: "knot" },
    color: { kind: "color", default: "#6366f1" },
    height: { kind: "number", label: "Height (mm)", default: 85, min: 40, max: 220 },
    caption: { kind: "text", default: "Figure 2. A three.js scene, framed in Edit mode" },
  },
  render: ({ props, mode }) => {
    // Persisted with the element: where the camera is, and a still for print.
    const [camera, setCamera] = useElementState<Camera>("camera", DEFAULT_CAMERA);
    const [snapshot, setSnapshot] = useElementState<string>("snapshot", "");
    const size = { height: props.height + "mm" };

    return (
      <figure className="scene3d">
        {mode === "print" ? (
          snapshot ? (
            <img className="scene3d-view" src={snapshot} style={size} alt="" />
          ) : (
            <div className="scene3d-view scene3d-empty" style={size}>Open in Edit mode to render this scene</div>
          )
        ) : (
          <Viewport props={props} camera={camera} onCamera={setCamera} onSnapshot={setSnapshot} style={size} />
        )}
        <figcaption>{props.caption}</figcaption>
      </figure>
    );
  },
});

/** The live WebGL view (Edit mode only): orbit, pan and zoom, saved on release. */
function Viewport({ props, camera, onCamera, onSnapshot, style }: {
  props: Props;
  camera: Camera;
  onCamera: (c: Camera) => void;
  onSnapshot: (url: string) => void;
  style: React.CSSProperties;
}) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<any>(null);
  const latest = useRef({ onCamera, onSnapshot });
  latest.current = { onCamera, onSnapshot };

  // Create the renderer once.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const world = createScene();
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 2.5;
    controls.maxDistance = 18;

    const render = () => renderer.render(world.scene, cam);
    let snapTimer: ReturnType<typeof setTimeout> | undefined;
    const snap = () => {
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        render();
        latest.current.onSnapshot(renderer.domElement.toDataURL("image/jpeg", 0.88));
      }, 250);
    };
    controls.addEventListener("change", render);
    controls.addEventListener("end", () => {
      latest.current.onCamera({ position: cam.position.toArray(), target: controls.target.toArray() });
      snap();
    });

    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      cam.aspect = el.clientWidth / el.clientHeight;
      cam.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    live.current = { renderer, cam, controls, world, render, snap, resize };
    console.log("three.js", THREE.REVISION, "viewport ready");

    return () => {
      clearTimeout(snapTimer);
      ro.disconnect();
      controls.dispose();
      world.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      live.current = null;
    };
  }, []);

  // Apply the saved camera (first render, undo, Reset view).
  const cameraKey = JSON.stringify(camera);
  useEffect(() => {
    const l = live.current;
    if (!l) return;
    l.cam.position.fromArray(camera.position);
    l.controls.target.fromArray(camera.target);
    l.controls.update();
    l.resize();
  }, [cameraKey]);

  // Props change the scene, and the print still with it.
  useEffect(() => {
    const l = live.current;
    if (!l) return;
    l.world.setShape(props.shape);
    l.world.setColor(props.color);
    l.render();
    l.snap();
  }, [props.shape, props.color, props.height]);

  return (
    <div
      ref={host}
      className="scene3d-view"
      style={style}
      // Right-drag pans the camera instead of opening the editor's menu.
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <span className="scene3d-hint">Drag to orbit · right-drag to pan · scroll to zoom</span>
      <button
        className="scene3d-reset"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => onCamera(DEFAULT_CAMERA)}
      >
        Reset view
      </button>
    </div>
  );
}
`),
    "scene.ts": text(`import * as THREE from "three";

export type Shape = "knot" | "crystal" | "rings";

/** A glossy shape floating over a grid, under a field of stars. */
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1020");
  scene.fog = new THREE.Fog("#0b1020", 12, 30);

  scene.add(new THREE.HemisphereLight("#c7d2fe", "#0f172a", 0.9));
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.position.set(5, 8, 4);
  scene.add(key);
  const rim = new THREE.PointLight("#f472b6", 40, 20);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  const grid = new THREE.GridHelper(40, 60, "#3730a3", "#1e293b");
  scene.add(grid);

  // Stars: random points on a big sphere.
  const stars = new Float32Array(1500);
  for (let i = 0; i < stars.length; i += 3) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 20);
    stars.set([v.x, Math.abs(v.y), v.z], i);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: "#e0e7ff", size: 0.12 })));

  const material = new THREE.MeshStandardMaterial({ metalness: 0.55, roughness: 0.22 });
  const holder = new THREE.Group();
  holder.position.y = 1.2;
  scene.add(holder);

  const shapes: Record<Shape, () => THREE.Object3D> = {
    knot: () => new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.3, 240, 32), material),
    crystal: () => {
      const geo = new THREE.IcosahedronGeometry(1.2, 0);
      return new THREE.Mesh(geo, material);
    },
    rings: () => {
      const g = new THREE.Group();
      [0, 1, 2].forEach((i) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1 - i * 0.22, 0.07, 24, 120), material);
        ring.rotation.set(i * 0.9, i * 0.6, 0);
        g.add(ring);
      });
      return g;
    },
  };

  let current: Shape | null = null;
  return {
    scene,
    setShape(shape: Shape) {
      if (shape === current) return;
      current = shape;
      holder.clear();
      holder.add((shapes[shape] ?? shapes.knot)());
    },
    setColor(color: string) {
      material.color.set(color);
      material.emissive.set(color).multiplyScalar(0.12);
    },
    dispose() {
      scene.traverse((o: any) => o.geometry?.dispose());
      material.dispose();
    },
  };
}
`),
    "scene.css": text(`.scene3d { margin: 0 0 1em; }
.scene3d-view {
  position: relative;
  display: block;
  width: 100%;
  border-radius: 3mm;
  overflow: hidden;
  background: #0b1020;
  object-fit: cover;
}
.scene3d-view canvas { display: block; width: 100%; height: 100%; cursor: grab; }
.scene3d-view canvas:active { cursor: grabbing; }
.scene3d-empty { display: grid; place-items: center; color: #94a3b8; font-size: 9pt; }
.scene3d-hint {
  position: absolute; left: 3mm; bottom: 2.5mm; font-size: 8pt; color: rgba(224, 231, 255, 0.7);
  pointer-events: none; font-family: ui-sans-serif, system-ui, sans-serif;
}
.scene3d-reset {
  position: absolute; right: 2.5mm; top: 2.5mm; font: 8pt ui-sans-serif, system-ui, sans-serif;
  color: #e0e7ff; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(165, 180, 252, 0.35);
  border-radius: 4px; padding: 3px 8px; cursor: pointer;
}
.scene3d-reset:hover { background: rgba(79, 70, 229, 0.7); }
.scene3d figcaption { margin-top: 2mm; font-size: 0.85em; color: #78716c; }
`),
  },
};

export function sampleDocument(): DocumentModel {
  return {
    version: 1,
    title: "Quarterly Report",
    customCss: "",
    components: [callout, chartComponent, qr, scene3d],
    page: {
      size: "A4",
      orientation: "portrait",
      margin: { top: "22mm", right: "20mm", bottom: "22mm", left: "20mm" },
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
      fontSize: "11pt",
      lineHeight: "1.5",
      color: "#1c1917",
    },
    elements: [
      el("header", { left: "{title}", center: "", right: "Acme Inc." }),
      el("heading", { text: "Quarterly Report", level: 1 }, { color: "#312e81" }),
      el(
        "text",
        {
          // Inline runs: each piece of text carries its own formatting.
          runs: [
            { text: "A first draft of a " },
            { text: "WYSIWYG", marks: { weight: "700", color: "#312e81" } },
            { text: " document editor. Every block on this page is a " },
            { text: "React component", marks: { italic: true } },
            { text: " with an " },
            { text: "edit mode", marks: { background: "#fef3c7" } },
            { text: " and a " },
            { text: "print mode", marks: { background: "#dcfce7" } },
            { text: "." },
          ],
        },
        { "font-size": "13pt", color: "#57534e" },
      ),
      el("divider", { thickness: 2, color: "#4f46e5", lineStyle: "solid" }, { width: "48px", "margin-left": "0" }),
      el("heading", { text: "Highlights", level: 2 }),
      el("list", {
        items: ["Revenue up 18% quarter over quarter", "Two new enterprise customers", "Churn down to 1.2%"],
        ordered: false,
        marker: "",
      }),
      el("image", { src: chart, alt: "Revenue by quarter", caption: "Figure 1. Revenue by quarter", width: "80%", align: "center" }),
      el("heading", { text: "Results by region", level: 2 }),
      el("table", {
        rows: [
          ["Region", "Revenue", "Growth"],
          ["Europe", "€1.2M", "+21%"],
          ["North America", "€2.4M", "+15%"],
          ["Asia Pacific", "€0.8M", "+24%"],
        ],
        headerRow: true,
        striped: true,
        borderColor: "",
        headerBackground: "#eef2ff",
        cellPadding: "",
      }),
      el("custom:chart", {
        type: "bar",
        data: "Quarter, Europe, North America, Asia Pacific\nQ1, 0.9, 2.0, 0.6\nQ2, 1.0, 2.1, 0.65\nQ3, 1.1, 2.3, 0.7\nQ4, 1.2, 2.4, 0.8",
        title: "",
        palette: "indigo",
        stacked: false,
        legend: "bottom",
        unit: "M€",
        height: 62,
        caption: "Figure 2. Revenue by region and quarter (chart.js)",
      }),
      el("custom:callout", {
        tone: "info",
        title: "Custom component",
        body: "This callout is a React component written inside the editor and saved with the document.",
      }),
      el("text", { runs: [{ text: filler }] }),
      el("page-break", {}),
      el("heading", { text: "Appendix", level: 2 }),
      el("text", { runs: [{ text: filler }] }),
      el("text", { runs: [{ text: filler }] }),
      el("custom:scene3d", { shape: "knot", color: "#6366f1", height: 85, caption: "Figure 3. A three.js scene, framed in Edit mode" }),
      el("custom:qr", { value: "https://example.com/reports/q3", size: 88, caption: "Scan for the online version" }),
      el("footer", { left: "", center: "Page {page} of {pages}", right: "" }),
    ],
  };
}
