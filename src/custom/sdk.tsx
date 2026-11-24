/**
 * The SDK custom components import as "@paged/sdk". It is the editor's own
 * module, re-exported through public/runtime/sdk.js, so components share the
 * editor's React and contexts.
 */
import { createContext, createElement, useContext, type ComponentType, type HTMLAttributes } from "react";
import { EditableText } from "../elements/EditableText";
import type { ElementNode, Mode } from "../model/types";

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
}

export const ElementContext = createContext<ElementContextValue | null>(null);

/** The element being rendered: its node, mode and an `update(patch)` for its props. */
export function useElement() {
  const ctx = useContext(ElementContext);
  if (!ctx) throw new Error("useElement() must be used inside a custom element's render");
  return ctx;
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
