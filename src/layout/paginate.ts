/**
 * The paginator. Replaces Paged.js for our block model.
 *
 * Input: the document flow rendered once, unpaginated, in a hidden container
 * whose width equals the page content width (the "measure flow"). We read
 * every block's box, then walk the blocks filling pages of `pageHeight`.
 * Blocks that don't fit move to the next page, or are split by line, list
 * item or table row when their element type allows it.
 *
 * Because the browser lays out the measure flow incrementally, a keystroke
 * only re-lays out the edited block; this pass is just rect reads and
 * arithmetic, so it stays cheap as documents grow.
 */
import { getDefinition } from "../elements/registry";
import type { SplitKind } from "../elements/types";
import type { DocumentModel, ElementNode } from "../model/types";
import type { Section } from "./sections";

export interface Fragment {
  nodeId: string;
  from?: number;
  to?: number;
  continued: boolean;
  continues: boolean;
}

export interface PageLayout {
  /** Index into sectionsOf(doc): the page settings this page uses. */
  section: number;
  fragments: Fragment[];
  /**
   * Whether this page shows its section's header / footer zone (hidden by the
   * section's settings, or on a "different first page").
   */
  header: boolean;
  footer: boolean;
}

interface Split {
  /** End (exclusive) of the part that stays on this page, in the element's units. */
  to: number;
  /** Flow y where the next page starts (includes room for a repeated table header). */
  nextStart: number;
}

const EPSILON = 0.5;

/* ---------- Splitters: read the measure-flow DOM, return where to cut ---------- */

function splitItems(el: HTMLElement, from: number | undefined, limit: number, origin: number): Split | null {
  const items = el.querySelectorAll<HTMLElement>(":scope > li");
  const start = from ?? 0;
  let last = -1;
  for (let i = start; i < items.length; i++) {
    if (items[i].getBoundingClientRect().bottom - origin <= limit + EPSILON) last = i;
    else break;
  }
  if (last < start || last >= items.length - 1) return null;
  return { to: last + 1, nextStart: items[last + 1].getBoundingClientRect().top - origin };
}

function splitRows(
  el: HTMLElement,
  node: ElementNode,
  from: number | undefined,
  limit: number,
  origin: number,
): Split | null {
  if (!(el instanceof HTMLTableElement) || !el.tBodies[0]) return null;
  const rows = el.tBodies[0].rows;
  const offset = node.props.headerRow ? 1 : 0; // props.rows index of body row 0
  const headHeight = el.tHead?.getBoundingClientRect().height ?? 0;
  const start = (from ?? offset) - offset;
  let last = -1;
  for (let i = start; i < rows.length; i++) {
    if (rows[i].getBoundingClientRect().bottom - origin <= limit + EPSILON) last = i;
    else break;
  }
  if (last < start || last >= rows.length - 1) return null;
  const nextTop = rows[last + 1].getBoundingClientRect().top - origin;
  return { to: last + 1 + offset, nextStart: nextTop - (offset ? headHeight : 0) };
}

interface Line {
  top: number;
  bottom: number;
}

/** Groups a text range's client rects into visual lines (content areas). */
function lineBoxes(rects: DOMRectList, origin: number): Line[] {
  const sorted = [...rects].filter((r) => r.height > 0).sort((a, b) => a.top - b.top);
  const lines: Line[] = [];
  for (const r of sorted) {
    const cur = lines[lines.length - 1];
    if (cur && r.top - origin < cur.bottom - 1) cur.bottom = Math.max(cur.bottom, r.bottom - origin);
    else lines.push({ top: r.top - origin, bottom: r.bottom - origin });
  }
  return lines;
}

/**
 * Character offsets across all text nodes of an element: paragraphs are made
 * of inline runs (<span>s), so one paragraph can hold many text nodes.
 */
