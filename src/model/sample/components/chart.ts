import type { ComponentSource } from "../../types";
import { text } from "../util";

/**
 * A chart.js chart. Chart.js draws on a canvas, which can't be printed from
 * static markup, so the chart is drawn synchronously to an off-screen canvas
 * and shown as an image: the same box in Edit, Preview and print. It can take
 * its data from a table elsewhere in the document, and redraws when it changes.
 */
export const chart: ComponentSource = {
  id: "chart",
  name: "Chart",
  entry: "index.tsx",
  dependencies: { "chart.js": "4.6.2" },
  files: {
    "index.tsx": text(`import { defineElement, Editable, useDocument } from "@paged/sdk";
import { drawChart, type ChartProps } from "./draw";

export default defineElement<ChartProps & { source: string; caption: string }>({
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
    source: {
      kind: "text",
      label: "Linked table",
      help: "The class or id of a table element; its rows replace the data below.",
      default: "",
      placeholder: "e.g. revenue-table",
    },
    title: { kind: "text", default: "" },
    palette: { kind: "select", options: ["indigo", "warm", "mono"], default: "indigo" },
    stacked: { kind: "boolean", label: "Stacked (bar, area)", default: false },
    legend: { kind: "select", options: ["bottom", "top", "right", "none"], default: "bottom" },
    unit: { kind: "text", label: "Value suffix", default: "", placeholder: "e.g. M€ or %" },
    height: { kind: "number", label: "Height (mm)", default: 70, min: 30, max: 200 },
    caption: { kind: "text", default: "" },
  },
  render: ({ props, mode }) => {
    // A linked table's rows, when the source names one: edit the table and this redraws.
    const doc = useDocument();
    const source = (props.source ?? "").trim();
    const linked = source ? doc.find(source) : undefined;
    const rows = linked?.type === "table" && Array.isArray(linked.props.rows) ? (linked.props.rows as string[][]) : undefined;
    const result = drawChart(props, rows);
    return (
      <figure className="chart">
        <div className="chart-box">
          {"error" in result ? (
            <div className="chart-error" style={{ height: props.height + "mm" }}>{result.error}</div>
          ) : (
            <img className="chart-image" src={result.url} alt={props.title || "Chart"} style={{ height: props.height + "mm" }} />
          )}
          {mode === "edit" && source && (
            <span className={rows ? "chart-link" : "chart-link chart-link-missing"}>
              {rows ? "Linked to table “" + source + "”" : "No table “" + source + "”: showing the data below"}
            </span>
          )}
        </div>
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
  return parseRows(
    text
      .split(/\\r?\\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split(/\\s*[,;\\t]\\s*/)),
  );
}

/** The same from table cells: header row first, labels in the first column. */
export function parseRows(cells: string[][]) {
  const rows = cells
    .map((r) => r.map((c) => String(c ?? "").trim()))
    .filter((r) => r.some(Boolean));
  if (rows.length < 2) throw new Error("Add a header row and at least one data row.");
  const [header, ...body] = rows;
  const series = header.slice(1);
  if (!series.length) throw new Error("The header needs at least one series after the label column.");
  return {
    labels: body.map((r) => r[0]),
    series: series.map((name, i) => ({
      name,
      values: body.map((r) => {
        const n = parseFloat((r[i + 1] ?? "").replace(/\u2212/g, "-").replace(/[^0-9.+-]/g, ""));
        return Number.isFinite(n) ? n : null;
      }),
    })),
  };
}

const cache = new Map<string, { url: string } | { error: string }>();

/**
 * Draws synchronously (no animation) and returns a PNG data URL. \`rows\`, from
 * a linked table, replace \`props.data\`. Cached per settings and effective data.
 */
export function drawChart(props: ChartProps, rows?: string[][]): { url: string } | { error: string } {
  const { type, title, palette, stacked, legend, unit, height } = props;
  const key = JSON.stringify([type, title, palette, stacked, legend, unit, height, rows ?? props.data]);
  const hit = cache.get(key);
  if (hit) return hit;

  let result: { url: string } | { error: string };
  try {
    const { labels, series } = rows ? parseRows(rows) : parseData(props.data);
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
.chart-box { position: relative; }
.chart-link {
  position: absolute; right: 0; top: 0; font: 8pt ui-sans-serif, system-ui, sans-serif; pointer-events: none;
  color: #2b2bff; background: rgba(255, 255, 255, 0.9); border: 1px solid #e7e3dc; border-radius: 4px; padding: 1px 6px;
}
.chart-link-missing { color: #6b6760; }
.chart-image { display: block; width: 100%; object-fit: contain; }
.chart-error {
  display: flex; align-items: center; justify-content: center; padding: 4mm;
  border: 1px dashed #fca5a5; border-radius: 4px; color: #b91c1c; font-size: 0.85em; text-align: center;
}
.chart figcaption { margin-top: 0.4em; font-size: 0.85em; color: #78716c; text-align: center; }
`),
  },
};
