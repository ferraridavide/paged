import { useRef } from "react";
import { useEditor } from "../model/store";
import { sampleDocument } from "../model/sample";
import type { DocumentModel } from "../model/types";

export type ViewMode = "edit" | "preview";

export function TopBar({ mode, setMode }: { mode: ViewMode; setMode: (m: ViewMode) => void }) {
  const { state, dispatch } = useEditor();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state.doc, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${state.doc.title || "document"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const doc = JSON.parse(await file.text()) as DocumentModel;
      if (doc.version !== 1 || !Array.isArray(doc.elements)) throw new Error("Not a paged-editor document");
      dispatch({ type: "load", doc });
    } catch (err) {
      alert(`Could not import: ${(err as Error).message}`);
    }
  };

  const newDocument = () => {
    const doc = sampleDocument();
    dispatch({ type: "load", doc: { ...doc, title: "Untitled", elements: [] } });
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">¶</span> Paged Editor
      </div>

      <div className="topbar-group">
        <button className="btn btn-ghost" title="Undo (⌘Z)" disabled={!state.past.length} onClick={() => dispatch({ type: "undo" })}>
          ↶
        </button>
        <button
          className="btn btn-ghost"
          title="Redo (⇧⌘Z)"
          disabled={!state.future.length}
          onClick={() => dispatch({ type: "redo" })}
        >
          ↷
        </button>
      </div>

      <div className="mode-toggle" role="tablist">
        <button role="tab" aria-selected={mode === "edit"} className={mode === "edit" ? "is-on" : ""} onClick={() => setMode("edit")}>
          Edit
        </button>
        <button
          role="tab"
          aria-selected={mode === "preview"}
          className={mode === "preview" ? "is-on" : ""}
          onClick={() => setMode("preview")}
        >
          Preview
        </button>
      </div>

      <div className="topbar-group topbar-right">
        <button className="btn" onClick={newDocument}>
          New
        </button>
        <button className="btn" onClick={() => dispatch({ type: "load", doc: sampleDocument() })}>
          Sample
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <button className="btn" onClick={exportJson}>
          Export JSON
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
      </div>
    </header>
  );
}
