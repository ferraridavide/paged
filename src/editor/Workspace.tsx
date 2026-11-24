import { useRef } from "react";
import { useEditor } from "../model/store";
import { PagedDocument } from "../render/PagedDocument";
import { useUi } from "./ui";

/** The pages. Edit and Preview render the same layout; Preview drops the editing chrome. */
export function Workspace() {
  const { dispatch } = useEditor();
  const ui = useUi();
  const pagesRef = useRef<HTMLDivElement>(null);
  const mode = ui.settings.mode === "edit" ? "edit" : "print";

  const deselect = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (mode === "edit" && t.matches(".canvas, .pd-pages, .pd-page, .pd-content, .pd-margin")) {
      dispatch({ type: "select", id: null });
    }
  };

  return (
    <div className="canvas" onMouseDown={deselect}>
      <PagedDocument mode={mode} pagesRef={pagesRef} onLayout={ui.setLayout} />
    </div>
  );
}
