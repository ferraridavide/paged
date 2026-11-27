/**
 * The sample document: "Can your word processor do this?" A set of numbered
 * dares, each a custom component showing something a word processor can't
 * do. Every component lives in ./components and is saved inside the document.
 */
import { newId } from "../ids";
import type { DocumentModel, ElementNode, StyleMap } from "../types";
import { callout } from "./components/callout";
import { chart } from "./components/chart";
import { cover } from "./components/cover";
import { diagram } from "./components/diagram";
import { fractal } from "./components/fractal";
import { globe } from "./components/globe";
import { halftone } from "./components/halftone";
import { molecule } from "./components/molecule";
import { contents, docStats, flipbook, progress, thumbTabs } from "./components/pageAware";
import { qr } from "./components/qr";
import { scene3d } from "./components/scene3d";
import { score } from "./components/score";
import { signature } from "./components/signature";
import { weather } from "./components/weather";

function el<P>(type: string, props: P, style: StyleMap = {}, classes?: string[]): ElementNode {
  return { id: newId(), type, props: props as Record<string, unknown>, style, ...(classes ? { classes } : {}) };
}

const p = (content: string, ...classes: string[]) => el("text", { runs: [{ text: content }] }, {}, classes.length ? classes : undefined);
/** A dare's intro: kept on the same page as the figure after it. */
const intro = (content: string) => el("text", { runs: [{ text: content }] }, { "break-after": "avoid" });
const h1 = (t: string) => el("heading", { text: t, level: 1 });
const h2 = (t: string) => el("heading", { text: t, level: 2 });
/** The small print under a dare: what it's made of. */
const how = (t: string) => p(t, "how");

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

/** Document CSS: the house style. Classes are added to elements in the inspector. */
const documentCss = `:scope { --ink: #14120f; --muted: #6b6760; --rule: #e7e3dc; --signal: #ff5a1f; --ultra: #2b2bff; }

/* Parts and dares */
.hd-h1 {
  font: italic 400 38pt/1 ${SERIF}; letter-spacing: -0.025em;
  border-top: 1.2mm solid var(--ink); padding-top: 5mm; margin: 0 0 5mm;
}
.hd-h2 { font-size: 15pt; font-weight: 700; letter-spacing: -0.01em; margin: 9mm 0 2mm; }
.hd-h1 + .hd-text, .ed-block:has(> .hd-h1) + .ed-block > .hd-text { font-size: 12.5pt; line-height: 1.45; color: #3d3a35; margin-bottom: 4mm; }

.kicker { font: 600 7.5pt/1.2 ${MONO}; letter-spacing: 0.14em; text-transform: uppercase; color: var(--signal); margin: 0 0 2.5mm; }
.display { font: italic 400 30pt/1.04 ${SERIF}; letter-spacing: -0.02em; margin: 0 0 5mm; text-wrap: balance; }
.lead { font-size: 12.5pt; line-height: 1.45; color: #3d3a35; text-wrap: pretty; }
.how {
  font: 400 7.5pt/1.45 ${MONO}; color: var(--muted); letter-spacing: 0.01em;
  border-top: 0.3mm solid var(--rule); padding-top: 1.6mm; margin: 1mm 0 5mm;
}

/* Captions of every figure component */
figcaption { font: 400 7.5pt/1.4 ${MONO}; color: var(--muted); margin-top: 2mm; letter-spacing: 0.01em; text-align: left; }

.hd-table th { font: 600 7.5pt ${MONO}; letter-spacing: 0.08em; text-transform: uppercase; }
.regions td:not(:first-child), .regions th:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }

/* The running head */
.running { font: 500 7pt ${MONO}; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
`;

