/**
 * Sections: runs of pages that share page settings, like Word's sections or
 * CSS named pages. Pages are produced by pagination, so settings can't hang
 * off a page number (the content on "page 3" changes with every edit).
 * Instead a page break can start a section, carrying overrides of the
 * document's page settings for every page until the next section break.
 */
import type { CSSProperties } from "react";
import { getDefinition } from "../elements/registry";
import { baseTypography, pageDimensions, toReactStyle } from "../model/css";
import type { DocumentModel, ElementNode, PageOverrides, PageSettings } from "../model/types";

export interface Section {
  index: number;
  /** Document defaults with this section's overrides applied. */
  settings: PageSettings;
  overrides: PageOverrides;
  /** Flow elements laid out in this section (its closing section break included). */
  nodes: ElementNode[];
  /** The page break that starts this section; null for the first section. */
  breakId: string | null;
}

/** The section overrides a node carries, if it's a page break that starts a section. */
export function sectionOverrides(node: ElementNode): PageOverrides | null {
  if (node.type !== "page-break") return null;
  const section = (node.props as { section?: PageOverrides | null }).section;
  return section && typeof section === "object" ? section : null;
}

export function resolvePage(base: PageSettings, overrides: PageOverrides = {}): PageSettings {
  return {
    header: true,
    footer: true,
    firstPageDifferent: false,
    background: "",
    classes: [],
    css: "",
    ...base,
    ...overrides,
    margin: { ...base.margin, ...overrides.margin },
  };
}

export function sectionsOf(doc: DocumentModel): Section[] {
  const sections: Section[] = [
    { index: 0, settings: resolvePage(doc.page), overrides: {}, nodes: [], breakId: null },
  ];
  for (const node of doc.elements) {
    if (getDefinition(node.type)?.region) continue;
    sections[sections.length - 1].nodes.push(node);
    const overrides = sectionOverrides(node);
    if (overrides) {
      sections.push({
        index: sections.length,
        // "No header/footer on the first page" means the document's first page;
        // a section only gets it when it turns it on itself.
        settings: resolvePage(doc.page, { firstPageDifferent: false, ...overrides }),
        overrides,
        nodes: [],
        breakId: node.id,
      });
    }
  }
  return sections;
}

/** A short description of what a section changes, for badges and labels. */
export function describeOverrides(o: PageOverrides): string {
  const parts: string[] = [];
  if (o.size || o.orientation) parts.push([o.size, o.orientation].filter(Boolean).join(" "));
  if (o.margin) parts.push("margins");
  if (o.header === false && o.footer === false) parts.push("no header/footer");
  else if (o.header === false) parts.push("no header");
  else if (o.footer === false) parts.push("no footer");
  if (o.firstPageDifferent) parts.push("different first page");
  if (o.background) parts.push("background");
  if (o.fontFamily || o.fontSize || o.lineHeight || o.color) parts.push("typography");
  if (o.classes?.length) parts.push(o.classes.map((c) => "." + c).join(" "));
  if (o.css?.trim()) parts.push("CSS");
  return parts.join(" · ") || "same as document";
}

/** Page box size in mm, and a key for print's named @page rules. */
export function sectionBox(section: Section) {
  const { width, height } = pageDimensions(section.settings);
  const m = section.settings.margin;
  return {
    width,
    height,
    margin: m,
    contentWidth: `calc(${width}mm - ${m.left} - ${m.right})`,
    contentHeight: `calc(${height}mm - ${m.top} - ${m.bottom})`,
    sizeKey: `${width}x${height}`.replace(/\./g, "_"),
  };
}

/**
 * Attributes shared by a section's pages and its hidden measure flow, so both
 * lay out identically: section scope, classes, typography and content height.
 */
export function sectionAttrs(section: Section, baseClass: string) {
  const box = sectionBox(section);
  const style: CSSProperties = {
    ...toReactStyle(baseTypography(section.settings)),
    ["--pd-content-height" as string]: box.contentHeight,
  };
  return {
    className: [baseClass, ...(section.settings.classes ?? [])].join(" "),
    "data-section": section.index,
    style,
  };
}

/** Each section's own CSS, scoped to its pages (and its measure flow). */
export function sectionsCss(sections: Section[]) {
  return sections
    .filter((s) => s.settings.css?.trim())
    .map((s) => `@scope ([data-section="${s.index}"]) {\n${s.settings.css!.replace(/<\/style/gi, "")}\n}`)
    .join("\n");
}
