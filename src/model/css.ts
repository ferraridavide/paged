import type { DocumentModel, PageSettings, StyleMap } from "./types";

/** Page sizes in millimetres (portrait). */
export const PAGE_SIZES: Record<PageSettings["size"], { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

export function pageDimensions(page: PageSettings) {
  const { width, height } = PAGE_SIZES[page.size];
  return page.orientation === "portrait" ? { width, height } : { width: height, height: width };
}

/** Strips characters that would let a value escape its declaration block. */
function cleanValue(value: string) {
  return value.replace(/[{}<>;]/g, "").trim();
}

function cleanProperty(prop: string) {
  return prop.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export function declarations(style: StyleMap, indent = "  ") {
  return Object.entries(style)
    .map(([prop, value]) => [cleanProperty(prop), cleanValue(value)] as const)
    .filter(([prop, value]) => prop && value)
    .map(([prop, value]) => `${indent}${prop}: ${value};`)
    .join("\n");
}

/** Serialises a style map as editable CSS text ("prop: value;" per line). */
export function styleToText(style: StyleMap) {
  return declarations(style, "");
}

/** Parses "prop: value;" text back into a style map. Unparseable chunks are skipped. */
export function textToStyle(text: string): StyleMap {
  const style: StyleMap = {};
  for (const chunk of text.split(/[;\n]/)) {
    const i = chunk.indexOf(":");
    if (i < 1) continue;
    const prop = cleanProperty(chunk.slice(0, i));
    const value = cleanValue(chunk.slice(i + 1));
    if (prop && value) style[prop] = value;
  }
  return style;
}

/**
 * Per-element CSS. Styles are emitted as real rules (not inline styles) because
 * Paged.js only honours paged-media properties such as `break-before` or
 * `position: running()` when they come from a stylesheet.
 */
export function elementsCss(doc: DocumentModel) {
  const rules = doc.elements
    .filter((n) => Object.keys(n.style).length > 0)
    .map((n) => `[data-node-id="${n.id}"] {\n${declarations(n.style)}\n}`)
    .join("\n");
  // Same @scope as the document CSS: scoped rules outrank unscoped ones of
  // equal specificity, so without it any document-wide rule would beat a
  // style set on one element. With both scoped, the later one (this) wins.
  return rules ? `@scope (.pd-doc) {\n${rules}\n}` : "";
}

/** Typography shared by the edit sheet and the printed body. */
export function baseTypography(page: PageSettings): StyleMap {
  return {
    "font-family": page.fontFamily,
    "font-size": page.fontSize,
    "line-height": page.lineHeight,
    color: page.color,
  };
}

/**
 * The user's document-wide CSS, scoped to the document so it can't restyle
 * the editor around it. It is emitted before per-element styles, so a style
 * set on one element wins over a document-wide rule.
 */
export function scopedCustomCss(doc: DocumentModel) {
  const css = doc.customCss.replace(/<\/style/gi, "");
  return css.trim() ? `@scope (.pd-doc) {\n${css}\n}` : "";
}

/** kebab-case → camelCase, for the few places that need React style objects. */
export function toReactStyle(style: StyleMap): React.CSSProperties {
  const out: Record<string, string> = {};
  for (const [prop, value] of Object.entries(style)) {
    if (!value) continue;
    const key = prop.startsWith("--")
      ? prop
      : prop.replace(/^-(webkit|moz|ms)-/, (_, v: string) => v[0].toUpperCase() + v.slice(1) + "-")
          .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[key] = value;
  }
  return out as React.CSSProperties;
}

/** A valid CSS class name (an identifier: no spaces, can't start with a digit). */
export const CLASS_NAME = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;

/**
 * Class names known to the document, most used first: those on elements and
 * those in Document CSS selectors (declaration blocks are ignored, so values
 * like `url(a.png)` don't count).
 */
export function knownClasses(doc: DocumentModel): { name: string; uses: number; inCss: boolean }[] {
  const uses = new Map<string, number>();
  for (const n of doc.elements) for (const c of n.classes ?? []) uses.set(c, (uses.get(c) ?? 0) + 1);
  const selectors = doc.customCss.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{[^{}]*\}/g, " ");
  const inCss = new Set([...selectors.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)].map((m) => m[1]));
  for (const c of inCss) if (!uses.has(c)) uses.set(c, 0);
  return [...uses.entries()]
    .map(([name, count]) => ({ name, uses: count, inCss: inCss.has(name) }))
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
}
