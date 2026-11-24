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

export function sampleDocument(): DocumentModel {
  return {
    version: 1,
    title: "Quarterly Report",
    customCss: "",
    components: [callout, qr],
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
        { text: "A first draft of a WYSIWYG document editor. Every block on this page is a React component with an edit mode and a print mode." },
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
      el("custom:callout", {
        tone: "info",
        title: "Custom component",
        body: "This callout is a React component written inside the editor and saved with the document.",
      }),
      el("text", { text: filler }),
      el("page-break", {}),
      el("heading", { text: "Appendix", level: 2 }),
      el("text", { text: filler }),
      el("text", { text: filler }),
      el("custom:qr", { value: "https://example.com/reports/q3", size: 88, caption: "Scan for the online version" }),
      el("footer", { left: "", center: "Page {page} of {pages}", right: "" }),
    ],
  };
}
