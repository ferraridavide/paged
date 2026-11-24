import { Fragment, useRef } from "react";
import { ELEMENTS, GROUPS, getCompileStatus, getDefinition, useRegistryVersion } from "../elements/registry";
import { newId } from "../model/ids";
import { useEditor } from "../model/store";
import { customType } from "../model/types";
import { newComponent } from "../studio/files";
import { dropToAction, startDrag, useDropIndex } from "./dnd";

/** Left sidebar: the element palette, the document's custom components and the outline. */
export function LeftPanel({ onOpenComponent }: { onOpenComponent: (id: string) => void }) {
  const { state, dispatch } = useEditor();
  useRegistryVersion();
  const { doc, selectedId } = state;
  const outlineRef = useRef<HTMLOListElement>(null);
  const { dropIndex, handlers } = useDropIndex(outlineRef, ".outline-item", (payload, index) =>
    dispatch(dropToAction(payload, index)),
  );

  const insert = (elementType: string) => {
    const selectedIndex = doc.elements.findIndex((n) => n.id === selectedId);
    dispatch({ type: "insert", elementType, index: selectedIndex >= 0 ? selectedIndex + 1 : undefined });
  };

  return (
    <aside className="panel left-panel">
      <div className="panel-body">
        <h2 className="panel-heading">Add element</h2>
        {GROUPS.map((group) => (
          <div key={group} className="palette-group">
            <h3>{group}</h3>
            <div className="palette">
              {ELEMENTS.filter((d) => d.group === group).map((d) => (
                <button
                  key={d.type}
                  className="palette-item"
                  draggable
                  onDragStart={(e) => startDrag(e, { kind: "new", elementType: d.type })}
                  onClick={() => insert(d.type)}
                  title={`Insert ${d.label}${selectedId ? " after the selected element" : " at the end"}`}
                >
                  <span className="palette-icon">{d.icon}</span>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="palette-group">
          <h3>Custom · saved in this document</h3>
          <div className="custom-list">
            {doc.components.map((c) => {
              const type = customType(c.id);
              const def = getDefinition(type);
              const status = getCompileStatus(type);
              return (
                <div key={c.id} className="custom-item">
                  <button
                    className="palette-item"
                    draggable={!!def}
                    disabled={!def}
                    onDragStart={(e) => startDrag(e, { kind: "new", elementType: type })}
                    onClick={() => insert(type)}
                    title={def ? `Insert ${c.name}` : (status?.problems[0]?.message ?? "Compiling…")}
                  >
                    <span className={`palette-icon${status?.state === "error" ? " is-error" : ""}`}>
                      {status?.state === "error" ? "!" : (def?.icon ?? "…")}
                    </span>
                    {c.name}
                  </button>
                  <button className="btn btn-ghost custom-edit" title={`Open ${c.name} in the component studio`} onClick={() => onOpenComponent(c.id)}>
                    {"</>"}
                  </button>
                </div>
              );
            })}
            <button
              className="btn custom-new"
              onClick={() => {
                const id = newId().replace("el_", "c_");
                dispatch({ type: "addComponent", component: newComponent(id, `Component ${doc.components.length + 1}`) });
                onOpenComponent(id);
              }}
            >
              + New component
            </button>
          </div>
        </div>

        <h2 className="panel-heading">Outline</h2>
        <ol ref={outlineRef} className="outline" {...handlers}>
          {doc.elements.map((node, i) => {
            const def = getDefinition(node.type);
            const summary = def?.summary?.(node.props as never) ?? "";
            return (
              <Fragment key={node.id}>
                {dropIndex === i && <li className="outline-drop" aria-hidden />}
                <li
                  className={`outline-item${node.id === selectedId ? " is-selected" : ""}`}
                  draggable
                  onDragStart={(e) => startDrag(e, { kind: "move", id: node.id })}
                  onClick={() => dispatch({ type: "select", id: node.id })}
                >
                  <span className="palette-icon">{def?.icon ?? "?"}</span>
                  <span className="outline-text">
                    <span>{def?.label ?? node.type}</span>
                    {summary && <span className="outline-summary">{summary}</span>}
                  </span>
                  {Object.keys(node.style).length > 0 && <span className="dot" title="Has custom styles" />}
                </li>
              </Fragment>
            );
          })}
          {dropIndex === doc.elements.length && <li className="outline-drop" aria-hidden />}
        </ol>
      </div>
    </aside>
  );
}
