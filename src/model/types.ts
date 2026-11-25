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
  /**
   * State a component manages itself (e.g. a 3D camera), persisted with the
   * document but not shown in the sidebar. Written via useElementState().
   */
  state?: Record<string, unknown>;
  /** CSS class names, added in the inspector and styled from Document CSS. */
  classes?: string[];
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

/** A file inside a custom component: source text, or a binary asset as a data URL. */
export type ComponentFile =
  | { kind: "text"; content: string }
  | { kind: "asset"; mime: string; data: string };

/**
 * A custom React component that travels with the document: a small project
 * of files (code, CSS, JSON, assets) compiled in the browser. Instances are
 * elements of type `custom:<id>`.
 */
export interface ComponentSource {
  id: string;
  name: string;
  /** Path of the module whose default export is `defineElement({...})`. */
  entry: string;
  /** Path (e.g. "lib/format.ts", "assets/logo.svg") → file. */
  files: Record<string, ComponentFile>;
  /**
   * npm packages this component may import, pinned deliberately to exact
   * versions (name → version) and loaded from esm.sh. Imports of packages
   * not listed here are errors: nothing is resolved automatically.
   */
  dependencies: Record<string, string>;
}

export interface DocumentModel {
  version: 1;
  title: string;
  page: PageSettings;
  elements: ElementNode[];
  /** Free-form CSS appended after everything else, for document-wide rules. */
  customCss: string;
  /** Custom components, embedded so the document is portable. */
  components: ComponentSource[];
}

export const customType = (componentId: string) => `custom:${componentId}`;
