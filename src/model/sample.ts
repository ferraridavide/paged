import { newId } from "./ids";
import type { DocumentModel, ElementNode, StyleMap } from "./types";

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
  "Paged.js takes the flowing HTML of this document and splits it into pages using the CSS Paged Media rules generated from the page settings. Headers and footers are running elements, repeated in each page's margin boxes. Try changing the page size or margins in the sidebar and switching to Preview to see the document re-paginate.";

export function sampleDocument(): DocumentModel {
  return {
    version: 1,
    title: "Quarterly Report",
    customCss: "",
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
      el("text", { text: filler }),
      el("page-break", {}),
      el("heading", { text: "Appendix", level: 2 }),
      el("text", { text: filler }),
      el("text", { text: filler }),
      el("footer", { left: "", center: "Page {page} of {pages}", right: "" }),
    ],
  };
}