function textIndex(el: HTMLElement) {
  const nodes: { node: Text; start: number }[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let total = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    if (!t.data.length) continue;
    nodes.push({ node: t, start: total });
    total += t.data.length;
  }
  const locate = (offset: number) => {
    let lo = 0;
    let hi = nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (nodes[mid].start <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { node: nodes[lo].node, local: offset - nodes[lo].start };
  };
  return { total, locate };
}

function splitLines(
  el: HTMLElement,
  from: number | undefined,
  limit: number,
  origin: number,
  force: boolean,
): Split | null {
  const text = textIndex(el);
  if (!text.total) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  // Rects of every text and inline box; runs of different sizes on one line overlap vertically.
  const lines = lineBoxes(range.getClientRects(), origin);
  if (lines.length < 2) return null;

  // Line boxes are taller than the glyph rects (line-height): split the
  // leading between neighbours so boundaries sit midway.
  const box = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const contentTop = box.top - origin + parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
  const contentBottom = box.bottom - origin - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth);
  const boundary = (i: number) =>
    i === 0 ? contentTop : i >= lines.length ? contentBottom : (lines[i - 1].bottom + lines[i].top) / 2;

  // Vertical centre of the character at a paragraph offset. Centres (not
  // tops) stay on the right side of a line boundary even when a line mixes
  // font sizes, since glyphs of different sizes share a baseline.
  const charMiddle = (i: number) => {
    const { node, local } = text.locate(i);
    range.setStart(node, local);
    range.setEnd(node, Math.min(local + 1, node.data.length));
    const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
    return (r.top + r.bottom) / 2 - origin;
  };

  // Which line does this fragment start on?
  const startMiddle = from ? charMiddle(from) : (lines[0].top + lines[0].bottom) / 2;
  const startLine = lines.findIndex((l) => startMiddle < l.bottom + 0.5);
  if (startLine < 0) return null;

  // Last line that fits, keeping 2 lines together on each side when we can.
  let lastFit = -1;
  for (let i = startLine; i < lines.length; i++) {
    if (boundary(i + 1) <= limit + EPSILON) lastFit = i;
    else break;
  }
  const orphans = 2;
  const widows = 2;
  let cut = Math.min(lastFit, lines.length - 1 - widows);
  if (cut - startLine + 1 < orphans) cut = force ? lastFit : -1;
  if (cut < startLine || cut >= lines.length - 1) {
    if (!force || lastFit < startLine || lastFit >= lines.length - 1) return null;
    cut = lastFit;
  }

  // First character below the boundary between line `cut` and `cut + 1`.
  const split = boundary(cut + 1);
  let lo = from ?? 0;
  let hi = text.total - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (charMiddle(mid) >= split) hi = mid;
    else lo = mid + 1;
  }
  if (lo <= (from ?? 0)) return null;
  return { to: lo, nextStart: split };
}

function splitBlock(
  kind: SplitKind,
  el: HTMLElement,
  node: ElementNode,
  from: number | undefined,
  limit: number,
  origin: number,
  force: boolean,
) {
  switch (kind) {
    case "items":
      return splitItems(el, from, limit, origin);
    case "rows":
      return splitRows(el, node, from, limit, origin);
    case "lines":
      return splitLines(el, from, limit, origin, force);
  }
}

/* ---------- The page-filling pass ---------- */

/**
 * Lays out the whole document: each section separately, in its own measure
 * flow (its content width) and with its own page height. A section always
 * starts on a new page.
 */
export function paginate(
  doc: DocumentModel,
  sections: Section[],
  flows: ({ el: HTMLElement; pageHeight: number } | null)[],
): PageLayout[] {
  const pages: PageLayout[] = [];
  sections.forEach((section, i) => {
    const flow = flows[i];
    if (!flow) return;
    paginateNodes(doc, section.nodes, flow.el, flow.pageHeight).forEach((fragments, n) => {
      // Header/footer visibility per section, and "different first page".
      const bare = n === 0 && !!section.settings.firstPageDifferent;
      pages.push({
        section: i,
        fragments,
        header: !bare && section.settings.header !== false,
        footer: !bare && section.settings.footer !== false,
      });
    });
  });
  if (!pages.length) pages.push(emptyPage(sections[0]));
  return pages;
}

