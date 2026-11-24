import { memo, useCallback } from "react";
import { getDefinition } from "../elements/registry";
import type { FragmentInfo, PageInfo } from "../elements/types";
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

/** Looks up a node's element definition and renders its component in the given mode. */
export const ElementView = memo(function ElementView({ node, mode, fragment, page, selected, onUpdate }: Props) {
  const update = useCallback((patch: Record<string, unknown>) => onUpdate?.(node.id, patch), [node.id, onUpdate]);
  const def = getDefinition(node.type);
  if (!def) {
    return mode === "edit" ? <div className="ed-unknown">Unknown element type “{node.type}”</div> : null;
  }

  let className = `hd-el hd-${node.type}`;
  if (fragment?.continued) className += " hd-frag-continued";
  if (fragment?.continues) className += " hd-frag-continues";

  const { Component } = def;
  return (
    <Component
      node={node}
      mode={mode}
      root={{ "data-node-id": node.id, className }}
      update={onUpdate ? update : noop}
      fragment={fragment}
      page={page}
      selected={selected}
    />
  );
});