/** Page CSS for the landscape section: a magazine spread in nothing but CSS. */
const spreadCss = `.mag-kicker { font: 700 8pt ${MONO}; letter-spacing: 0.2em; text-transform: uppercase; color: var(--signal); margin: 0 0 3mm; }
.mag-head {
  font: 900 68pt/0.86 ${SERIF}; letter-spacing: -0.045em; margin: 0 0 8mm; max-width: 150mm;
  background: linear-gradient(100deg, var(--ink) 30%, var(--ultra) 62%, var(--signal) 92%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.orb {
  float: right; shape-outside: circle(50%) border-box; shape-margin: 5mm; clip-path: circle(50%); margin: -40mm 0 0 6mm;
  background:
    radial-gradient(circle at 32% 28%, rgba(255,255,255,0.8), transparent 34%),
    conic-gradient(from 210deg, var(--ultra), #9b5cff, var(--signal), #ffb38a, var(--ultra));
}
.mag-body { font-size: 11pt; line-height: 1.55; text-align: justify; hyphens: auto; margin-bottom: 4mm; }
.mag-body::first-letter { float: left; font: 700 50pt/0.8 ${SERIF}; margin: 1.5mm 2.5mm 0 0; color: var(--signal); }
.mag-quote {
  font: italic 400 21pt/1.2 ${SERIF}; margin: 2mm 0 5mm; padding-left: 5mm; border-left: 1.2mm solid var(--signal);
  max-width: 150mm;
}
.mag-cols {
  column-count: 3; column-gap: 7mm; column-rule: 0.3mm solid var(--rule);
  font-size: 8.5pt; line-height: 1.5; color: #3d3a35; text-align: justify; hyphens: auto; clear: both;
}
`;

const scoreHow =
  "abcjs 6 engraves the ABC text to SVG · ▶ plays it with a soft synth in Edit mode · the notes are a prop, edit them in the sidebar";

