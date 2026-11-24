import { Component, createContext, memo, useCallback, useContext, type ReactNode } from "react";
import { getCompileStatus, getDefinition, useRegistryVersion } from "../elements/registry";
import type { FragmentInfo, PageInfo, RootAttributes } from "../elements/types";
import { reportRuntimeError } from "../custom/logs";
import type { ElementNode, Mode } from "../model/types";

interface Props {
  node: ElementNode;
  mode: Mode;
  fragment?: FragmentInfo;
  page?: PageInfo;
  selected?: boolean;
  /** Stable callback shared by all elements, so memoisation holds. */
  onUpdate?: (id: string, patch: Record<string, unknown>) => void;
}

const noop = () => {};

/** Provided by the pages in Edit mode: start a paragraph after an element. */
export const InsertTextAfterContext = createContext<((id: string) => void) | null>(null);

/** Looks up a node's element definition and renders its component in the given mode. */
export const ElementView = memo(function ElementView({ node, mode, fragment, page, selected, onUpdate }: Props) {
  useRegistryVersion(); // re-render when a custom component (re)compiles
  const update = useCallback((patch: Record<string, unknown>) => onUpdate?.(node.id, patch), [node.id, onUpdate]);
  const insertAfter = useContext(InsertTextAfterContext);
  const insertTextAfter = useCallback(() => insertAfter?.(node.id), [insertAfter, node.id]);
  const def = getDefinition(node.type);

  let className = `hd-el hd-${node.type.replace(":", "-")}`;
  if (fragment?.continued) className += " hd-frag-continued";
  if (fragment?.continues) className += " hd-frag-continues";
  const root: RootAttributes = { "data-node-id": node.id, className };

  // Same placeholder box in both modes, so edit and print still paginate alike.
  if (!def) {
    const status = getCompileStatus(node.type);
    const message =
      status?.state === "error"
        ? `Component failed to compile: ${status.problems[0]?.message ?? "unknown error"}`
        : status
          ? "Loading component…"
          : `Unknown element type “${node.type}”`;
    return (
      <div {...root} className={`${className} hd-placeholder${status?.state === "error" ? " is-error" : ""}`}>
        {message}
      </div>
    );
  }

  const { Component: Element } = def;
  return (
    <ElementErrorBoundary
      root={root}
      label={def.label}
      resetKeys={[def, node]}
      componentId={node.type.startsWith("custom:") ? node.type.slice("custom:".length) : undefined}
    >
      <Element
        node={node}
        mode={mode}
        root={root}
        update={onUpdate ? update : noop}
        insertTextAfter={mode === "edit" && insertAfter ? insertTextAfter : undefined}
        fragment={fragment}
        page={page}
        selected={selected}
      />
    </ElementErrorBoundary>
  );
});

/** One broken element (usually a custom component) shows an error box instead of crashing the editor. */
class ElementErrorBoundary extends Component<
  { root: RootAttributes; label: string; resetKeys: unknown[]; componentId?: string; children: ReactNode },
  { error: Error | null; resetKeys: unknown[] }
> {
  state = { error: null as Error | null, resetKeys: this.props.resetKeys };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: { resetKeys: unknown[] },
    state: { error: Error | null; resetKeys: unknown[] },
  ) {
    // A recompiled component, or changed props, get a fresh chance.
    const changed = props.resetKeys.some((k, i) => k !== state.resetKeys[i]);
    return changed ? { error: null, resetKeys: props.resetKeys } : null;
  }

  componentDidCatch(error: Error) {
    // Shown in the component studio's Problems and Console panes.
    if (this.props.componentId) reportRuntimeError(this.props.componentId, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { root, label } = this.props;
    return (
      <div {...root} className={`${root.className} hd-placeholder is-error`}>
        {label} failed to render: {this.state.error.message}
      </div>
    );
  }
}
