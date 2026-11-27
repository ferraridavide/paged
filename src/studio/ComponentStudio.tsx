import { Puzzle } from "lucide-react";
import { useRef, useState } from "react";
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

/** Smallest sizes (px) the panes may be dragged to. */
const MIN_PREVIEW_W = 260;
const MIN_CODE_W = 280;
const MIN_BOTTOM_H = 80;
const MIN_TOP_H = 120;

/**
 * A draggable border between studio panes. Double-click resets, arrow keys nudge.
 * `value` is the size (px) of the pane on the far side of the border; it is
 * null while at the CSS default.
 */
function Splitter({
  axis,
  label,
  value,
  measure,
  clamp,
  onChange,
}: {
  axis: "x" | "y";
  label: string;
  value: number | null;
  /** Current rendered size of the controlled pane, used when the drag starts. */
  measure: () => number;
  clamp: (size: number) => number;
  onChange: (size: number | null) => void;
}) {
  const sign = -1; // dragging towards the start of the axis grows the pane after the border
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const start = axis === "x" ? e.clientX : e.clientY;
    const startSize = measure();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add(axis === "x" ? "is-resizing" : "is-resizing-y");
    const onMove = (ev: PointerEvent) => {
      const pos = axis === "x" ? ev.clientX : ev.clientY;
      onChange(clamp(Math.round(startSize + sign * (pos - start))));
    };
    const onUp = () => {
      document.body.classList.remove("is-resizing", "is-resizing-y");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const nudge = (delta: number) => onChange(clamp(Math.round((value ?? measure()) + delta)));
  const grow = axis === "x" ? "ArrowLeft" : "ArrowUp";
  const shrink = axis === "x" ? "ArrowRight" : "ArrowDown";

  return (
    <div
      className={`studio-splitter is-${axis}`}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChange(null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === grow) nudge(step);
        else if (e.key === shrink) nudge(-step);
        else if (e.key === "Enter") onChange(null);
        else return;
        e.preventDefault();
      }}
    />
  );
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
  const rootRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const controlsRef = useRef<HTMLElement>(null);
  // Pane sizes in px; null keeps the stylesheet default.
  const [previewW, setPreviewW] = useState<number | null>(null);
  const [bottomH, setBottomH] = useState<number | null>(null);
  const status = getCompileStatus(customType(comp.id));

  const openProblem = (p: Problem) => {
    if (!p.file) return;
    setSelected(p.file);
    if (p.line) setReveal({ file: p.file, line: p.line, column: p.column, nonce: Date.now() });
  };

  return (
    <div
      ref={rootRef}
      className="studio"
      style={{
        ...(previewW !== null && { ["--studio-preview-w" as string]: `${previewW}px` }),
        ...(bottomH !== null && { ["--studio-bottom-h" as string]: `${bottomH}px` }),
      }}
    >
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
      <PreviewPane comp={comp} doc={state.doc} preview={preview} sectionRef={previewRef} />
      <OutputPane comp={comp} onOpenProblem={openProblem} />
      <ControlsPane preview={preview} sectionRef={controlsRef} />
      <Splitter
        axis="x"
        label="Resize the code and preview panes"
        value={previewW}
        measure={() => previewRef.current?.getBoundingClientRect().width ?? 0}
        clamp={(w) => {
          const total = rootRef.current?.getBoundingClientRect().width ?? 0;
          return Math.max(MIN_PREVIEW_W, Math.min(w, total - 240 - MIN_CODE_W));
        }}
        onChange={setPreviewW}
      />
      <Splitter
        axis="y"
        label="Resize the editor and the problems and controls panes"
        value={bottomH}
        measure={() => controlsRef.current?.getBoundingClientRect().height ?? 0}
        clamp={(h) => {
          const total = rootRef.current?.getBoundingClientRect().height ?? 0;
          return Math.max(MIN_BOTTOM_H, Math.min(h, total - 40 - MIN_TOP_H));
        }}
        onChange={setBottomH}
      />
    </div>
  );
}
