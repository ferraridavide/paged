import { useRef } from "react";
import { useEditor } from "../model/store";
import { packDocument, readDocumentFile } from "../model/pdoc";
import { sampleDocument } from "../model/sample";

export type ViewMode = "edit" | "preview";

export function TopBar({ mode, setMode, inStudio }: { mode: ViewMode; setMode: (m: ViewMode) => void; inStudio?: boolean }) {
  const { state, dispatch } = useEditor();
  const fileRef = useRef<HTMLInputElement>(null);

  /** Saves the document as a .pdoc: a zip with document.json, component sources and media. */
  const save = () => {
    const bytes = packDocument(state.doc);
    const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${state.doc.title || "document"}.pdoc`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const open = async (file: File | undefined) => {
    if (!file) return;
    try {
      dispatch({ type: "load", doc: await readDocumentFile(file) });
    } catch (err) {
      alert(`Could not open: ${(err as Error).message}`);
    }
  };

  const newDocument = () => {
    const doc = sampleDocument();
    dispatch({ type: "load", doc: { ...doc, title: "Untitled", elements: [], components: [] } });
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

      {inStudio ? (
        <div className="topbar-title">Component studio</div>
      ) : (
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
      )}

      <div className="topbar-group topbar-right">
        <button className="btn" onClick={newDocument}>
          New
        </button>
        <button className="btn" onClick={() => dispatch({ type: "load", doc: sampleDocument() })}>
          Sample
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Open…
        </button>
        <button className="btn" onClick={save} title="Save as .pdoc: a zip with the document, its components and media">
          Save .pdoc
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdoc,.json,application/zip,application/json"
          hidden
          onChange={(e) => {
            open(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </header>
  );
}
