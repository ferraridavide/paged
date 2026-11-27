/**
 * The SDK custom components import as "@paged/sdk". It is the editor's own
 * module, re-exported through public/runtime/sdk.js, so components share the
 * editor's React and contexts.
 */
import { createContext, createElement, useContext, useMemo, type ComponentType, type HTMLAttributes } from "react";
import { EditableText } from "../elements/EditableText";
import type { PageInfo } from "../elements/types";
import { LayoutContext, plainText, type OutlineEntry } from "../layout/pageInfo";
import type { ElementNode, Mode, PageSettings } from "../model/types";
import { DocContext } from "../render/DocContext";

export type FieldKind = "text" | "textarea" | "number" | "select" | "boolean" | "color" | "image" | "lines";

export interface FieldSpec {
  kind: FieldKind;
  label?: string;
  help?: string;
  default?: unknown;
  /** For "select": values, or { value, label } pairs. */
  options?: (string | { value: string; label: string })[];
  min?: number;
  max?: number;
  placeholder?: string;
}

export interface RenderProps<P> {
  props: P;
  mode: Mode;
}

export interface ElementSpec<P = Record<string, any>> {
  label: string;
  icon?: string;
  fields?: Record<string, FieldSpec>;
  /** CSS for the component, applied to the document in every mode. */
  css?: string;
  /** Keep on the same page as the next element. */
  keepWithNext?: boolean;
  render: ComponentType<RenderProps<P>>;
}

const BRAND = Symbol.for("paged-editor.element");

export function defineElement<P = Record<string, any>>(spec: ElementSpec<P>): ElementSpec<P> {
  return Object.assign(spec, { [BRAND]: true });
}

export function isElementSpec(value: unknown): value is ElementSpec {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[BRAND] === true;
}

interface ElementContextValue {
  node: ElementNode;
  mode: Mode;
  update: (patch: Record<string, unknown>) => void;
  /** The page being rendered; undefined while the paginator measures the element. */
  page?: PageInfo;
}

export const ElementContext = createContext<ElementContextValue | null>(null);

/** The element being rendered: its node, mode and an `update(patch)` for its props. */
export function useElement() {
  const ctx = useContext(ElementContext);
  if (!ctx) throw new Error("useElement() must be used inside a custom element's render");
  return ctx;
}

/**
 * The page this copy of the element is on: `{ number, total }`, plus the
 * section it belongs to and the chapter (top-level heading) it falls in.
 * Elements in a header or footer are drawn on every page, once per page.
 * Undefined while the paginator measures the element (keep its size the same
 * either way).
 */
export function usePageInfo() {
  return useElement().page;
}

/** An element as other elements see it: read-only. */
export interface DocumentElement {
  id: string;
  type: string;
  props: Readonly<Record<string, any>>;
  state: Readonly<Record<string, any>>;
  classes: readonly string[];
  zone?: "header" | "footer";
  /** Its text, for built-in text elements (heading, text, list, table). */
  text: string;
}

export interface DocumentView {
  title: string;
  page: PageSettings;
  /** Total pages, once laid out (0 before the first layout). */
  pages: number;
  /** Every heading with the page it starts on. */
  outline: OutlineEntry[];
  elements: readonly DocumentElement[];
  stats: { words: number; characters: number; elements: number; components: number };
  /** The first element with this class, or this id. */
  find(classOrId: string): DocumentElement | undefined;
}

const EMPTY: DocumentView = {
  title: "",
  page: {} as PageSettings,
  pages: 0,
  outline: [],
  elements: [],
  stats: { words: 0, characters: 0, elements: 0, components: 0 },
  find: () => undefined,
};

/**
 * The whole document, read-only: other elements (to link a chart to a table,
 * say), the outline with page numbers, and word counts. Elements using it
 * re-render when the document or its layout changes.
 */
export function useDocument(): DocumentView {
  const doc = useContext(DocContext);
  const layout = useContext(LayoutContext);
  return useMemo(() => {
    if (!doc) return EMPTY;
    const elements: DocumentElement[] = doc.elements.map((n) => ({
      id: n.id,
      type: n.type,
      props: n.props,
      state: n.state ?? {},
      classes: n.classes ?? [],
      zone: n.zone,
      text: plainText(n),
    }));
    const body = elements.filter((e) => !e.zone).map((e) => e.text).join(" ");
    const words = body.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
    return {
      title: doc.title,
      page: doc.page,
      pages: layout.pages,
      outline: layout.outline.length ? layout.outline : elements.filter((e) => e.type === "heading" && !e.zone).map((e) => ({ id: e.id, text: e.text, level: Number(e.props.level ?? 1) })),
      elements,
      stats: {
        words,
        characters: body.replace(/\s+/g, "").length,
        elements: elements.filter((e) => !e.zone).length,
        components: doc.components.length,
      },
      find: (key: string) => elements.find((e) => e.classes.includes(key)) ?? elements.find((e) => e.id === key),
    };
  }, [doc, layout]);
}

/**
 * State the component manages itself, persisted in the document with the
 * element (not shown in the sidebar): a camera position, a chosen tab, a
 * snapshot… Setting it is an undoable edit. Read-only in print.
 */
export function useElementState<T>(key: string, initial: T): [T, (value: T) => void] {
  const { node, update } = useElement();
  const value = (node.state?.[key] as T | undefined) ?? initial;
  return [value, (next: T) => update({ $state: { [key]: next } })];
}

type EditableProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** Tag to render, e.g. "h2", "p", "span". */
  as?: string;
  /** The text prop this edits. */
  field: string;
  multiline?: boolean;
  placeholder?: string;
};

/**
 * Text bound to one of the element's props: plain text in print, editable in
 * place in Edit mode. Both render the same box, as the paginator requires.
 */
export function Editable({ as = "span", field, multiline, placeholder, ...rest }: EditableProps) {
  const { node, mode, update } = useElement();
  const value = String(node.props[field] ?? "");
  if (mode === "print") return createElement(as, rest, value);
  return (
    <EditableText
      {...rest}
      as={as}
      value={value}
      multiline={multiline}
      placeholder={placeholder}
      caretKey={`${node.id}/${field}`}
      onChange={(v) => update({ [field]: v })}
    />
  );
}
