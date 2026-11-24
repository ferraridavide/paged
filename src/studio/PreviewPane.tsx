import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import documentCss from "../styles/document.css?raw";
import { componentsCss, getCompileStatus, getDefinition, useRegistryVersion } from "../elements/registry";
import { FieldInput } from "../editor/fields/FieldInput";
import { baseTypography, pageDimensions, scopedCustomCss, toReactStyle } from "../model/css";
import type { ComponentSource, DocumentModel, ElementNode, Mode } from "../model/types";
import { customType } from "../model/types";
import { DocContext } from "../render/DocContext";
import { ElementView } from "../render/ElementView";

const PX_PER_MM = 96 / 25.4;

/** Props for the preview: the definition's defaults, overridden by the Controls pane. */
export function usePreviewProps(comp: ComponentSource) {
  useRegistryVersion();
  const def = getDefinition(customType(comp.id));
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  const defaults = def?.create().props ?? {};
  const props = { ...defaults, ...overrides } as Record<string, unknown>;
  // Stable callbacks keep the memoised preview element from re-rendering needlessly.
  const setProp = useCallback((patch: Record<string, unknown>) => setOverrides((o) => ({ ...o, ...patch })), []);
  const reset = useCallback(() => setOverrides({}), []);
  return { def, props, setProp, reset };
}

type PreviewProps = ReturnType<typeof usePreviewProps>;

/**
 * Storybook-style canvas: the component alone, at the document's content
 * width and typography, in print or edit mode. Never touches the document.
 */
export function PreviewPane({ comp, doc, preview }: { comp: ComponentSource; doc: DocumentModel; preview: PreviewProps }) {
  const type = customType(comp.id);
  const status = getCompileStatus(type);
  const [mode, setMode] = useState<Mode>("print");
  const [fullWidth, setFullWidth] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [heightMm, setHeightMm] = useState<number | null>(null);

  const propsKey = JSON.stringify(preview.props);
  const node: ElementNode = useMemo(
    () => ({ id: `preview-${comp.id}`, type, props: preview.props, style: {} }),
    [comp.id, type, propsKey], // props compared by value
  );

  const { setProp } = preview;
  const onUpdate = useCallback((_: string, patch: Record<string, unknown>) => setProp(patch), [setProp]);

  const { width, height } = pageDimensions(doc.page);
  const m = doc.page.margin;
  const contentWidth = `calc(${width}mm - ${m.left} - ${m.right})`;
  const contentHeight = `calc(${height}mm - ${m.top} - ${m.bottom})`;

  // How tall the component renders, compared with a page.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const target = el.querySelector<HTMLElement>("[data-node-id]");
      setHeightMm(target ? target.getBoundingClientRect().height / PX_PER_MM : null);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pageContentMm = height - parseFloat(m.top) - parseFloat(m.bottom);

  return (
    <section className="studio-preview">
      <div className="studio-pane-header">
        <span>Preview</span>
        <span className="segmented">
          <button className={mode === "print" ? "is-on" : ""} onClick={() => setMode("print")}>
            Print
          </button>
          <button className={mode === "edit" ? "is-on" : ""} onClick={() => setMode("edit")}>
            Edit
          </button>
        </span>
        <span className="segmented">
          <button className={!fullWidth ? "is-on" : ""} onClick={() => setFullWidth(false)} title="Width of the document's page content">
            Page width
          </button>
          <button className={fullWidth ? "is-on" : ""} onClick={() => setFullWidth(true)}>
            Fill
          </button>
        </span>
      </div>
      <div className="studio-canvas">
        <div
          className={`pd-doc pd-${mode}`}
          style={{ ...toReactStyle(baseTypography(doc.page)), ["--pd-content-height" as string]: contentHeight }}
        >
          <style>{documentCss}</style>
          <style>{componentsCss()}</style>
          <style>{scopedCustomCss(doc)}</style>
          <DocContext.Provider value={doc}>
            <div ref={boxRef} className="studio-sheet" style={{ width: fullWidth ? "auto" : contentWidth }}>
              {preview.def || status ? (
                <ElementView node={node} mode={mode} onUpdate={onUpdate} />
              ) : null}
            </div>
          </DocContext.Provider>
        </div>
      </div>
      <div className="studio-preview-footer muted">
        {heightMm !== null && (
          <>
            {heightMm.toFixed(1)} mm tall
            {heightMm > pageContentMm ? (
              <span className="warn"> · taller than a page ({pageContentMm.toFixed(0)} mm): it will overflow</span>
            ) : (
              <span> · {Math.round((heightMm / pageContentMm) * 100)}% of a page</span>
            )}
          </>
        )}
        <span className="spacer" />
        {doc.page.size} {doc.page.orientation}, typography from the document
      </div>
    </section>
  );
}

/** Storybook-style controls: one input per field, bound to the preview only. */
export function ControlsPane({ preview }: { preview: PreviewProps }) {
  const { def } = preview;
  return (
    <section className="studio-controls">
      <div className="studio-pane-header">
        <span>Controls</span>
        <span className="studio-pane-actions">
          <button title="Reset to defaults" onClick={preview.reset}>
            ↺
          </button>
        </span>
      </div>
      <div className="studio-controls-body">
        {!def ? (
          <p className="muted">Controls appear once the component compiles.</p>
        ) : def.fields.length === 0 ? (
          <p className="muted">
            This component has no <code>fields</code>.
          </p>
        ) : (
          def.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={preview.props[field.key]}
              onChange={(v) => preview.setProp({ [field.key]: v })}
            />
          ))
        )}
        <p className="muted studio-note">Controls only change this preview, not the document.</p>
      </div>
    </section>
  );
}
