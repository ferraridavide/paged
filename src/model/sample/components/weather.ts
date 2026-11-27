import type { ComponentSource } from "../../types";
import { text } from "../util";

/**
 * A document that fetches its own numbers: daily temperatures for a city from
 * Open-Meteo, charted with Observable Plot. The fetch happens in Edit mode and
 * the data is saved with the element, so print draws the same SVG offline.
 */
export const weather: ComponentSource = {
  id: "weather",
  name: "Weather",
  entry: "index.tsx",
  dependencies: { "@observablehq/plot": "0.6.17" },
  files: {
    "index.tsx": text(`import { defineElement, Editable, useElement, useElementState } from "@paged/sdk";
import { useEffect, useRef, useState } from "react";
import { CITIES, fetchWeather, requestKey, formatFetched, type WeatherData, type WeatherProps } from "./weather";
import { weatherSvg } from "./plot";

export default defineElement<WeatherProps & { height: number; caption: string }>({
  label: "Weather",
  icon: "☂",
  fields: {
    city: {
      kind: "select",
      options: Object.entries(CITIES).map(([value, c]) => ({ value, label: c.label })),
      default: "milan",
    },
    pastDays: { kind: "number", label: "Past days", default: 14, min: 0, max: 92 },
    forecastDays: { kind: "number", label: "Forecast days", default: 7, min: 1, max: 16 },
    height: { kind: "number", label: "Height (mm)", default: 75, min: 40, max: 200 },
    caption: { kind: "text", default: "Daily low and high, observed and forecast. Nobody pasted these numbers in." },
  },
  render: ({ props, mode }) => {
    // Persisted with the element: the fetched series and when they were fetched.
    const [data, setData] = useElementState<WeatherData | null>("data", null);
    const size = { height: props.height + "mm" };
    const svg = data ? weatherSvg(data, props.height) : "";

    return (
      <figure className="wx">
        <div className="wx-box" style={size}>
          {svg ? (
            <div className="wx-plot" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : data ? (
            <div className="wx-empty">Can't chart this data: press ↻ Refresh in Edit mode</div>
          ) : (
            mode === "print" && <div className="wx-empty">Open in Edit mode to fetch the data</div>
          )}
          {mode === "edit" && <Fetcher props={props} data={data} onData={setData} />}
        </div>
        <figcaption>
          {props.caption && <Editable field="caption" />}
          {data && (
            <span className="wx-source">
              {(props.caption ? " — " : "") + data.label + " · Open-Meteo · fetched " + formatFetched(data.fetchedAt)}
            </span>
          )}
        </figcaption>
      </figure>
    );
  },
});

/** One request per element and settings, shared by remounts (and StrictMode's double effects). */
const jobs = new Map<string, { promise: Promise<WeatherData>; applied: boolean }>();

/** Edit mode only: fetches when the saved data doesn't match the settings, and on "Refresh". */
function Fetcher({ props, data, onData }: { props: WeatherProps; data: WeatherData | null; onData: (d: WeatherData) => void }) {
  const { node } = useElement();
  const [status, setStatus] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const latest = useRef(onData);
  latest.current = onData;
  const want = requestKey(props);
  const have = data ? requestKey(data) : "";

  const load = (force: boolean) => {
    const key = node.id + "|" + want;
    let job = jobs.get(key);
    if (!job || force) {
      if (job) job.applied = true; // a newer request replaces it
      job = { promise: fetchWeather(props), applied: false };
      jobs.set(key, job);
    }
    const mine = job;
    let alive = true;
    setStatus({ busy: !mine.applied });
    mine.promise.then(
      (d) => {
        if (alive) setStatus({ busy: false });
        // Whoever is mounted first saves it, once: one undo step.
        if (alive && !mine.applied) {
          mine.applied = true;
          latest.current(d);
        }
      },
      (err) => {
        mine.applied = true;
        if (alive) setStatus({ busy: false, error: (err as Error).message });
      },
    );
    return () => {
      alive = false;
    };
  };

  // Auto-fetch once when there is no data for these settings yet (a failed
  // request isn't retried automatically: use Refresh).
  useEffect(() => (have === want ? undefined : load(false)), [want, have]);

  return (
    <>
      {!data && (
        <div className="wx-empty">
          {status.busy
            ? "Fetching the forecast…"
            : status.error
              ? "Couldn't fetch the data: " + status.error
              : "No data yet: press ↻ Refresh"}
        </div>
      )}
      {data && status.error && <span className="wx-note">{status.error}</span>}
      <button
        className="wx-refresh"
        disabled={status.busy}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => load(true)}
      >
        {status.busy ? "Fetching…" : "↻ Refresh"}
      </button>
    </>
  );
}
`),
    "weather.ts": text(`/** Cities with their coordinates baked in: no geocoding request. */
export const CITIES: Record<string, { label: string; lat: number; lon: number }> = {
  milan: { label: "Milan", lat: 45.46, lon: 9.19 },
  london: { label: "London", lat: 51.51, lon: -0.13 },
  "new-york": { label: "New York", lat: 40.71, lon: -74.01 },
  tokyo: { label: "Tokyo", lat: 35.68, lon: 139.69 },
  sydney: { label: "Sydney", lat: -33.87, lon: 151.21 },
  reykjavik: { label: "Reykjavík", lat: 64.15, lon: -21.94 },
  cairo: { label: "Cairo", lat: 30.04, lon: 31.24 },
  "sao-paulo": { label: "São Paulo", lat: -23.55, lon: -46.63 },
};

export interface WeatherProps {
  city: string;
  pastDays: number;
  forecastDays: number;
}

/** What's saved with the element: compact, and enough to redraw offline. */
export interface WeatherData {
  city: string;
  label: string;
  pastDays: number;
  forecastDays: number;
  /** First day of the series (YYYY-MM-DD, the city's time zone); one value per day from there. */
  start: string;
  /** The day of the fetch: past before it, forecast from it. */
  today: string;
  tmax: (number | null)[];
  tmin: (number | null)[];
  rain: (number | null)[];
  fetchedAt: string;
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export const settings = (p: WeatherProps) => ({
  city: CITIES[p.city] ? p.city : "milan",
  pastDays: clamp(p.pastDays, 0, 92, 14),
  forecastDays: clamp(p.forecastDays, 1, 16, 7),
});

/** Identifies a request: saved data with another key is stale. */
export const requestKey = (p: WeatherProps) => {
  const s = settings(p);
  return s.city + "|" + s.pastDays + "|" + s.forecastDays;
};

const round1 = (xs: unknown[]) => xs.map((v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null));

export async function fetchWeather(p: WeatherProps): Promise<WeatherData> {
  const s = settings(p);
  const city = CITIES[s.city];
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=" + city.lat + "&longitude=" + city.lon +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto" +
    "&past_days=" + s.pastDays + "&forecast_days=" + s.forecastDays;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15000);
  try {
    const res = await fetch(url, { signal: abort.signal });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.error) throw new Error(json?.reason ?? "HTTP " + res.status);
    const d = json.daily;
    if (!d?.time?.length) throw new Error("no daily data in the response");
    return {
      ...s,
      label: city.label,
      start: d.time[0],
      today: d.time[Math.min(s.pastDays, d.time.length - 1)],
      tmax: round1(d.temperature_2m_max ?? []),
      tmin: round1(d.temperature_2m_min ?? []),
      rain: round1(d.precipitation_sum ?? []),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    throw (err as Error).name === "AbortError" ? new Error("the request timed out") : err;
  } finally {
    clearTimeout(timer);
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "27 Nov 2026, 12:40", in the reader's time zone. */
export function formatFetched(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "?";
  const pad = (n: number) => String(n).padStart(2, "0");
  return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
`),
    "plot.ts": text(`import * as Plot from "@observablehq/plot";
import type { WeatherData } from "./weather";

const INK = "#14120f";
const MUTED = "#6b6760";
const HAIRLINE = "#e7e3dc";
const ORANGE = "#ff5a1f";
const BLUE = "#2b2bff";
const DAY = 864e5;
// Drawn at the A4 content width; the SVG scales to the page.
const WIDTH_PX = 642;
const PX_PER_MM = 96 / 25.4;

/** 1, 2 or 5 times a power of ten, giving about \`count\` steps over \`span\`. */
function niceStep(span: number, count: number) {
  const raw = span / count;
  const step = Math.pow(10, Math.floor(Math.log10(raw)));
  const err = raw / step;
  return step * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
}

function ticks(lo: number, hi: number, count: number) {
  const step = niceStep(hi - lo, count);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

const cache = new Map<string, string>();

/**
 * The chart as SVG markup, built synchronously (Plot needs only a document),
 * so Edit mode, Preview and print show the same thing. Cached per data and size.
 */
export function weatherSvg(data: WeatherData, heightMm: number): string {
  const key = JSON.stringify([data, heightMm]);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let svg = "";
  try {
    svg = draw(data, heightMm);
  } catch (err) {
    console.warn("weather: can't draw", err);
  }
  if (cache.size > 32) cache.delete(cache.keys().next().value!);
  cache.set(key, svg);
  return svg;
}

function draw(data: WeatherData, heightMm: number) {
  const t0 = Date.parse(data.start + "T00:00:00Z");
  const today = new Date(Date.parse(data.today + "T00:00:00Z"));
  const n = data.tmax.length;
  const end = new Date(t0 + n * DAY);
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : NaN);
  const rows = data.tmax.map((_, i) => {
    const max = num(data.tmax[i]);
    const min = num(data.tmin[i]);
    return {
      day: new Date(t0 + i * DAY),
      next: new Date(t0 + (i + 1) * DAY),
      // Daily values sit at midday, centred on their day's bar.
      mid: new Date(t0 + (i + 0.5) * DAY),
      max,
      min,
      mean: (max + min) / 2,
      rain: Math.max(0, num(data.rain[i]) || 0),
    };
  });
  const temps = rows.flatMap((r) => [r.min, r.max]).filter(Number.isFinite);
  if (!temps.length) throw new Error("no temperatures");

  // Temperatures take the top of the frame, precipitation a band below them.
  let lo = Math.min(...temps);
  let hi = Math.max(...temps);
  if (hi - lo < 4) {
    const c = (hi + lo) / 2;
    lo = c - 2;
    hi = c + 2;
  }
  const tLo = lo - (hi - lo) * 0.06;
  const tHi = hi + (hi - lo) * 0.1;
  const band = (tHi - tLo) * 0.4;
  const yLo = tLo - band;
  const maxRain = Math.max(...rows.map((r) => r.rain));
  const rainStep = niceStep(Math.max(maxRain, 4), 2);
  const rainTop = Math.ceil(Math.max(maxRain, 4) / rainStep) * rainStep;
  const rainY = (mm: number) => yLo + (mm / rainTop) * band * 0.9;

  const pastN = Math.round((today.getTime() - t0) / DAY);
  // The forecast's dashes start from the last observed day.
  const past = rows.slice(0, Math.min(n, pastN));
  const future = rows.slice(Math.max(0, pastN - 1));
  const curve = "monotone-x";

  const marks = [
    // The forecast, on a faint tint.
    pastN < n && Plot.rect([0], { x1: () => today, x2: () => end, y1: () => yLo, y2: () => tHi, fill: INK, fillOpacity: 0.035 }),
    Plot.gridY(ticks(tLo, tHi, 4), { stroke: HAIRLINE, strokeOpacity: 1 }),
    Plot.ruleY([tLo - band * 0.02], { stroke: HAIRLINE }),
    Plot.rect(rows, { x1: "day", x2: "next", y1: () => yLo, y2: (r: any) => rainY(r.rain), fill: BLUE, fillOpacity: 0.22, inset: 1.5 }),
    Plot.areaY(rows, { x: "mid", y1: "min", y2: "max", fill: ORANGE, fillOpacity: 0.2, curve }),
    Plot.lineY(rows, { x: "mid", y: "max", stroke: ORANGE, strokeWidth: 1, curve }),
    Plot.lineY(rows, { x: "mid", y: "min", stroke: ORANGE, strokeWidth: 1, curve }),
    // Mean of low and high: solid where observed, dashed where forecast.
    past.length > 1 && Plot.lineY(past, { x: "mid", y: "mean", stroke: INK, strokeWidth: 1.5, curve }),
    future.length > 1 && Plot.lineY(future, { x: "mid", y: "mean", stroke: INK, strokeWidth: 1.5, strokeDasharray: "3,3", curve }),
    pastN > 0 && pastN < n && Plot.ruleX([today], { y1: yLo, y2: tHi, stroke: MUTED, strokeDasharray: "2,3" }),
    pastN > 0 && Plot.text([today], { x: (d: Date) => d, text: () => "← observed", frameAnchor: "top", textAnchor: "end", dx: -5, dy: 3, fill: MUTED }),
    pastN < n && Plot.text([today], { x: (d: Date) => d, text: () => "forecast →", frameAnchor: "top", textAnchor: "start", dx: 5, dy: 3, fill: MUTED }),
    Plot.axisX({ tickFormat: "%-d %b", tickSize: 3, stroke: HAIRLINE, fill: MUTED, label: null }),
    Plot.axisY(ticks(tLo, tHi, 4), { tickFormat: (v: number) => (v < 0 ? "−" + -v : v) + "°", tickSize: 0, fill: MUTED, label: "°C", labelArrow: "none" }),
    Plot.axisY([rainTop / 2, rainTop].map(rainY), {
      anchor: "right",
      tickFormat: (v: number) => Math.round(((v - yLo) / (band * 0.9)) * rainTop * 10) / 10 + " mm",
      tickSize: 0,
      fill: BLUE,
      fillOpacity: 0.7,
      label: null,
    }),
  ].filter(Boolean) as Plot.Markish[];

  const plot = Plot.plot({
    width: WIDTH_PX,
    height: Math.round(Math.max(30, heightMm) * PX_PER_MM),
    marginTop: 18,
    marginRight: 44,
    marginBottom: 22,
    marginLeft: 34,
    x: { type: "utc", domain: [new Date(t0), end] },
    y: { domain: [yLo, tHi] },
    style: { fontFamily: "inherit", fontSize: "8pt", color: MUTED, background: "transparent", overflow: "visible" },
    marks,
  });
  return (plot as Element).outerHTML;
}
`),
    "weather.css": text(`.wx { margin: 0 0 1em; break-inside: avoid; }
.wx-box { position: relative; width: 100%; }
.wx-plot, .wx-plot svg { display: block; width: 100%; height: 100%; }
.wx-empty {
  position: absolute; inset: 0; display: grid; place-items: center; padding: 4mm; text-align: center;
  border: 1px dashed #e7e3dc; color: #6b6760; font-size: 9pt;
}
.wx-refresh {
  position: absolute; right: 0; top: 0; font: 8pt ui-sans-serif, system-ui, sans-serif;
  color: #14120f; background: #ffffff; border: 1px solid #e7e3dc; border-radius: 4px; padding: 2px 8px; cursor: pointer;
}
.wx-refresh:hover:not(:disabled) { border-color: #ff5a1f; color: #ff5a1f; }
.wx-refresh:disabled { color: #6b6760; cursor: default; }
.wx-note {
  position: absolute; left: 40px; top: 0; max-width: 60%; font: 8pt ui-sans-serif, system-ui, sans-serif;
  color: #b42318; background: #ffffff; padding: 2px 6px; border-radius: 4px; pointer-events: none;
}
.wx figcaption { margin-top: 2mm; }
`),
  },
};
