import type { ComponentSource } from "../../types";
import { text } from "../util";

/**
 * Elements that know where they are: they read usePageInfo() (the page,
 * section and chapter they're drawn on) and useDocument() (the outline with
 * page numbers, word counts). Header and footer elements are drawn once per
 * page, so each copy can look different.
 */

/** CSS that lets a header/footer element draw anywhere on the page. */
const pageAnchor = (cls: string) => `/* Position against the page margin box, not the element's own block (in Edit mode too). */
.pd-zone > .ed-block:has(> .hd-custom-${cls}) { position: static; }
.hd-custom-${cls} { height: 0; }
`;

/** A wireframe solid that turns a little on every page: flip the printed pages and it moves. */
export const flipbook: ComponentSource = {
  id: "flipbook",
  name: "Flip-book corner",
  entry: "index.tsx",
  dependencies: {},
  files: {
    "index.tsx": text(`import { defineElement, useDocument, usePageInfo } from "@paged/sdk";
import { SOLIDS, project, type Solid } from "./solids";

type Props = { layout: "corner" | "strip"; solid: Solid; degrees: number; color: string; size: number };

/** One frame: the solid turned by this many degrees. */
function Frame({ solid, degrees, color }: { solid: Solid; degrees: number; color: string }) {
  return (
    <svg viewBox="-1.15 -1.15 2.3 2.3">
      {project(solid, degrees).map((e, i) => (
        <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={color} strokeWidth={0.035} strokeLinecap="round" opacity={e.opacity} />
      ))}
    </svg>
  );
}

export default defineElement<Props>({
  label: "Flip-book",
  icon: "◳",
  fields: {
    layout: {
      kind: "select",
      options: [
        { value: "corner", label: "Page corner (put it in the footer)" },
        { value: "strip", label: "Strip of every page's frame" },
      ],
      default: "corner",
    },
    solid: { kind: "select", options: Object.keys(SOLIDS), default: "icosahedron" },
    degrees: { kind: "number", label: "Turn per page (°)", default: 14, min: 1, max: 90 },
    color: { kind: "color", default: "#ff5a1f" },
    size: { kind: "number", label: "Size (mm)", default: 15, min: 6, max: 40 },
  },
  render: ({ props }) => {
    const page = usePageInfo();
    const pages = useDocument().pages || 12;
    if (props.layout === "strip") {
      // Every frame the corner will show, one per page.
      return (
        <div className="flipstrip">
          {Array.from({ length: pages }, (_, i) => (
            <div key={i} className="flipstrip-frame">
              <Frame solid={props.solid} degrees={i * props.degrees} color={props.color} />
              <span>{String(i + 1).padStart(2, "0")}</span>
            </div>
          ))}
        </div>
      );
    }
    const frame = (page?.number ?? 1) - 1;
    return (
      <div className="flipbook" style={{ width: props.size + "mm", height: props.size + "mm" }}>
        <Frame solid={props.solid} degrees={frame * props.degrees} color={props.color} />
      </div>
    );
  },
});
`),
    "solids.ts": text(`/** Wireframe solids, rotated and projected with a little perspective. */
type V = [number, number, number];

const phi = (1 + Math.sqrt(5)) / 2;

function edgesByLength(verts: V[]) {
  // Edges are the pairs at the shortest distance (true for these solids).
  const d = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let min = Infinity;
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) min = Math.min(min, d(verts[i], verts[j]));
  const edges: [number, number][] = [];
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) if (d(verts[i], verts[j]) < min * 1.01) edges.push([i, j]);
  return edges;
}

function normalise(verts: V[]): V[] {
  const r = Math.max(...verts.map((v) => Math.hypot(...v)));
  return verts.map((v) => [v[0] / r, v[1] / r, v[2] / r]);
}

function torus(): { verts: V[]; edges: [number, number][] } {
  const verts: V[] = [];
  const edges: [number, number][] = [];
  const U = 16, W = 8, R = 0.7, r = 0.3;
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < W; j++) {
      const u = (i / U) * Math.PI * 2;
      const w = (j / W) * Math.PI * 2;
      verts.push([(R + r * Math.cos(w)) * Math.cos(u), r * Math.sin(w), (R + r * Math.cos(w)) * Math.sin(u)]);
      const k = i * W + j;
      edges.push([k, i * W + ((j + 1) % W)], [k, ((i + 1) % U) * W + j]);
    }
  }
  return { verts, edges };
}

const solid = (verts: V[]) => ({ verts: normalise(verts), edges: edgesByLength(verts) });

export const SOLIDS = {
  icosahedron: solid([
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ]),
  cube: solid([
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ]),
  octahedron: solid([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]),
  torus: torus(),
};

export type Solid = keyof typeof SOLIDS;

/** Rotates about Y (and half as fast about X), projects, and fades the far edges. */
export function project(name: Solid, degrees: number) {
  const { verts, edges } = SOLIDS[name] ?? SOLIDS.icosahedron;
  const a = (degrees * Math.PI) / 180;
  const b = a * 0.5 + 0.4;
  const pts = verts.map(([x, y, z]) => {
    const x1 = x * Math.cos(a) + z * Math.sin(a);
    const z1 = -x * Math.sin(a) + z * Math.cos(a);
    const y2 = y * Math.cos(b) - z1 * Math.sin(b);
    const z2 = y * Math.sin(b) + z1 * Math.cos(b);
    const s = 2.6 / (3.2 - z2);
    return { x: x1 * s, y: y2 * s, z: z2 };
  });
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return edges.map(([i, j]) => ({
    x1: r(pts[i].x), y1: r(pts[i].y), x2: r(pts[j].x), y2: r(pts[j].y),
    opacity: r(0.3 + 0.7 * ((pts[i].z + pts[j].z) / 2 + 1) / 2),
  }));
}
`),
    "flipbook.css": text(`/* In a header or footer, the corner frame is positioned against the page margin box. */
.pd-zone > .ed-block:has(> .hd-custom-flipbook) { position: static; }
.pd-zone .hd-custom-flipbook { height: 0; }
.flipbook { position: absolute; right: 5mm; bottom: 4mm; }
.flipbook svg { display: block; width: 100%; height: 100%; overflow: visible; }
.flipstrip { display: grid; grid-template-columns: repeat(auto-fill, minmax(11mm, 1fr)); gap: 1mm; margin: 2mm 0 1mm; }
.flipstrip-frame svg { display: block; width: 100%; aspect-ratio: 1; overflow: visible; }
.flipstrip-frame span { display: block; text-align: center; font: 500 6pt ui-monospace, "SF Mono", Menlo, monospace; color: #6b6760; margin-top: 0.5mm; }
`),
  },
};

