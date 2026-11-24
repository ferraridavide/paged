import { useCallback, useRef, useState } from "react";
import { useEditor } from "../model/store";
import { PagedDocument, type LayoutStats } from "../render/PagedDocument";
import { printPages } from "../render/print";
import type { ViewMode } from "./TopBar";

/**
 * The centre of the editor. Edit and Preview render the same pages from the
 * same layout; Preview simply drops the editing chrome.
 */
export function Workspace({ mode }: { mode: ViewMode }) {
  const { state, dispatch } = useEditor();
  const pagesRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<LayoutStats | null>(null);
  const onLayout = useCallback(
    (s: LayoutStats) => setStats((prev) => (prev?.layout === s.layout && prev.ms === s.ms ? prev : s)),
    [],
  );

  const deselect = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (mode === "edit" && t.matches(".canvas, .pd-pages, .pd-page, .pd-content, .pd-margin")) {
      dispatch({ type: "select", id: null });
    }
  };

  return (
    <div className="workspace-inner">
      <div className="workspace-bar">
        <span>{stats ? `${stats.pages} page${stats.pages === 1 ? "" : "s"}` : "…"}</span>
        {stats && <span className="muted" title="Time spent paginating after the last change">layout {stats.ms.toFixed(1)} ms</span>}
        <span className="workspace-hint">
          {mode === "edit" ? "Type directly on the pages" : "Click any element to select it"}
        </span>
        <button
          className="btn btn-primary"
          disabled={!stats}
          onClick={() => stats && printPages(state.doc, stats.layout)}
        >
          Print / Save as PDF
        </button>
      </div>
      <div className="canvas" onMouseDown={deselect}>
        <PagedDocument mode={mode === "edit" ? "edit" : "print"} pagesRef={pagesRef} onLayout={onLayout} />
      </div>
    </div>
  );
}