export function sampleDocument(): DocumentModel {
  return {
    version: 1,
    title: "Can your word processor do this?",
    customCss: documentCss,
    components: [
      cover, docStats, contents, thumbTabs, progress, flipbook,
      globe, scene3d, halftone, fractal,
      score, diagram, molecule,
      weather, chart, callout, signature, qr,
    ],
    page: {
      size: "A4",
      orientation: "portrait",
      margin: { top: "20mm", right: "22mm", bottom: "22mm", left: "22mm" },
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
      fontSize: "10.5pt",
      lineHeight: "1.5",
      color: "#14120f",
      // The cover is drawn by a component, edge to edge.
      firstPageDifferent: true,
    },
    elements: [
      // Header and footer zones: components drawn once per page, each knowing its page.
      { ...el("running-text", { left: "{title}", center: "", right: "paged.davide.im" }, {}, ["running"]), zone: "header" },
      { ...el("custom:thumb-tabs", { top: 46, size: 30, color: "#14120f", ghosts: true }), zone: "header" },
      { ...el("custom:progress", { color: "#ff5a1f" }), zone: "footer" },
      { ...el("custom:flipbook", { layout: "corner", solid: "icosahedron", degrees: 14, color: "#ff5a1f", size: 15 }), zone: "footer" },

      // ---- Cover ----
      el("custom:cover", {
        kicker: "A document that dares",
        title: "Can your word processor do this?",
        subtitle:
          "Every block in this document is a React component: open it, read it, change it. It prints exactly as you see it. Fifteen dares follow. Try them in Edit mode, then print.",
        style: "contours",
        palette: "signal",
        seed: 7,
      }),

      // ---- How to read this ----
      p("Before you start", "kicker"),
      p("Fifteen things a word processor can't do.", "display"),
      p(
        "Click any block to select it; its settings open on the right. Each one is a React component saved inside this file: right-click it and choose Edit component… to read and change its source. Nothing here is a screenshot.",
        "lead",
      ),
      el("custom:doc-stats", { note: "Counted live. Type anywhere and watch these change." }),
      p("Contents", "kicker"),
      el("custom:contents", { depth: 2 }),
      el("custom:callout", {
        tone: "warning",
        title: "Print it, then flip the corner",
        body: "The solid in the bottom-right corner turns 14° on every page. Print this document, hold the stack and flip through it: it spins. The tab on the right edge steps down with each part, like a dictionary's.",
      }),
      el("page-break", {}),

      // ---- Part I ----
      h1("Paper that knows where it is"),
      p("In a word processor, headers and footers are a menu of fields. Here they're components that ask the document where they are, and draw something different on every page."),
      h2("01 / Flip the corner"),
      intro("Look at the bottom-right corner. That wireframe is a footer component: it reads its page number and turns a little further on each page. On screen it's a detail; on paper it's a flip-book."),
      el("custom:flipbook", { layout: "strip", solid: "icosahedron", degrees: 14, color: "#14120f", size: 15 }),
      how("Every frame of the corner, one per page: the same component in its strip layout · usePageInfo() → { number, total } · no images"),
      h2("02 / A footer that reads along"),
      p("The bar under every page fills as you read, and its label is the part you're in, taken from the outline. Add a part heading anywhere and every footer after it updates."),
      how("usePageInfo().chapter · the latest top-level heading on or before the page"),
      h2("03 / Tabs on the edge"),
      p("On the right edge, a dark tab marks the current part, one position lower for each part. Print the document and the closed block shows five stripes you can open by thumb."),
      how("A header component, positioned against the page edge · useDocument().outline"),
      h2("04 / Contents that keep themselves"),
      p("The contents and the counters on page 2 are components too. They read the outline with the page each heading landed on, so they're right after every edit, with no Update Field to press."),
      how("useDocument() → { outline, pages, stats }"),
      el("page-break", {}),

      // ---- Part II ----
      h1("Pictures that are programs"),
      p("A figure here isn't a picture pasted in; it's code that draws. You can still move it, set it up in the sidebar, and print it."),
      h2("05 / Spin the globe"),
      intro("Drag the globe. The rotation is saved with the document, and the print is vector: every coastline is an SVG path."),
      el("custom:globe", {
        cities: ["Milan, 45.46, 9.19", "New York, 40.71, -74.01", "São Paulo, -23.55, -46.63", "Cape Town, -33.92, 18.42", "Mumbai, 19.08, 72.88", "Tokyo, 35.68, 139.69"],
        color: "#14120f",
        height: 92,
        caption: "Fig. 5 — Great-circle routes between six cities. Drag to spin.",
      }),
      how("d3-geo orthographic projection · world-atlas land at 1:110m, embedded as a JSON file of the component"),
      h2("06 / Orbit a 3D scene"),
      intro("A three.js scene, live in Edit mode. Frame it the way you like; when you let go, the camera and a still for print are saved."),
      el(
        "custom:scene3d",
        { shape: "knot", color: "#ff5a1f", height: 80, caption: "Fig. 6 — A torus knot, framed in Edit mode." },
        {},
        ["hero-scene"],
      ),
      how("three.js 0.187 from esm.sh · useElementState() for the camera and the still"),
      h2("07 / …and print it as a halftone"),
      intro("This halftone has no image of its own: it reads the 3D scene above and screens it into dots. Orbit the knot and it redraws."),
      el("custom:halftone", {
        image: "",
        source: "hero-scene",
        cell: 1.6,
        angle: 45,
        shape: "dot",
        ink: "#ff5a1f",
        paper: "#0d0f1a",
        invert: true,
        height: 80,
        caption: "Fig. 7 — The scene above, as a vector halftone at 45°.",
      }),
      how("useDocument().find('hero-scene') reads another element's state · a few thousand SVG circles"),
      h2("08 / Zoom forever"),
      intro("The Mandelbrot set, drawn by a shader on your graphics card. Drag to pan, scroll to zoom. Print keeps the view you stopped at."),
      el("custom:fractal", { palette: "ember", iterations: 200, height: 150, caption: "Fig. 8 — Seahorse Valley, computed per pixel on the GPU." }),
      how("A WebGL fragment shader, about 60 lines of GLSL · no library"),
      el("page-break", {}),

      // ---- Part III ----
      h1("Notation, not pictures of notation"),
      p("Music, diagrams and molecules have their own written languages. Type them; the document draws them, and the source stays editable."),
      h2("09 / Write music, hear it"),
      intro("This score is a few lines of ABC notation, lyrics included. Change a note in the sidebar and the engraving follows. In Edit mode, press play."),
      el("custom:score", { scale: 64, caption: "Fig. 9 — Ode to Joy, engraved from ABC notation." }),
      how(scoreHow),
      h2("10 / Draw a diagram by typing"),
      intro("The flowchart below is how this editor works, written as text. Add a line and the boxes rearrange themselves."),
      el("custom:diagram", { caption: "Fig. 10 — From the document to the page, as Mermaid text." }),
      how("Mermaid 11 renders the text to SVG in Edit mode; the result is saved for print"),
      h2("11 / Chemistry from a string"),
      intro("Molecules from one line of SMILES each. The formulas and molar masses are computed from the structures."),
      el("custom:molecule", { caption: "Fig. 11 — Three stimulants, one scaffold: two even share a formula." }),
      how("smiles-drawer parses and lays out the molecule as SVG · formula and mass counted from the graph"),
      el("page-break", {}),

      // ---- Part IV ----
      h1("Numbers that move"),
      p("Most documents hold numbers that were true when someone pasted them. These fetch their own, or follow a table."),
      h2("12 / Fetch the weather"),
      intro("Three weeks of temperatures, fetched from a public API when you open the document in Edit mode. Press refresh to fetch again; the print shows when."),
      el("custom:weather", {
        city: "milan",
        pastDays: 14,
        forecastDays: 7,
        height: 80,
        caption: "Fig. 12 — Daily low and high, observed and forecast. Nobody pasted these numbers in.",
      }),
      how("fetch() from Open-Meteo, no key · Observable Plot draws the SVG · the data is saved with the document"),
      h2("13 / Edit the table, the chart redraws"),
      intro("The chart below has no data of its own: it reads this table. Change a number and watch it."),
      el(
        "table",
        {
          rows: [
            ["Quarter", "Europe", "Americas", "Asia Pacific"],
            ["Q1", "0.9", "2.0", "0.6"],
            ["Q2", "1.1", "2.1", "0.7"],
            ["Q3", "1.4", "2.3", "0.9"],
            ["Q4", "1.8", "2.4", "1.3"],
          ],
          headerRow: true,
          striped: true,
          borderColor: "",
          headerBackground: "#f4f1ea",
          cellPadding: "",
        },
        { "break-after": "avoid" },
        ["regions"],
      ),
      el("custom:chart", {
        type: "bar",
        source: "regions",
        data: "Quarter, Europe, Americas, Asia Pacific\nQ1, 0.9, 2.0, 0.6",
        title: "",
        palette: "indigo",
        stacked: false,
        legend: "bottom",
        unit: "M€",
        height: 70,
        caption: "Fig. 13 — Revenue by region (M€), read live from the table above.",
      }),
      how("useDocument().find('regions') → the table's rows · Chart.js draws to an off-screen canvas"),

      // A landscape section, styled by its own Page CSS.
      el("page-break", {
        section: {
          orientation: "landscape",
          margin: { top: "18mm", right: "22mm", bottom: "20mm", left: "22mm" },
          background: "#fbfaf7",
          css: spreadCss,
        },
      }),
      h2("14 / This page is just CSS"),
      p("Landscape section · gradient type · shape-outside · columns", "mag-kicker"),
      p("Turn the page sideways.", "mag-head"),
      el("spacer", { height: "96mm" }, { width: "96mm" }, ["orb"]),
      p(
        "This spread is a section of its own: landscape, on an off-white background, with its own Page CSS. The headline is a gradient clipped to its letters. This paragraph runs around the sphere because of shape-outside: circle(), and its drop cap is a ::first-letter. None of it is a feature of the editor. It's the CSS you already know, scoped to these pages, and what you see is what prints, because the editor lays out the same pages for the screen and for paper.",
        "mag-body",
      ),
      p("“If a browser can draw it, a page can print it.”", "mag-quote"),
      p(
        "Select any block on this page and look at its classes in the inspector; the rules for them are in the section's Page CSS, on the section break before this page. The three columns of this paragraph are column-count: 3 with a column rule. The sphere is an empty Spacer element with a conic gradient, clipped to a circle. Change the section to portrait and the same CSS lays out the same content again.",
        "mag-cols",
      ),

      // Back to portrait.
      el("page-break", { section: {} }),

      // ---- Part V ----
      h1("Sign here"),
      p("Paperwork still ends with a signature. This one is drawn on the page, saved as vector strokes, and printed as ink."),
      h2("15 / Sign it on the page"),
      el("custom:signature", { name: "Your name", date: "27 November 2026", caption: "" }),
      how("perfect-freehand turns pointer samples into a pressure-sensitive outline · strokes are saved with the document"),
      h2("Make your own"),
      p("Every component in this document is in the Components menu. Open one, change it, or start a new one from scratch: write the React, pin an npm package, and use it on the page."),
      el("custom:qr", { value: "https://paged.davide.im/editor/", size: 88, caption: "paged.davide.im/editor — scan to open the editor" }),
    ],
  };
}
