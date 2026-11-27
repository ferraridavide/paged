import type { ComponentSource } from "../../types";
import { text } from "../util";
import land110m from "world-atlas/land-110m.json?raw";

/**
 * A globe drawn as pure SVG with d3-geo: drag it to spin in Edit mode. The
 * drawing is computed synchronously from the saved rotation, so print gets the
 * very same vectors, no snapshot needed.
 */
export const globe: ComponentSource = {
  id: "globe",
  name: "Globe",
  entry: "index.tsx",
  dependencies: { "d3-geo": "3.1.1", "topojson-client": "3.1.0" },
  files: {
    "index.tsx": text(`import { defineElement, Editable, useElement, useElementState } from "@paged/sdk";
import { useMemo, useRef, useState } from "react";
import { drawGlobe, parseCities, wrap, VIEW_W, type Rotation } from "./globe";

type Props = { cities: string[]; color: string; height: number; caption: string };

// Faces the Atlantic: Europe, Africa and the Americas.
const DEFAULT_ROTATION: Rotation = [15, -20];

export default defineElement<Props>({
  label: "Globe",
  icon: "◍",
  fields: {
    cities: {
      kind: "lines",
      help: "One per line: name, latitude, longitude. Arcs join consecutive cities.",
      default: [
        "Milan, 45.46, 9.19",
        "New York, 40.71, -74.01",
        "Rio de Janeiro, -22.91, -43.17",
        "Cape Town, -33.92, 18.42",
        "Nairobi, -1.29, 36.82",
        "Dubai, 25.20, 55.27",
        "Tokyo, 35.68, 139.69",
      ],
    },
    color: { kind: "color", label: "Land", default: "#14120f" },
    height: { kind: "number", label: "Height (mm)", default: 90, min: 40, max: 220 },
    caption: { kind: "text", default: "A vector globe: drag it in Edit mode, and print gets the same view" },
  },
  render: ({ props, mode }) => {
    const { node } = useElement();
    // Persisted with the element: which way the globe faces.
    const [saved, setRotation] = useElementState<Rotation>("rotation", DEFAULT_ROTATION);
    // While dragging, the globe turns from local state; the rotation is saved on release.
    const [live, setLive] = useState<Rotation | null>(null);
    const drag = useRef<{ id: number; x: number; y: number; from: Rotation; scale: number; last?: Rotation } | null>(null);

    const rotation = live ?? sane(saved);
    const height = Math.max(20, Number(props.height) || 90);
    const citiesKey = JSON.stringify(props.cities ?? []);
    const g = useMemo(
      () => drawGlobe(rotation, parseCities(props.cities), height),
      [rotation[0], rotation[1], citiesKey, height],
    );
    // Unique per element, so two globes never share gradients.
    const id = "globe-" + node.id.replace(/[^\\w-]/g, "");

    const edit = mode === "edit";
    const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      // Client px per view unit (the drawing is scaled to fit, centred).
      const scale = Math.min(rect.width / g.width, rect.height / g.height) || 1;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: rotation, scale };
    };
    const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      // Dragging across the globe's radius turns it about 80 degrees.
      const k = 80 / g.r / d.scale;
      const next: Rotation = [
        wrap(d.from[0] + (e.clientX - d.x) * k),
        Math.max(-90, Math.min(90, d.from[1] - (e.clientY - d.y) * k)),
      ];
      d.last = next;
      setLive(next);
    };
    const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      // One undo step per drag; a plain click saves nothing.
      if (d.last) setRotation([Math.round(d.last[0] * 10) / 10, Math.round(d.last[1] * 10) / 10]);
      setLive(null);
    };

    return (
      <figure className="globe">
        <div className="globe-view" style={{ height: height + "mm" }}>
          <svg
            className={edit ? "globe-svg is-live" : "globe-svg"}
            viewBox={"0 0 " + g.width + " " + g.height}
            preserveAspectRatio="xMidYMid meet"
            {...(edit ? { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd } : {})}
          >
            <defs>
              <radialGradient id={id + "-ocean"} cx="0.38" cy="0.32" r="0.75">
                <stop offset="0" stopColor="#fbfbff" />
                <stop offset="1" stopColor="#d6d9f2" />
              </radialGradient>
              {/* Light from the upper left: a soft highlight, and the far rim in shade. */}
              <radialGradient id={id + "-light"} cx="0.36" cy="0.3" r="0.55">
                <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
                <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
              <radialGradient id={id + "-shade"} cx="0.42" cy="0.38" r="0.62">
                <stop offset="0.55" stopColor="#0d0f1a" stopOpacity="0" />
                <stop offset="1" stopColor="#0d0f1a" stopOpacity="0.32" />
              </radialGradient>
            </defs>
            <circle cx={g.cx} cy={g.cy} r={g.r} fill={"url(#" + id + "-ocean)"} />
            <path d={g.graticule} className="globe-graticule" />
            <path d={g.land} fill={props.color || "#14120f"} />
            <circle cx={g.cx} cy={g.cy} r={g.r} fill={"url(#" + id + "-shade)"} />
            <circle cx={g.cx} cy={g.cy} r={g.r} fill={"url(#" + id + "-light)"} />
            <circle cx={g.cx} cy={g.cy} r={g.r} className="globe-rim" />
            {g.arcs.map((d, i) => (
              <path key={i} d={d} className="globe-arc" />
            ))}
            {g.markers.map((m, i) => (
              <g key={i} opacity={m.opacity}>
                <circle cx={m.x} cy={m.y} r={3.4} className="globe-city" />
                <text
                  x={m.flip ? m.x - 7 : m.x + 7}
                  y={m.y + 3.5}
                  textAnchor={m.flip ? "end" : "start"}
                  className="globe-label"
                >
                  {m.name}
                </text>
              </g>
            ))}
          </svg>
          {edit && <span className="globe-hint">Drag to spin</span>}
        </div>
        {props.caption && <Editable as="figcaption" field="caption" />}
      </figure>
    );
  },
});

/** A saved rotation from an older or hand-edited document: fall back if malformed. */
function sane(r: unknown): Rotation {
  return Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]) ? [r[0], r[1]] : DEFAULT_ROTATION;
}
`),
    "globe.ts": text(`import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import topology from "./land-110m.json";

/** The drawing's width in view units (about CSS px on an A4 page); its height comes from the element. */
export const VIEW_W = 640;
export const PX_PER_MM = 96 / 25.4;

/** d3's rotation: [longitude, latitude] turned to face the viewer, negated. */
export type Rotation = [number, number];
export interface City { name: string; lon: number; lat: number }

// Natural Earth land at 1:110m, unpacked from TopoJSON once.
const land = feature(topology as any, (topology as any).objects.land);
const graticule = geoGraticule10();

/** "Milan, 45.46, 9.19" lines: a name (commas allowed), then latitude and longitude. */
export function parseCities(lines: unknown): City[] {
  const list = Array.isArray(lines) ? lines : String(lines ?? "").split("\\n");
  const cities: City[] = [];
  for (const line of list) {
    const parts = String(line).split(",").map((s) => s.trim());
    if (parts.length < 3) continue;
    const lon = parseFloat(parts.pop()!);
    const lat = parseFloat(parts.pop()!);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    cities.push({ name: parts.join(", "), lat: Math.max(-90, Math.min(90, lat)), lon });
  }
  return cities;
}

/** Keeps a longitude in [-180, 180). */
export const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * Everything to draw, as SVG path data: pure and synchronous, so print renders
 * the same globe from the saved rotation. Paths are clipped to the visible
 * hemisphere by the orthographic projection itself.
 */
export function drawGlobe(rotation: Rotation, cities: City[], height: number) {
  const h = Math.round(height * PX_PER_MM);
  const r = Math.max(20, Math.min(VIEW_W, h) / 2 - 12);
  const cx = VIEW_W / 2;
  const cy = h / 2;
  const projection = geoOrthographic().scale(r).translate([cx, cy]).rotate([rotation[0], rotation[1], 0]);
  const path = geoPath(projection).digits(1);
  const facing: [number, number] = [-rotation[0], -rotation[1]];

  // Great circles between consecutive cities (null when wholly out of sight).
  const arcs: string[] = [];
  for (let i = 1; i < cities.length; i++) {
    const a = cities[i - 1];
    const b = cities[i];
    const d = path({ type: "LineString", coordinates: [[a.lon, a.lat], [b.lon, b.lat]] });
    if (d) arcs.push(d);
  }

  // Markers on the near side, fading out as they reach the rim.
  const markers = [];
  for (const c of cities) {
    const angle = geoDistance([c.lon, c.lat], facing);
    if (angle > Math.PI / 2 - 0.03) continue;
    const [x, y] = projection([c.lon, c.lat])!;
    markers.push({
      name: c.name,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      opacity: Math.round(Math.min(1, (Math.PI / 2 - angle) / 0.3) * 100) / 100,
      // Labels go right of the dot, unless that would run off the drawing.
      flip: x > VIEW_W - 90,
    });
  }

  return {
    width: VIEW_W,
    height: h,
    cx,
    cy,
    r,
    land: path(land) ?? "",
    graticule: path(graticule) ?? "",
    arcs,
    markers,
  };
}
`),
    "globe.css": text(`.globe { margin: 0 0 1em; break-inside: avoid; }
.globe-view { position: relative; width: 100%; }
.globe-svg { display: block; width: 100%; height: 100%; overflow: visible; }
.globe-svg.is-live { cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
.globe-svg.is-live:active { cursor: grabbing; }
.globe-graticule { fill: none; stroke: #14120f; stroke-opacity: 0.13; stroke-width: 0.5; }
.globe-rim { fill: none; stroke: #14120f; stroke-opacity: 0.55; stroke-width: 0.75; }
.globe-arc { fill: none; stroke: #ff5a1f; stroke-width: 1.6; stroke-linecap: round; }
.globe-city { fill: #ff5a1f; stroke: #ffffff; stroke-width: 1.4; }
.globe-label {
  font: 600 10px ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  fill: #14120f; paint-order: stroke; stroke: #ffffff; stroke-width: 3px; stroke-linejoin: round;
}
.globe-hint {
  position: absolute; left: 0; bottom: 1mm; font: 8pt ui-sans-serif, system-ui, sans-serif; color: #6b6760;
  pointer-events: none;
}
.globe figcaption { margin-top: 2mm; }
`),
    // Natural Earth land, 1:110m (world-atlas): the component's own data file.
    "land-110m.json": text(land110m),
  },
};