/** A running foot: the current chapter and a progress bar through the document. */
export const progress: ComponentSource = {
  id: "progress",
  name: "Progress footer",
  entry: "index.tsx",
  dependencies: {},
  files: {
    "index.tsx": text(`import { defineElement, useDocument, usePageInfo } from "@paged/sdk";

type Props = { color: string };

const pad = (n: number) => String(n).padStart(2, "0");

export default defineElement<Props>({
  label: "Progress footer",
  icon: "▭",
  fields: { color: { kind: "color", label: "Bar colour", default: "#ff5a1f" } },
  render: ({ props }) => {
    const page = usePageInfo();
    const doc = useDocument();
    const number = page?.number ?? 1;
    const total = page?.total ?? 1;
    const chapter = page?.chapter;
    return (
      <div className="progress">
        <div className="progress-row">
          <span className="progress-chapter">{chapter ? pad(chapter.number) + " — " + chapter.title : doc.title}</span>
          <span className="progress-page">{pad(number)} / {pad(total)}</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: (number / total) * 100 + "%", background: props.color }} />
        </div>
      </div>
    );
  },
});
`),
    "progress.css": text(`.progress { font: 500 7pt/1.2 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.06em; text-transform: uppercase; color: #6b6760; }
.progress-row { display: flex; justify-content: space-between; gap: 6mm; margin-bottom: 1.6mm; }
.progress-chapter { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.progress-page { color: #14120f; font-weight: 700; }
.progress-track { height: 0.6mm; background: #e7e3dc; border-radius: 1mm; overflow: hidden; }
.progress-fill { height: 100%; }
`),
  },
};

