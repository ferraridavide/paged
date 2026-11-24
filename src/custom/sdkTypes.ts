/**
 * Type declarations for "@paged/sdk", given to Monaco for autocompletion in
 * the component editor. Keep in sync with src/custom/sdk.tsx.
 */
export const SDK_TYPES = `
declare module "@paged/sdk" {
  export type FieldKind = "text" | "textarea" | "number" | "select" | "boolean" | "color" | "image" | "lines";

  export interface FieldSpec {
    kind: FieldKind;
    /** Shown in the sidebar. Defaults to the field name. */
    label?: string;
    help?: string;
    /** Value for newly inserted elements. */
    default?: unknown;
    /** For "select": values, or { value, label } pairs. */
    options?: (string | { value: string; label: string })[];
    min?: number;
    max?: number;
    placeholder?: string;
  }

  export interface RenderProps<P> {
    /** The element's parameters, edited in the sidebar or in place. */
    props: P;
    /** "edit" on the canvas, "print" in Preview and print. */
    mode: "edit" | "print";
  }

  export interface ElementSpec<P = Record<string, any>> {
    /** Name in the palette and sidebar. */
    label: string;
    /** One character for the palette. */
    icon?: string;
    /** Parameters, shown in the sidebar's Content tab. */
    fields?: Record<string, FieldSpec>;
    /** CSS for the component, applied in every mode. */
    css?: string;
    /** Keep on the same page as the next element. */
    keepWithNext?: boolean;
    render: (args: RenderProps<P>) => any;
  }

  /** Declares a custom element. Use it as the module's default export. */
  export function defineElement<P = Record<string, any>>(spec: ElementSpec<P>): ElementSpec<P>;

  /** Text bound to one of the element's props: plain in print, editable in place in Edit mode. */
  export function Editable(props: {
    as?: string;
    field: string;
    multiline?: boolean;
    placeholder?: string;
    className?: string;
    style?: Record<string, string | number>;
  }): any;

  /**
   * State the component manages itself, saved with the element in the document
   * (not shown in the sidebar). Setting it is undoable. Read-only in print.
   */
  export function useElementState<T>(key: string, initial: T): [T, (value: T) => void];

  /** The element being rendered, and update(patch) to change its props. */
  export function useElement(): {
    node: { id: string; type: string; props: Record<string, any> };
    mode: "edit" | "print";
    update(patch: Record<string, unknown>): void;
  };
}
`;