function paginateNodes(
  doc: DocumentModel,
  nodes: ElementNode[],
  flowEl: HTMLElement,
  pageHeight: number,
): Fragment[][] {
  const origin = flowEl.getBoundingClientRect().top;
  const boxes = new Map<string, HTMLElement>();
  for (const child of flowEl.children) {
    if (child instanceof HTMLElement && child.dataset.nodeId) boxes.set(child.dataset.nodeId, child);
  }

  const pages: Fragment[][] = [];
  let current: Fragment[] = [];
  let start = 0;
  const newPage = (nextStart: number) => {
    pages.push(current);
    current = [];
    start = nextStart;
  };
  const topOf = (id: string) => (boxes.get(id)?.getBoundingClientRect().top ?? origin) - origin;

  let breakAfterPrevious = false;
  for (const node of nodes) {
    // Unknown types (e.g. a custom component still compiling) still take space.
    const def = getDefinition(node.type);
    const el = boxes.get(node.id);
    if (!el) continue;

    const rect = el.getBoundingClientRect();
    const top = rect.top - origin;
    const bottom = rect.bottom - origin;

    if ((breakAfterPrevious || node.style["break-before"] === "page") && current.length) newPage(top);
    breakAfterPrevious = node.type === "page-break" || node.style["break-after"] === "page";
    if (!current.length) start = top;

    let from: number | undefined;
    for (let guard = 0; guard < 10_000; guard++) {
      const continued = from !== undefined;
      // A page break (or an empty element) stays at the end of the page it
      // follows, even when the previous block's margin pushes it past the
      // bottom: otherwise a break after a full page leaves an empty page.
      const trailing = (node.type === "page-break" || rect.height < EPSILON) && current.length > 0 && !continued;
      if (bottom - start <= pageHeight + EPSILON || trailing) {
        current.push({ nodeId: node.id, from, continued, continues: false });
        break;
      }

      const canSplit = def?.split && node.style["break-inside"] !== "avoid";
      const split = canSplit
        ? splitBlock(def!.split!, el, node, from, start + pageHeight, origin, current.length === 0)
        : null;
      if (split) {
        current.push({ nodeId: node.id, from, to: split.to, continued, continues: true });
        newPage(split.nextStart);
        from = split.to;
        continue;
      }

      if (!current.length) {
        // Taller than a page and unsplittable: let it overflow this page.
        current.push({ nodeId: node.id, from, continued, continues: false });
        break;
      }

      // Move to the next page, taking along the blocks before it that keep
      // with the next one (headings, or CSS break-after: avoid), as long as
      // something stays behind on this page.
      const carry: Fragment[] = [];
      while (current.length - carry.length > 1) {
        const prev = current[current.length - 1 - carry.length];
        const prevNode = doc.elements.find((n) => n.id === prev.nodeId);
        const keeps = getDefinition(prevNode?.type ?? "")?.keepWithNext || prevNode?.style["break-after"] === "avoid";
        if (prev.continued || prev.continues || !keeps) break;
        carry.unshift(prev);
      }
      current.splice(current.length - carry.length);
      newPage(carry.length ? topOf(carry[0].nodeId) : top);
      current.push(...carry);
    }
  }
  pages.push(current);
  return pages;
}

/** The single page of a document with nothing laid out yet. */
export function emptyPage(section?: Section): PageLayout {
  const settings = section?.settings;
  const bare = !!settings?.firstPageDifferent;
  return { section: 0, fragments: [], header: !bare && settings?.header !== false, footer: !bare && settings?.footer !== false };
}

/** Reuses unchanged fragment and page objects so memoised components skip re-rendering. */
export function reconcile(prev: PageLayout[], next: PageLayout[]): PageLayout[] {
  const key = (f: Fragment) => `${f.nodeId}|${f.from}|${f.to}|${f.continued}|${f.continues}`;
  const old = new Map<string, Fragment>();
  for (const p of prev) for (const f of p.fragments) old.set(key(f), f);
  let same = prev.length === next.length;
  const pages = next.map((page, i) => {
    const fragments = page.fragments.map((f) => old.get(key(f)) ?? f);
    const p = prev[i];
    if (
      p &&
      p.section === page.section &&
      p.header === page.header &&
      p.footer === page.footer &&
      p.fragments.length === fragments.length &&
      p.fragments.every((f, j) => f === fragments[j])
    ) {
      return p;
    }
    same = false;
    return { ...page, fragments };
  });
  return same ? prev : pages;
}
