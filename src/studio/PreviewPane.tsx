import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";
import documentCss from "../styles/document.css?raw";
import { componentsCss, getCompileStatus, getDefinition, useRegistryVersion } from "../elements/registry";
import { FieldInput } from "../editor/fields/FieldInput";
import { useUi, ZOOM_STEPS } from "../editor/ui";
import { useMenu } from "../ui/Menu";
import { buildOutline, buildPageInfos, LayoutContext } from "../layout/pageInfo";
import { emptyPage } from "../layout/paginate";
import { sectionAttrs, sectionBox, sectionsCss, sectionsOf } from "../layout/sections";
import { scopedCustomCss } from "../model/css";
import type { ComponentSource, DocumentModel, ElementNode, Mode, Zone } from "../model/types";
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
  const setProp = useCallback(
    (patch: Record<string, unknown>) =>
      setOverrides((o) => {
        // Component state ("$state") merges key by key, like in the document.
        const { $state, ...rest } = patch as { $state?: Record<string, unknown> };
        const next: Record<string, unknown> = { ...o, ...rest };
        if ($state) next.$state = { ...(o.$state as Record<string, unknown> | undefined), ...$state };
        return next;
      }),
    [],
  );
  const reset = useCallback(() => setOverrides({}), []);
  return { def, props, setProp, reset };
}

type PreviewProps = ReturnType<typeof usePreviewProps>;

/** How the preview frames the component. */
type Frame = "width" | "fill" | "page";
/** Where the component sits on the simulated page. */
type Placement = "body" | Zone;

/**
 * Storybook-style canvas: the component alone, at the document's content
 * width and typography, in print or edit mode, or on a whole page so
 * page-aware components (thumb tabs, running heads) draw as in the document.
 * It sees the document's last layout (outline, page count) and a chosen page's
 * usePageInfo(). Never touches the document.
 */
