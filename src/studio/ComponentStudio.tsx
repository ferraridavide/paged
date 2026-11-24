import { Puzzle } from "lucide-react";
import { useState } from "react";
import { getCompileStatus, useRegistryVersion, type Problem } from "../elements/registry";
import { newId } from "../model/ids";
import { useEditor } from "../model/store";
import { customType, type ComponentSource } from "../model/types";
import { CodePane, type Reveal } from "./CodePane";
import { Explorer } from "./Explorer";
import { CONFIG, newComponent } from "./files";
import { OutputPane } from "./OutputPane";
import { ControlsPane, PreviewPane, usePreviewProps } from "./PreviewPane";

/**
 * Full-view workspace for building one custom component, separate from using
 * it in the document: files, code, a live preview with controls, problems,
 * console and configuration.
 */
export function ComponentStudio({
  componentId,
  onOpen,
  onClose,
}: {
  componentId: string;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const { state, dispatch } = useEditor();
  const comp = state.doc.components.find((c) => c.id === componentId);

  if (!comp) {
    return (
      <div className="studio-missing">
        <p>This component no longer exists.</p>
        <button className="btn" onClick={onClose}>
          Back to the document
        </button>
      </div>
    );
  }

  const create = () => {
    const id = newId().replace("el_", "c_");
    dispatch({ type: "addComponent", component: newComponent(id, `Component ${state.doc.components.length + 1}`) });
    onOpen(id);
  };

  // Keyed by id: switching components resets the panes' state.
  return <Studio key={comp.id} comp={comp} components={state.doc.components} onOpen={onOpen} onClose={onClose} onCreate={create} />;
}

function Studio({
  comp,
  components,
  onOpen,
  onClose,
  onCreate,
}: {
  comp: ComponentSource;
  components: ComponentSource[];
  onOpen: (id: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const { state } = useEditor();
  useRegistryVersion();
  const [selected, setSelected] = useState(comp.files[comp.entry] ? comp.entry : CONFIG);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const preview = usePreviewProps(comp);
  const status = getCompileStatus(customType(comp.id));

  const openProblem = (p: Problem) => {
    if (!p.file) return;
    setSelected(p.file);
    if (p.line) setReveal({ file: p.file, line: p.line, column: p.column, nonce: Date.now() });
  };

  return (
    <div className="studio">
      <header className="studio-header">
        <Puzzle size={15} className="studio-header-icon" />
        <select
          className="input studio-switcher"
          value={comp.id}
          onChange={(e) => (e.target.value === "__new" ? onCreate() : onOpen(e.target.value))}
        >
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="__new">+ New component…</option>
        </select>
        <span className={`code-status is-${status?.state ?? "compiling"}`}>
          {status?.state === "ready" ? "Compiled" : status?.state === "error" ? "Failed" : "Compiling…"}
        </span>
        <span className="muted studio-header-hint">
          Changes apply to “{state.doc.title || "Untitled"}” as you type, and are saved with it.
        </span>
      </header>
      <Explorer comp={comp} selected={selected} onSelect={setSelected} />
      <div className="studio-center">
        <CodePane comp={comp} selected={selected} reveal={reveal} onBack={onClose} />
      </div>
      <PreviewPane comp={comp} doc={state.doc} preview={preview} />
      <OutputPane comp={comp} onOpenProblem={openProblem} />
      <ControlsPane preview={preview} />
    </div>
  );
}
