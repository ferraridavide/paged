/**
 * Sections: runs of pages that share page settings, like Word's sections or
 * CSS named pages. Pages are produced by pagination, so settings can't hang
 * off a page number (the content on "page 3" changes with every edit).
 * Instead a page break can start a section, carrying overrides of the
 * document's page settings for every page until the next section break.
 */
import type { CSSProperties } from "react";
import { baseTypography, pageDimensions, toReactStyle } from "../model/css";
import type { DocumentModel, ElementNode, PageOverrides, PageSettings, Zone } from "../model/types";

export const ZONES: Zone[] = ["header", "footer"];

export interface Section {
  index: number;
  /** Document defaults with this section's overrides applied. */
  settings: PageSettings;
  overrides: PageOverrides;
  /** Flow elements laid out in this section (its closing section break included). */
  nodes: ElementNode[];
  /** The page break that starts this section; null for the first section. */
  breakId: string | null;
  /** Where this section starts in doc.elements (right after its section break). */
  start: number;
  /** The header and footer elements this section has itself. */
  own: Record<Zone, ElementNode[]>;
  /**
   * What its pages show in each zone: its own elements, or, when it has none,
   * those of the closest section before it that has some (like Word's "link
   * to previous"). `from` is the index of the section they belong to.
   */
  zones: Record<Zone, { nodes: ElementNode[]; from: number }>;
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
  const make = (index: number, settings: PageSettings, overrides: PageOverrides, breakId: string | null, start: number): Section => ({
    index,
    settings,
    overrides,
    nodes: [],
    breakId,
    start,
    own: { header: [], footer: [] },
    zones: { header: { nodes: [], from: index }, footer: { nodes: [], from: index } },
  });
  const sections: Section[] = [make(0, resolvePage(doc.page), {}, null, 0)];
  doc.elements.forEach((node, i) => {
    const current = sections[sections.length - 1];
    if (node.zone) {
      current.own[node.zone].push(node);
      return;
    }
    current.nodes.push(node);
    const overrides = sectionOverrides(node);
    if (overrides) {
      // "No header/footer on the first page" means the document's first page;
      // a section only gets it when it turns it on itself.
      sections.push(make(sections.length, resolvePage(doc.page, { firstPageDifferent: false, ...overrides }), overrides, node.id, i + 1));
    }
  });
  for (const zone of ZONES) {
    let inherited = { nodes: [] as ElementNode[], from: 0 };
    for (const s of sections) {
      if (s.own[zone].length) inherited = { nodes: s.own[zone], from: s.index };
      s.zones[zone] = inherited.nodes.length ? inherited : { nodes: [], from: s.index };
    }
  }
  return sections;
}

/** Where a new element for `section`'s own `zone` goes in doc.elements: after its last one, else at the section's start. */
export function zoneInsertIndex(doc: DocumentModel, section: Section, zone: Zone) {
  const last = section.own[zone].at(-1);
  if (last) return doc.elements.findIndex((n) => n.id === last.id) + 1;
  // Headers before footers, both before the section's first flow element.
  if (zone === "footer" && section.own.header.length) {
    return doc.elements.findIndex((n) => n.id === section.own.header.at(-1)!.id) + 1;
  }
  return section.start;
}

/** The section that contains doc.elements[index]. */
export function sectionAt(sections: Section[], index: number) {
  let found = sections[0];
  for (const s of sections) if (s.start <= index) found = s;
  return found;
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
