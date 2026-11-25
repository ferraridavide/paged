import { renderToStaticMarkup } from "react-dom/server";
import documentCss from "../styles/document.css?raw";
import { componentsCss } from "../elements/registry";
import type { PageLayout } from "../layout/paginate";
import { sectionBox, sectionsCss, sectionsOf } from "../layout/sections";
import { baseTypography, declarations, elementsCss, scopedCustomCss } from "../model/css";
import type { DocumentModel } from "../model/types";
import { DocContext } from "./DocContext";
import { Page } from "./PagedDocument";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** All pages as static print-mode HTML, from an already computed layout. */
export function renderPagesHtml(doc: DocumentModel, layout: PageLayout[]) {
  const byId = new Map(doc.elements.map((n) => [n.id, n]));
  const indexOf = new Map(doc.elements.map((n, i) => [n.id, i]));
  const sections = sectionsOf(doc);
  return renderToStaticMarkup(
    <DocContext.Provider value={doc}>
      <div className="pd-pages">
        {layout.map((page, i) => (
          <Page
            key={i}
            page={page}
            section={sections[page.section] ?? sections[0]}
            visible
            number={i + 1}
            total={layout.length}
            doc={doc}
            byId={byId}
            indexOf={indexOf}
            mode="print"
            selectedId={null}
            dropIndex={null}
          />
        ))}
      </div>
    </DocContext.Provider>,
  );
}

/**
 * Prints the pages exactly as laid out on screen: renders every page from the
 * current layout into a hidden iframe with the document CSS. Each page size
 * gets a named `@page` rule, so sections in another size or orientation
 * print on paper of that size; the browser does no pagination of its own.
 */
export function printPages(doc: DocumentModel, layout: PageLayout[]) {
  const sections = sectionsOf(doc);
  const first = sectionBox(sections[0]);
  const sizes = new Map(sections.map((s) => {
    const box = sectionBox(s);
    return [box.sizeKey, box] as const;
  }));
  const pageRules = [...sizes.values()]
    .map((b) => `@page size-${b.sizeKey} { size: ${b.width}mm ${b.height}mm; margin: 0; }\n.pd-page[data-page-size="${b.sizeKey}"] { page: size-${b.sizeKey}; }`)
    .join("\n");
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(doc.title)}</title>
<style>${documentCss}</style>
<style>${componentsCss()}</style>
<style>${scopedCustomCss(doc)}</style>
<style>${sectionsCss(sections)}</style>
<style>${elementsCss(doc)}</style>
<style>
@page { size: ${first.width}mm ${first.height}mm; margin: 0; }
${pageRules}
html, body { margin: 0; padding: 0; background: white; }
.pd-doc {
${declarations(baseTypography(doc.page))}
  --pd-content-height: ${first.contentHeight};
}
.pd-page { break-after: page; }
.pd-page:last-child { break-after: auto; }
</style>
</head>
<body><div class="pd-doc pd-print">${renderPagesHtml(doc, layout)}</div></body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  iframe.onload = async () => {
    const win = iframe.contentWindow!;
    await Promise.all([...win.document.images].map((img) => img.decode().catch(() => {})));
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 1000);
  };
  iframe.srcdoc = html;
}
