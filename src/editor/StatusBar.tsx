import { Minus, Plus, Puzzle } from "lucide-react";
import { DriveStatus } from "../drive/DriveUi";
import { getCompileStatus, getDefinition, useRegistryVersion } from "../elements/registry";
import { useEditor, useSelectedNode } from "../model/store";
import { customType } from "../model/types";
import { sectionsOf } from "../layout/sections";
import { useMenu } from "../ui/Menu";
import { useUi, ZOOM_STEPS } from "./ui";

/** Bottom bar: pages, layout time, selection, component status and zoom. */
export function StatusBar() {
  const { state } = useEditor();
  const ui = useUi();
  const menu = useMenu();
  useRegistryVersion();
  const node = useSelectedNode();
  const sectionCount = sectionsOf(state.doc).length;
  const failing = state.doc.components.filter((c) => getCompileStatus(customType(c.id))?.state === "error");
  const zoom = Math.round(ui.settings.zoom * 100);

  return (
    <footer className="status-bar">
      <span>
        {ui.layout ? `${ui.layout.pages} page${ui.layout.pages === 1 ? "" : "s"}` : "Laying out…"}
        {sectionCount > 1 && <span className="status-dim"> · {sectionCount} sections</span>}
      </span>
      {ui.layout && <span className="status-dim" title="Time spent paginating after the last change">Layout {ui.layout.ms.toFixed(1)} ms</span>}
      <span className="status-dim">{node ? `${getDefinition(node.type)?.label ?? node.type} selected` : "No selection"}</span>
      {state.doc.components.length > 0 && (
        <button
          className={`status-button${failing.length ? " is-error" : ""}`}
          onClick={() => ui.openStudio((failing[0] ?? state.doc.components[0]).id)}
          title="Open the component studio"
        >
          <Puzzle size={12} />
          {state.doc.components.length} component{state.doc.components.length === 1 ? "" : "s"}
          {failing.length > 0 && ` · ${failing.length} failing`}
        </button>
      )}
      <span className="status-spacer" />
      <span className="status-dim status-about">
        <a href={import.meta.env.BASE_URL}>Paged Editor</a> ·{" "}
        <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener">
          Privacy
        </a>{" "}
        ·{" "}
        <a href={`${import.meta.env.BASE_URL}terms.html`} target="_blank" rel="noopener">
          Terms
        </a>
      </span>
      <DriveStatus />
      <span className="status-dim">{ui.settings.mode === "edit" ? "Editing" : "Preview"}</span>
      <div className="zoom-control">
        <button onClick={() => ui.zoomBy(-1)} disabled={ui.settings.zoom <= ZOOM_STEPS[0]} title="Zoom out">
          <Minus size={12} />
        </button>
        <button
          className="zoom-value"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            menu.open({
              x: r.left,
              y: r.top - 8 - ZOOM_STEPS.length * 28,
              items: ZOOM_STEPS.map((z) => ({
                label: `${Math.round(z * 100)}%`,
                checked: Math.abs(ui.settings.zoom - z) < 0.001,
                onSelect: () => ui.set({ zoom: z }),
              })),
            });
          }}
        >
          {zoom}%
        </button>
        <button onClick={() => ui.zoomBy(1)} disabled={ui.settings.zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} title="Zoom in">
          <Plus size={12} />
        </button>
      </div>
    </footer>
  );
}
