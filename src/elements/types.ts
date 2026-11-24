import type { ComponentType } from "react";
import type { ElementNode, Mode, StyleMap } from "../model/types";

/**
 * Attributes every element component must spread on its root DOM element.
 * `data-node-id` is what per-element CSS rules, selection and the paginator use.
 */
export interface RootAttributes {
  "data-node-id": string;
  className: string;
}

/**
 * The slice of an element shown on one page. Units depend on the element's
 * `split` kind: characters for "lines", item indexes for "items", row indexes
 * (into props.rows) for "rows". `from`/`to` are undefined when the element is
 * not split.
 */
export interface FragmentInfo {
  from?: number;
  to?: number;
  /** This fragment continues an element that started on an earlier page. */
  continued: boolean;
  /** The element carries on onto the next page. */
  continues: boolean;
}

export interface PageInfo {
  number: number;
  total: number;
}

/**
 * The contract every element component implements.
 *
 * - `mode: "edit"` may be interactive (contentEditable text, inline add/remove).
 *   Call `update` to change props.
 * - `mode: "print"` renders plain, static markup.
 *
 * Both modes MUST produce the same box sizes: the paginator measures the print
 * rendering and the editor shows the edit rendering on the same pages. Editor
 * chrome (badges, placeholders) has to be absolutely positioned or fit inside
 * the same box.
 */
export interface ElementComponentProps<P> {
  node: ElementNode<P>;
  mode: Mode;
  root: RootAttributes;
  update: (patch: Partial<P>) => void;
  /** For splittable elements: which part of the element this page shows. */
  fragment?: FragmentInfo;
  /** For page regions (header/footer): the page being rendered. */
  page?: PageInfo;
  selected?: boolean;
}

type FieldBase<P> = { key: keyof P & string; label: string; help?: string };

/** Parameters shown in the inspector's Content tab. */
export type FieldDef<P> =
  | (FieldBase<P> & { kind: "text" | "textarea" | "color" | "image" | "lines" | "table"; placeholder?: string })
  | (FieldBase<P> & { kind: "number"; min?: number; max?: number; step?: number })
  | (FieldBase<P> & { kind: "select"; options: { value: string; label: string }[] })
  | (FieldBase<P> & { kind: "boolean" });

export type ElementGroup = "Text" | "Data" | "Media" | "Layout" | "Page";

/**
 * How the paginator may split an element across pages:
 * - "lines": by line of text, in `props.text` (single text node in print mode)
 * - "items": by `<li>` child, in `props.items`
 * - "rows": by body row, in `props.rows`; the header row repeats on each page
 */
export type SplitKind = "lines" | "items" | "rows";

export interface ElementDefinition<P = any> {
  type: string;
  label: string;
  icon: string;
  group: ElementGroup;
  /** Props (and optional starting style) for a freshly inserted element. */
  create: () => { props: P; style?: StyleMap };
  fields: FieldDef<P>[];
  Component: ComponentType<ElementComponentProps<P>>;
  /** Short text for the outline panel. */
  summary?: (props: P) => string;
  split?: SplitKind;
  /** Keep on the same page as the next element (headings). */
  keepWithNext?: boolean;
  /** Not part of the flow: drawn in the page margins of every page. */
  region?: "header" | "footer";
}
