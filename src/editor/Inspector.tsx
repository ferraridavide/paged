import { FileText, X } from "lucide-react";
import { useState } from "react";
import { elementIcon } from "./icons";
import { INSPECTOR_WIDTH, useUi } from "./ui";
import { getDefinition, useRegistryVersion } from "../elements/registry";
import { useEditor, useSelectedNode } from "../model/store";
import type { ElementNode } from "../model/types";
import { FieldInput } from "./fields/FieldInput";
import { StyleEditor } from "./fields/StyleEditor";
import { ClassInput } from "./fields/ClassInput";
import { CssEditor } from "./fields/CssEditor";
import { PageSettingsForm } from "./PageSettingsForm";
import { resolvePage } from "../layout/sections";
import { knownClasses } from "../model/css";
import { Row, TextInput } from "./fields/inputs";

/** Right sidebar: the selected element's parameters and styles, or page settings. */
export function Inspector() {
  useRegistryVersion();
  const node = useSelectedNode();
  return (
    <aside className="panel inspector">
      <PanelResizer />
      {node ? <ElementPanel node={node} /> : <PagePanel />}
    </aside>
  );
}

/**
 * The inspector's left edge: drag to resize, double-click to restore the
 * default width, or focus it and use the arrow keys.
 */
function PanelResizer() {
  const ui = useUi();
  const width = ui.settings.inspectorWidth;
  const clamp = (w: number) =>
    Math.round(Math.min(INSPECTOR_WIDTH.max, window.innerWidth - 360, Math.max(INSPECTOR_WIDTH.min, w)));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startWidth = width;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add("is-resizing");
    const onMove = (ev: PointerEvent) => ui.set({ inspectorWidth: clamp(startWidth + (startX - ev.clientX)) });
    const onUp = () => {
      document.body.classList.remove("is-resizing");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
      aria-valuenow={width}
      aria-valuemin={INSPECTOR_WIDTH.min}
      aria-valuemax={INSPECTOR_WIDTH.max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={() => ui.set({ inspectorWidth: INSPECTOR_WIDTH.default })}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft") ui.set({ inspectorWidth: clamp(width + step) });
        else if (e.key === "ArrowRight") ui.set({ inspectorWidth: clamp(width - step) });
        else if (e.key === "Enter") ui.set({ inspectorWidth: INSPECTOR_WIDTH.default });
        else return;
        e.preventDefault();
      }}
    />
  );
}

function ElementPanel({ node }: { node: ElementNode }) {
  const { state, dispatch } = useEditor();
  const [tab, setTab] = useState<"content" | "style">("content");
  const def = getDefinition(node.type);
  const styleCount = Object.keys(node.style).length;
  const Icon = elementIcon(node.type);

  return (
    <>
      <header className="panel-header">
        <span className="panel-icon">
          <Icon size={15} />
        </span>
        <div className="panel-title">
          <strong>{def?.label ?? node.type}</strong>
          <code>{node.zone ? `in the ${node.zone} · ` : ""}{node.id}</code>
        </div>
        <button className="icon-button" title="Deselect (Esc)" onClick={() => dispatch({ type: "select", id: null })}>
          <X size={15} />
        </button>
      </header>
      <div className="class-field">
        <span className="row-label">Classes</span>
        <ClassInput
          classes={node.classes ?? []}
          known={knownClasses(state.doc)}
          onChange={(classes) => dispatch({ type: "setClasses", id: node.id, classes })}
        />
      </div>
      <nav className="tabs">
        <button className={tab === "content" ? "is-on" : ""} onClick={() => setTab("content")}>
          Content
        </button>
        <button className={tab === "style" ? "is-on" : ""} onClick={() => setTab("style")}>
          Style{styleCount > 0 && <span className="count">{styleCount}</span>}
        </button>
      </nav>
      <div className="panel-body">
        {tab === "content" ? (
          <>
            {def?.fields.length ? (
              def.fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={node.props[field.key]}
                  onChange={(value) => dispatch({ type: "updateProps", id: node.id, patch: { [field.key]: value } })}
                />
              ))
            ) : (
              <p className="muted">This element has no parameters. Use the Style tab to change how it looks.</p>
            )}
            <div className="row-buttons danger-zone">
              <button className="btn" onClick={() => dispatch({ type: "duplicate", id: node.id })}>
                Duplicate
              </button>
              <button className="btn btn-danger" onClick={() => dispatch({ type: "remove", id: node.id })}>
                Delete
              </button>
            </div>
          </>
        ) : (
          <StyleEditor elementId={node.id} style={node.style} onChange={(style) => dispatch({ type: "updateStyle", id: node.id, style })} />
        )}
      </div>
    </>
  );
}

function PagePanel() {
  const { state, dispatch } = useEditor();
  const { doc } = state;

  return (
    <>
      <header className="panel-header">
        <span className="panel-icon">
          <FileText size={15} />
        </span>
        <div className="panel-title">
          <strong>Document</strong>
          <span className="muted">Default page settings · select an element to edit it</span>
        </div>
      </header>
      <div className="panel-body">
        <PageSettingsForm
          value={resolvePage(doc.page)}
          onChange={(patch) => dispatch({ type: "updatePage", patch })}
          cssPath="inmemory://paged/sections/default.css"
          intro={
            <Row label="Title" help="Used by the {title} token in headers and footers.">
              <TextInput value={doc.title} onChange={(title) => dispatch({ type: "updateDoc", patch: { title } })} />
            </Row>
          }
        />
        <p className="muted section-note">
          Sections can change any of these for some pages: select a page break and turn on “Start a new section”, or
          right-click a page.
        </p>

        <details className="section" open>
          <summary>Document CSS</summary>
          <p className="muted">
            Rules for the whole document, scoped to the pages, e.g. <code>.hd-heading {"{"} color: navy; {"}"}</code>.
          </p>
          <CssEditor
            kind="stylesheet"
            path="inmemory://paged/document.css"
            height={260}
            value={doc.customCss}
            onChange={(customCss) => customCss !== doc.customCss && dispatch({ type: "updateDoc", patch: { customCss } })}
          />
        </details>
      </div>
    </>
  );
}
