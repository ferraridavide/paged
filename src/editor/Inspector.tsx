import { useState } from "react";
import { getDefinition } from "../elements/registry";
import { useEditor, useSelectedNode } from "../model/store";
import type { ElementNode, PageSettings } from "../model/types";
import { FieldInput } from "./fields/FieldInput";
import { StyleEditor } from "./fields/StyleEditor";
import { ColorInput, DraftTextarea, FONT_FAMILIES, Row, Segmented, Select, TextInput } from "./fields/inputs";

/** Right sidebar: the selected element's parameters and styles, or page settings. */
export function Inspector() {
  const node = useSelectedNode();
  return <aside className="panel inspector">{node ? <ElementPanel node={node} /> : <PagePanel />}</aside>;
}

function ElementPanel({ node }: { node: ElementNode }) {
  const { dispatch } = useEditor();
  const [tab, setTab] = useState<"content" | "style">("content");
  const def = getDefinition(node.type);
  const styleCount = Object.keys(node.style).length;

  return (
    <>
      <header className="panel-header">
        <span className="panel-icon">{def?.icon}</span>
        <div className="panel-title">
          <strong>{def?.label ?? node.type}</strong>
          <code>{node.id}</code>
        </div>
        <button className="btn btn-ghost" title="Back to page settings" onClick={() => dispatch({ type: "select", id: null })}>
          ✕
        </button>
      </header>
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
          <StyleEditor style={node.style} onChange={(style) => dispatch({ type: "updateStyle", id: node.id, style })} />
        )}
      </div>
    </>
  );
}

function PagePanel() {
  const { state, dispatch } = useEditor();
  const { doc } = state;
  const page = doc.page;
  const setPage = (patch: Partial<PageSettings>) => dispatch({ type: "updatePage", patch });
  const setMargin = (side: keyof PageSettings["margin"], v: string) =>
    setPage({ margin: { ...page.margin, [side]: v } });

  return (
    <>
      <header className="panel-header">
        <span className="panel-icon">▤</span>
        <div className="panel-title">
          <strong>Document</strong>
          <span className="muted">Select an element to edit it</span>
        </div>
      </header>
      <div className="panel-body">
        <details className="section" open>
          <summary>Page</summary>
          <Row label="Title" help="Used by the {title} token in headers and footers.">
            <TextInput value={doc.title} onChange={(title) => dispatch({ type: "updateDoc", patch: { title } })} />
          </Row>
          <Row label="Size">
            <Select
              value={page.size}
              onChange={(size) => setPage({ size: size as PageSettings["size"] })}
              options={["A4", "A5", "Letter", "Legal"].map((v) => ({ value: v, label: v }))}
            />
          </Row>
          <Row label="Orientation">
            <Segmented
              value={page.orientation}
              onChange={(o) => setPage({ orientation: o as PageSettings["orientation"] })}
              options={[
                { value: "portrait", label: "Portrait" },
                { value: "landscape", label: "Landscape" },
              ]}
            />
          </Row>
          <div className="margin-grid">
            {(["top", "right", "bottom", "left"] as const).map((side) => (
              <Row key={side} label={`Margin ${side}`}>
                <TextInput value={page.margin[side]} onChange={(v) => setMargin(side, v)} />
              </Row>
            ))}
          </div>
        </details>

        <details className="section" open>
          <summary>Base typography</summary>
          <Row label="Font">
            <Select
              value={page.fontFamily}
              onChange={(fontFamily) => setPage({ fontFamily })}
              options={
                FONT_FAMILIES.some((f) => f.value === page.fontFamily)
                  ? FONT_FAMILIES
                  : [{ value: page.fontFamily, label: "Custom" }, ...FONT_FAMILIES]
              }
            />
          </Row>
          <Row label="Size">
            <TextInput value={page.fontSize} onChange={(fontSize) => setPage({ fontSize })} />
          </Row>
          <Row label="Line height">
            <TextInput value={page.lineHeight} onChange={(lineHeight) => setPage({ lineHeight })} />
          </Row>
          <Row label="Color">
            <ColorInput value={page.color} onChange={(color) => setPage({ color })} />
          </Row>
        </details>

        <details className="section" open>
          <summary>Document CSS</summary>
          <p className="muted">
            Rules for the whole document, scoped to the pages, e.g. <code>.hd-heading {"{"} color: navy; {"}"}</code>.
          </p>
          <DraftTextarea
            value={doc.customCss}
            onCommit={(customCss) => dispatch({ type: "updateDoc", patch: { customCss } })}
            rows={8}
          />
        </details>
      </div>
    </>
  );
}