/** Dictionary-style thumb tabs on the page edge: one position per chapter, so the printed block shows them. */
export const thumbTabs: ComponentSource = {
  id: "thumb-tabs",
  name: "Thumb tabs",
  entry: "index.tsx",
  dependencies: {},
  files: {
    "index.tsx": text(`import { defineElement, useDocument, usePageInfo } from "@paged/sdk";

type Props = { top: number; size: number; color: string; ghosts: boolean };

export default defineElement<Props>({
  label: "Thumb tabs",
  icon: "▐",
  fields: {
    top: { kind: "number", label: "First tab from the top (mm)", default: 46, min: 0, max: 200 },
    size: { kind: "number", label: "Tab height (mm)", default: 30, min: 8, max: 80 },
    color: { kind: "color", default: "#14120f" },
    ghosts: { kind: "boolean", label: "Show the other chapters' positions", default: true },
  },
  render: ({ props }) => {
    const page = usePageInfo();
    const chapters = useDocument().outline.filter((h) => h.level === 1);
    const current = page?.chapter?.number ?? 0;
    return (
      <div className="thumbtabs">
        {chapters.map((c, i) => {
          const on = i + 1 === current;
          if (!on && !props.ghosts) return null;
          return (
            <div
              key={c.id}
              className={"thumbtab" + (on ? " is-on" : "")}
              style={{ top: props.top + i * props.size + "mm", height: props.size - 1 + "mm", background: on ? props.color : undefined }}
            >
              {on && (
                <>
                  <b>{String(i + 1).padStart(2, "0")}</b>
                  <span>{c.text}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  },
});
`),
    "thumbtabs.css": text(`${pageAnchor("thumb-tabs")}
.thumbtabs { position: absolute; top: 0; right: 0; }
.thumbtab {
  position: absolute; right: 0; width: 1.6mm; background: #e7e3dc; border-radius: 1mm 0 0 1mm;
}
.thumbtab.is-on {
  width: 9mm; color: #fff; display: flex; flex-direction: column; align-items: center; gap: 2mm; padding-top: 2.5mm; box-sizing: border-box;
  font: 600 6.5pt/1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.08em; text-transform: uppercase; overflow: hidden;
}
.thumbtab b { font-size: 8pt; }
.thumbtab span { writing-mode: vertical-rl; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-height: 100%; }
`),
  },
};

/** A table of contents that keeps itself: headings with the pages they land on. */
export const contents: ComponentSource = {
  id: "contents",
  name: "Contents",
  entry: "index.tsx",
  dependencies: {},
  files: {
    "index.tsx": text(`import { defineElement, useDocument } from "@paged/sdk";

type Props = { depth: number };

export default defineElement<Props>({
  label: "Contents",
  icon: "☰",
  fields: { depth: { kind: "number", label: "Heading levels", default: 2, min: 1, max: 6 } },
  render: ({ props }) => {
    const { outline } = useDocument();
    const rows = outline.filter((h) => h.level <= props.depth);
    return (
      <nav className="toc">
        {rows.map((h) => (
          <div key={h.id} className={"toc-row toc-l" + h.level}>
            <span className="toc-text">{h.text}</span>
            <span className="toc-dots" />
            <span className="toc-page">{h.page ?? "–"}</span>
          </div>
        ))}
      </nav>
    );
  },
});
`),
    "contents.css": text(`.toc { margin: 0 0 1.2em; }
.toc-row { display: flex; align-items: baseline; gap: 2mm; height: 6.2mm; }
.toc-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.toc-dots { flex: 1; border-bottom: 0.3mm dotted #c9c3b8; transform: translateY(-1mm); }
.toc-page { font: 600 9pt ui-monospace, "SF Mono", Menlo, monospace; min-width: 7mm; text-align: right; }
.toc-l1 { margin-top: 2.5mm; font-weight: 700; }
.toc-l1:first-child { margin-top: 0; }
.toc-l1 .toc-page { color: #ff5a1f; }
.toc-l2 { padding-left: 7mm; color: #3d3a35; }
`),
  },
};

/** The document counting itself, live as you type. */
export const docStats: ComponentSource = {
  id: "doc-stats",
  name: "Document stats",
  entry: "index.tsx",
  dependencies: {},
  files: {
    "index.tsx": text(`import { defineElement, Editable, useDocument } from "@paged/sdk";

type Props = { note: string };

export default defineElement<Props>({
  label: "Document stats",
  icon: "#",
  fields: { note: { kind: "text", default: "Counted live. Type anywhere and watch these change." } },
  render: () => {
    const { pages, stats } = useDocument();
    const cells = [
      [pages || "–", "pages"],
      [stats.words.toLocaleString("en"), "words"],
      [stats.components, "components"],
      [Math.max(1, Math.round(stats.words / 230)) + " min", "to read"],
    ];
    return (
      <div className="dstats">
        <div className="dstats-grid">
          {cells.map(([value, label]) => (
            <div key={label} className="dstats-cell">
              <b>{value}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <Editable as="p" field="note" className="dstats-note" />
      </div>
    );
  },
});
`),
    "stats.css": text(`.dstats { margin: 0 0 1.2em; break-inside: avoid; }
.dstats-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 0.6mm solid #14120f; border-bottom: 0.3mm solid #e7e3dc; }
.dstats-cell { padding: 3mm 0 3mm 3mm; border-left: 0.3mm solid #e7e3dc; }
.dstats-cell:first-child { border-left: 0; padding-left: 0; }
.dstats-cell b { display: block; font: italic 400 24pt/1 "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; letter-spacing: -0.02em; }
.dstats-cell span { display: block; margin-top: 1.5mm; font: 600 6.5pt/1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6760; }
.dstats-note { margin: 2mm 0 0; font-size: 8.5pt; color: #6b6760; }
`),
  },
};
