import type { ComponentSource } from "../../types";
import { text } from "../util";

/**
 * A diagram from text, drawn by mermaid. Mermaid renders asynchronously, so
 * Edit mode renders it (debounced) and saves the SVG with the element; every
 * mode then shows that saved SVG, so the editor and the print always match.
 */
export const diagram: ComponentSource = {
  id: "diagram",
  name: "Diagram",
  entry: "index.tsx",
  dependencies: { mermaid: "11.17.2" },
  files: {
    "index.tsx": text(`import { defineElement, Editable, useElement, useElementState } from "@paged/sdk";
import { useEffect, useRef, useState } from "react";
import { renderDiagram, withId, type Rendered, type Theme } from "./render";

type Props = { source: string; theme: Theme; height: number; caption: string };

/** The saved rendering: the SVG, and which source and theme it was made from. */
type Saved = Rendered & { key: string };

// Bump when the mermaid configuration changes, to re-render saved diagrams.
const CONFIG_VERSION = 1;

const HOW_IT_WORKS = [
  "flowchart LR",
  "  doc[(Document JSON)] --> measure[Measure every block]",
  '  measure --> paginate{{"paginate()"}}',
  "  paginate --> pages[Pages]",
  "  pages --> edit([Edit])",
  "  pages --> preview([Preview])",
  '  pages --> print(["Print / PDF"])',
  "  classDef accent stroke:#ff5a1f,stroke-width:2.5px",
  "  class paginate accent",
].join("\\n");

export default defineElement<Props>({
  label: "Diagram",
  icon: "⧉",
  fields: {
    source: {
      kind: "textarea",
      label: "Mermaid source",
      help: "Flowcharts, sequence diagrams, timelines… in mermaid syntax (mermaid.js.org).",
      default: HOW_IT_WORKS,
    },
    theme: {
      kind: "select",
      options: [
        { value: "paper", label: "Paper" },
        { value: "night", label: "Night" },
      ],
      default: "paper",
    },
    height: { kind: "number", label: "Max height (mm)", default: 60, min: 20, max: 240 },
    caption: { kind: "text", default: "How this editor works, drawn from nine lines of text" },
  },
  render: ({ props, mode }) => {
    const { node } = useElement();
    const [saved, setSaved] = useElementState<Saved | null>("rendered", null);
    const theme: Theme = props.theme === "night" ? "night" : "paper";
    const source = props.source ?? "";
    const maxHeight = Math.max(10, props.height || 60) + "mm";
    const key = JSON.stringify([source, theme, CONFIG_VERSION]);
    // A stable SVG id per element (mermaid scopes its CSS and markers by it).
    const id = "mmd-" + String(node.id).replace(/[^A-Za-z0-9_-]/g, "");

    return (
      <figure className={"diagram diagram-" + theme}>
        <div className="diagram-canvas">
          {saved?.svg ? (
            <div
              className="diagram-svg"
              style={{ maxHeight, ["--diagram-max" as any]: maxHeight }}
              dangerouslySetInnerHTML={{ __html: withId(saved, id) }}
            />
          ) : (
            <div className="diagram-empty" style={{ height: maxHeight }}>
              {mode === "edit" ? "Drawing the diagram…" : "Open in Edit mode to draw this diagram"}
            </div>
          )}
          {mode === "edit" && (
            <Renderer source={source} theme={theme} renderKey={key} savedKey={saved?.key} onRendered={setSaved} />
          )}
        </div>
        {props.caption && <Editable as="figcaption" field="caption" />}
      </figure>
    );
  },
});

/**
 * Edit mode only: re-renders 400 ms after the source or theme stops changing
 * and saves the result. Shows progress and syntax errors over the last good
 * drawing (absolutely positioned, so the box keeps its size).
 */
function Renderer({ source, theme, renderKey, savedKey, onRendered }: {
  source: string;
  theme: Theme;
  renderKey: string;
  savedKey?: string;
  onRendered: (saved: Saved) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = useRef(onRendered);
  latest.current = onRendered;

  useEffect(() => {
    if (savedKey === renderKey) {
      setBusy(false);
      setError("");
      return;
    }
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(() => {
      renderDiagram(source, theme).then(
        (rendered) => {
          if (cancelled) return;
          setError("");
          setBusy(false);
          // One saved (undoable) change per finished render.
          latest.current({ ...rendered, key: renderKey });
        },
        (err) => {
          if (cancelled) return;
          setBusy(false);
          setError(String((err && err.message) || err));
        },
      );
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [renderKey, savedKey]);

  if (error) {
    return (
      <div className="diagram-note diagram-note-error" title={error}>
        {error.split("\\n").slice(0, 4).join("\\n")}
      </div>
    );
  }
  return busy ? <div className="diagram-note">Rendering…</div> : null;
}
`),
    "render.ts": text(`import mermaid from "mermaid";

export type Theme = "paper" | "night";

/** A rendered diagram: SVG markup and the id it was rendered with. */
export type Rendered = { svg: string; id: string };

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

const THEME_VARIABLES: Record<Theme, Record<string, unknown>> = {
  paper: {
    darkMode: false,
    background: "#ffffff",
    fontFamily: FONT,
    fontSize: "15px",
    primaryColor: "#ffffff",
    primaryTextColor: "#14120f",
    primaryBorderColor: "#14120f",
    secondaryColor: "#fff1ea",
    secondaryTextColor: "#14120f",
    secondaryBorderColor: "#ff5a1f",
    tertiaryColor: "#f1f1ff",
    tertiaryTextColor: "#14120f",
    tertiaryBorderColor: "#2b2bff",
    mainBkg: "#ffffff",
    nodeBorder: "#14120f",
    nodeTextColor: "#14120f",
    textColor: "#14120f",
    titleColor: "#14120f",
    lineColor: "#6b6760",
    clusterBkg: "#faf8f5",
    clusterBorder: "#e7e3dc",
    edgeLabelBackground: "#ffffff",
    noteBkgColor: "#fff1ea",
    noteBorderColor: "#ff5a1f",
    noteTextColor: "#14120f",
    actorBkg: "#ffffff",
    actorBorder: "#14120f",
    actorTextColor: "#14120f",
    signalColor: "#14120f",
    signalTextColor: "#14120f",
  },
  night: {
    darkMode: true,
    background: "#0d0f1a",
    fontFamily: FONT,
    fontSize: "15px",
    primaryColor: "#161a2e",
    primaryTextColor: "#f4f1ea",
    primaryBorderColor: "#9a9aff",
    secondaryColor: "#2a1a14",
    secondaryTextColor: "#f4f1ea",
    secondaryBorderColor: "#ff5a1f",
    tertiaryColor: "#12152a",
    tertiaryTextColor: "#f4f1ea",
    tertiaryBorderColor: "#2b2bff",
    mainBkg: "#161a2e",
    nodeBorder: "#9a9aff",
    nodeTextColor: "#f4f1ea",
    textColor: "#f4f1ea",
    titleColor: "#f4f1ea",
    lineColor: "#a8a49c",
    clusterBkg: "#12152a",
    clusterBorder: "#2a2f4d",
    edgeLabelBackground: "#0d0f1a",
    noteBkgColor: "#2a1a14",
    noteBorderColor: "#ff5a1f",
    noteTextColor: "#f4f1ea",
    actorBkg: "#161a2e",
    actorBorder: "#9a9aff",
    actorTextColor: "#f4f1ea",
    signalColor: "#f4f1ea",
    signalTextColor: "#f4f1ea",
  },
};

const config = (theme: Theme) => ({
  startOnLoad: false,
  securityLevel: "strict" as const,
  // Errors are shown by the element, not drawn into the page.
  suppressErrorRendering: true,
  // Labels as SVG <text>, not HTML in <foreignObject>: survives static markup and print.
  htmlLabels: false,
  flowchart: { htmlLabels: false, curve: "basis" as const, nodeSpacing: 28, rankSpacing: 36, padding: 10 },
  theme: "base" as const,
  themeVariables: THEME_VARIABLES[theme],
  fontFamily: FONT,
});

mermaid.initialize(config("paper"));

// Renders run one at a time: the theme is global configuration in mermaid.
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

/**
 * Renders mermaid source to SVG markup that scales to its container.
 * Each render gets a fresh id: mermaid removes any element that already has
 * the id it renders with, which would be the drawing on the page.
 */
export function renderDiagram(source: string, theme: Theme): Promise<Rendered> {
  const id = "mmd-r" + Date.now().toString(36) + (counter++).toString(36);
  const run = queue.then(async () => {
    mermaid.initialize(config(theme));
    const { svg } = await mermaid.render(id, source);
    return { svg: responsive(svg), id };
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Drops mermaid's fixed width so CSS sizes the SVG; the viewBox keeps its proportions. */
function responsive(svg: string) {
  const open = svg.match(/<svg[^>]*>/);
  if (!open || open.index === undefined) return svg;
  const box = (open[0].match(/viewBox="([^"]*)"/)?.[1] ?? "").trim().split(/[ ,]+/).map(Number);
  const width = box[2] > 0 ? box[2] : 0;
  const tag = open[0]
    .replace(/ width="[^"]*"/, "")
    .replace(/ height="[^"]*"/, "")
    .replace(/ style="[^"]*"/, "")
    .replace(/^<svg/, '<svg preserveAspectRatio="xMidYMid meet"' + (width ? ' style="max-width: ' + width + 'px"' : ""));
  return svg.slice(0, open.index) + tag + svg.slice(open.index + open[0].length);
}

/** The saved markup with its render id replaced by this element's id (unique on the page). */
export function withId(rendered: Rendered, id: string) {
  return rendered.id && rendered.id !== id ? rendered.svg.split(rendered.id).join(id) : rendered.svg;
}
`),
    "diagram.css": text(`.diagram { margin: 0 0 1em; break-inside: avoid; }
.diagram-canvas { position: relative; }
.diagram-night .diagram-canvas { background: #0d0f1a; border-radius: 3mm; padding: 5mm; }
.diagram-svg { display: block; overflow: hidden; }
.diagram-svg svg { display: block; width: 100%; height: auto; max-height: var(--diagram-max, 60mm); margin: 0 auto; }
.diagram-empty {
  display: flex; align-items: center; justify-content: center; box-sizing: border-box;
  border: 1px dashed #e7e3dc; border-radius: 3px; color: #6b6760; font-size: 8pt;
}
.diagram-night .diagram-empty { border-color: #2a2f4d; color: #a8a49c; }
.diagram-note {
  position: absolute; right: 0; top: 0; max-width: 70%; padding: 2px 7px; border-radius: 3px;
  font: 7.5pt ui-sans-serif, system-ui, sans-serif; color: #6b6760; background: rgba(255, 255, 255, 0.9);
  pointer-events: none;
}
.diagram-note-error {
  top: auto; bottom: 0; left: 0; right: auto; max-width: 100%; white-space: pre-wrap; text-align: left;
  font: 7.5pt ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #b4380f;
  background: #fff1ea; border: 1px solid #ff5a1f; pointer-events: auto; cursor: help; overflow: hidden; max-height: 100%;
}
.diagram figcaption { margin-top: 0.6em; }
`),
  },
};
