/**
 * What elements can know about the page they're on and the document around
 * them, derived from the layout: used by usePageInfo() and useDocument() in
 * the SDK, and by built-in elements through their `page` prop.
 */
import { createContext } from "react";
import type { PageInfo } from "../elements/types";
import type { DocumentModel, ElementNode } from "../model/types";
import type { PageLayout } from "./paginate";

/** A heading in the document, with the page it starts on (once laid out). */
export interface OutlineEntry {
  id: string;
  text: string;
  level: number;
  /** 1-based page number; undefined before the first layout. */
  page?: number;
}

/** The current layout, for components that read the whole document. */
export interface LayoutInfo {
  pages: number;
  outline: OutlineEntry[];
}

export const LayoutContext = createContext<LayoutInfo>({ pages: 0, outline: [] });

/** Headings at this level or above count as chapters (thumb tabs, running heads). */
export const CHAPTER_LEVEL = 1;

/** Plain text of a built-in element, for outlines and word counts. */
export function plainText(node: ElementNode): string {
  const p = node.props as Record<string, unknown>;
  if (Array.isArray(p.runs)) return (p.runs as { text?: string }[]).map((r) => r.text ?? "").join("");
  if (typeof p.text === "string") return p.text;
  if (Array.isArray(p.items)) return (p.items as unknown[]).filter((i) => typeof i === "string").join("\n");
  if (Array.isArray(p.rows)) return (p.rows as unknown[][]).map((r) => r.join(" ")).join("\n");
  return "";
}

/** The page each element starts on (1-based). */
function firstPages(layout: PageLayout[]) {
  const pageOf = new Map<string, number>();
  layout.forEach((page, i) => {
    for (const f of page.fragments) if (!f.continued && !pageOf.has(f.nodeId)) pageOf.set(f.nodeId, i + 1);
  });
  return pageOf;
}

export function buildOutline(doc: DocumentModel, layout: PageLayout[]): OutlineEntry[] {
  const pageOf = firstPages(layout);
  return doc.elements
    .filter((n) => n.type === "heading" && !n.zone)
    .map((n) => ({ id: n.id, text: plainText(n), level: Number((n.props as { level?: number }).level ?? 1), page: pageOf.get(n.id) }));
}

/**
 * One PageInfo per page. Objects are reused from `prev` when nothing about
 * them changed, so memoised elements don't re-render on every keystroke.
 */
export function buildPageInfos(layout: PageLayout[], outline: OutlineEntry[], prev: PageInfo[] = []): PageInfo[] {
  const total = layout.length;
  const chapters = outline.filter((h) => h.level <= CHAPTER_LEVEL && h.page !== undefined);
  const sectionPages = new Map<number, number>();
  for (const p of layout) sectionPages.set(p.section, (sectionPages.get(p.section) ?? 0) + 1);

  const seen = new Map<number, number>();
  return layout.map((page, i) => {
    const number = i + 1;
    const inSection = (seen.get(page.section) ?? 0) + 1;
    seen.set(page.section, inSection);
    // The latest chapter that starts on or before this page.
    let chapterIndex = -1;
    chapters.forEach((h, k) => {
      if (h.page! <= number) chapterIndex = k;
    });
    const chapter = chapters[chapterIndex];
    const info: PageInfo = {
      number,
      total,
      section: { index: page.section, page: inSection, pages: sectionPages.get(page.section) ?? 1 },
      chapter: chapter ? { id: chapter.id, title: chapter.text, number: chapterIndex + 1 } : undefined,
      chapters: chapters.length,
    };
    const old = prev[i];
    return old && JSON.stringify(old) === JSON.stringify(info) ? old : info;
  });
}
