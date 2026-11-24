/**
 * The internal document representation.
 *
 * A document is a flat list of element nodes plus page settings. Each node
 * names an element type from the registry (src/elements/registry.ts), carries
 * that type's parameters in `props`, and its own CSS in `style`.
 */

export type Mode = "edit" | "print";

/** CSS declarations keyed by kebab-case property name, e.g. { "font-size": "14pt" }. */
export type StyleMap = Record<string, string>;

export interface ElementNode<P = Record<string, unknown>> {
  id: string;
  type: string;
  props: P;
  style: StyleMap;
}

export type PageSize = "A4" | "A5" | "Letter" | "Legal";
export type Orientation = "portrait" | "landscape";

export interface PageSettings {
  size: PageSize;
  orientation: Orientation;
  margin: { top: string; right: string; bottom: string; left: string };
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  color: string;
}

export interface DocumentModel {
  version: 1;
  title: string;
  page: PageSettings;
  elements: ElementNode[];
  /** Free-form CSS appended after everything else, for document-wide rules. */
  customCss: string;
}