export function PreviewPane({
  comp,
  doc,
  preview,
  sectionRef,
}: {
  comp: ComponentSource;
  doc: DocumentModel;
  preview: PreviewProps;
  sectionRef?: Ref<HTMLElement>;
}) {
  const type = customType(comp.id);
  const status = getCompileStatus(type);
  const [mode, setMode] = useState<Mode>("print");
  const [frame, setFrame] = useState<Frame>("width");
  // Where the document uses it, if it's in a header or footer there.
  const [placement, setPlacement] = useState<Placement>(
    () => doc.elements.find((n) => n.type === type && n.zone)?.zone ?? "body",
  );
  const [pageNo, setPageNo] = useState(1);
  const [zoom, setZoom] = useState(1);
  const menu = useMenu();
  const ui = useUi();
  const boxRef = useRef<HTMLDivElement>(null);
  const [heightMm, setHeightMm] = useState<number | null>(null);

  const propsKey = JSON.stringify(preview.props);
  const node: ElementNode = useMemo(
    () => {
      const { $state, ...props } = preview.props as Record<string, unknown> & { $state?: Record<string, unknown> };
      const zone = frame === "page" && placement !== "body" ? placement : undefined;
      return { id: `preview-${comp.id}`, type, props, state: $state, style: {}, ...(zone && { zone }) };
    },
    [comp.id, type, propsKey, frame, placement], // props compared by value
  );

  const { setProp } = preview;
  const onUpdate = useCallback((_: string, patch: Record<string, unknown>) => setProp(patch), [setProp]);

  // The document's last layout (kept from the document view): what
  // useDocument() and usePageInfo() report here.
  const layout = ui.layout?.layout;
  const sections = useMemo(() => sectionsOf(doc), [doc]);
  const pages = useMemo(() => (layout?.length ? layout : [emptyPage(sections[0])]), [layout, sections]);
  const outline = useMemo(() => buildOutline(doc, layout ?? []), [doc, layout]);
  const layoutInfo = useMemo(() => ({ pages: layout?.length ?? 0, outline }), [layout, outline]);
  const infos = useMemo(() => buildPageInfos(pages, outline), [pages, outline]);
  const total = pages.length;
  const current = Math.min(pageNo, total);
  const info = infos[current - 1];
  const section = sections[pages[current - 1].section] ?? sections[0];
  const box = sectionBox(section);
  const m = box.margin;
  const attrs = sectionAttrs(section, "");

  const zoomBy = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > zoom + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.001);
    if (next) setZoom(next);
  };

  // How tall the component renders, compared with a page (at 100% zoom).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const target = el.querySelector<HTMLElement>("[data-node-id]");
      setHeightMm(target ? target.getBoundingClientRect().height / zoom / PX_PER_MM : null);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom, frame]); // the frame swaps the observed box
  const pageContentMm = box.height - parseFloat(m.top) - parseFloat(m.bottom);

  const element = preview.def || status ? <ElementView node={node} mode={mode} page={info} onUpdate={onUpdate} /> : null;
  /** A header or footer zone of the simulated page, holding the component when it's placed there. */
  const zone = (which: Zone) => (
    <div
      className={`pd-margin pd-margin-${which === "header" ? "top" : "bottom"} pd-zone${placement === which ? "" : " is-empty"}`}
      data-zone={which}
      data-label={which === "header" ? "Header" : "Footer"}
      style={{ height: which === "header" ? m.top : m.bottom, paddingLeft: m.left, paddingRight: m.right }}
    >
      {placement === which && element}
    </div>
  );

  return (
    <section className="studio-preview" ref={sectionRef}>
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
          <button className={frame === "width" ? "is-on" : ""} onClick={() => setFrame("width")} title="Width of the document's page content">
            Page width
          </button>
          <button className={frame === "fill" ? "is-on" : ""} onClick={() => setFrame("fill")} title="Fill the preview">
            Fill
          </button>
          <button
            className={frame === "page" ? "is-on" : ""}
            onClick={() => setFrame("page")}
            title="On a whole page, for components that draw against the page edge or use the page number"
          >
            Page
          </button>
        </span>
      </div>
      {frame === "page" && (
        <div className="studio-preview-pagebar">
          <span className="segmented" title="Where the component sits on the page">
            {(["header", "body", "footer"] as const).map((p) => (
              <button key={p} className={placement === p ? "is-on" : ""} onClick={() => setPlacement(p)}>
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </span>
          <span className="studio-page-stepper" title="The page usePageInfo() reports">
            <button onClick={() => setPageNo(current - 1)} disabled={current <= 1} title="Previous page">
              <ChevronLeft size={13} />
            </button>
            <span>
              Page {current} of {total}
            </span>
            <button onClick={() => setPageNo(current + 1)} disabled={current >= total} title="Next page">
              <ChevronRight size={13} />
            </button>
          </span>
          {info?.chapter && <span className="muted studio-page-chapter">{info.chapter.title}</span>}
        </div>
      )}
      <div className="studio-canvas">
        <div className={`pd-doc pd-${mode}`} style={{ ...attrs.style, zoom }}>
          <style>{documentCss}</style>
          <style>{componentsCss()}</style>
          <style>{scopedCustomCss(doc)}</style>
          <style>{sectionsCss(sections)}</style>
          <DocContext.Provider value={doc}>
            <LayoutContext.Provider value={layoutInfo}>
              {frame === "page" ? (
                <section
                  ref={boxRef}
                  className={["pd-page", "studio-page", ...(section.settings.classes ?? [])].join(" ")}
                  data-section={section.index}
                  data-page={current}
                  style={{ width: `${box.width}mm`, height: `${box.height}mm`, background: section.settings.background || undefined }}
                >
                  {zone("header")}
                  <div className="pd-content" style={{ top: m.top, left: m.left, right: m.right, bottom: m.bottom }}>
                    {placement === "body" && element}
                  </div>
                  {zone("footer")}
                </section>
              ) : (
                <div ref={boxRef} className="studio-sheet" style={{ width: frame === "fill" ? "auto" : box.contentWidth }}>
                  {element}
                </div>
              )}
            </LayoutContext.Provider>
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
        <span className="studio-preview-footer-note">
          {section.settings.size} {section.settings.orientation}, typography from the document
        </span>
        <div className="zoom-control">
          <button onClick={() => zoomBy(-1)} disabled={zoom <= ZOOM_STEPS[0]} title="Zoom out">
            <Minus size={12} />
          </button>
          <button
            className="zoom-value"
            title="Zoom"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              menu.open({
                x: r.left,
                y: r.top - 8 - ZOOM_STEPS.length * 28,
                items: ZOOM_STEPS.map((z) => ({
                  label: `${Math.round(z * 100)}%`,
                  checked: Math.abs(zoom - z) < 0.001,
                  onSelect: () => setZoom(z),
                })),
              });
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => zoomBy(1)} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} title="Zoom in">
            <Plus size={12} />
          </button>
        </div>
      </div>
    </section>
  );
}

/** Storybook-style controls: one input per field, bound to the preview only. */
export function ControlsPane({ preview, sectionRef }: { preview: PreviewProps; sectionRef?: Ref<HTMLElement> }) {
  const { def } = preview;
  return (
    <section className="studio-controls" ref={sectionRef}>
      <div className="studio-pane-header">
        <span>Controls</span>
        <span className="studio-pane-actions">
          <button title="Reset to defaults" onClick={preview.reset}>
            <RotateCcw size={14} />
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
