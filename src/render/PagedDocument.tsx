import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import documentCss from "../styles/document.css?raw";
import { getDefinition } from "../elements/registry";
import { BoxModelOverlay } from "../editor/BoxModelOverlay";
import { restoreCaret, caretRecord } from "../layout/caret";
import { paginate, reconcile, type PageLayout } from "../layout/paginate";
import { baseTypography, elementsCss, pageDimensions, scopedCustomCss, toReactStyle } from "../model/css";
import { useEditor } from "../model/store";
import type { DocumentModel, ElementNode, Mode } from "../model/types";
import { DocContext } from "./DocContext";
import { ElementView } from "./ElementView";

export interface LayoutStats {
  layout: PageLayout[];
  pages: number;
  /** Time spent in the pagination pass (rect reads + page filling), in ms. */
  ms: number;
}

interface Props {
  mode: Mode;
  pagesRef: RefObject<HTMLDivElement | null>;
  onLayout?: (stats: LayoutStats) => void;
}

/**
 * Renders the document as real pages, in edit or print mode. Both modes use
 * the same layout, computed by our paginator from a hidden, unpaginated
 * "measure flow" of the document in print mode.
 */
export const PagedDocument = memo(function PagedDocument({ mode, pagesRef, onLayout }: Props) {
  const { state, dispatch } = useEditor();
  const { doc, selectedId } = state;
  const flowRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PageLayout[]>([{ fragments: [] }]);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const flowNodes = useMemo(() => doc.elements.filter((n) => !getDefinition(n.type)?.region), [doc.elements]);
  const byId = useMemo(() => new Map(doc.elements.map((n) => [n.id, n])), [doc.elements]);
  const indexOf = useMemo(() => new Map(doc.elements.map((n, i) => [n.id, i])), [doc.elements]);

  // ---- Layout ----

  const lastFlowHeight = useRef(0);
  const relayout = useCallback(() => {
    const flow = flowRef.current;
    const probe = probeRef.current;
    if (!flow || !probe) return;
    const t0 = performance.now();
    const next = paginate(doc, flow, probe.getBoundingClientRect().height);
    const ms = performance.now() - t0;
    lastFlowHeight.current = flow.getBoundingClientRect().height;
    setPages((prev) => reconcile(prev, next));
    onLayout?.({ layout: next, pages: next.length, ms });
  }, [doc, onLayout]);

  useLayoutEffect(relayout, [relayout]);

  // Re-layout when the flow changes size on its own (images, web fonts loading).
  const relayoutRef = useRef(relayout);
  relayoutRef.current = relayout;
  useEffect(() => {
    const flow = flowRef.current;
    if (!flow) return;
    const ro = new ResizeObserver(() => {
      if (Math.abs(flow.getBoundingClientRect().height - lastFlowHeight.current) > 0.5) relayoutRef.current();
    });
    ro.observe(flow);
    document.fonts?.ready.then(() => relayoutRef.current());
    return () => ro.disconnect();
  }, []);

  // Only pages near the viewport get their content rendered. Off-screen pages
  // are empty boxes of the right size, so an edit that pushes content onto the
  // following pages costs the same whether the document has 5 or 500 pages.
  const [visible, setVisible] = useState<Set<number>>(() => new Set([0, 1, 2]));
  useEffect(() => {
    const container = pagesRef.current;
    if (!container) return;
    const io = new IntersectionObserver(
      (entries) =>
        setVisible((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const i = Number((e.target as HTMLElement).dataset.page) - 1;
            if (e.isIntersecting) next.add(i);
            else next.delete(i);
          }
          return next.size === prev.size && [...next].every((i) => prev.has(i)) ? prev : next;
        }),
      { root: container.closest(".canvas"), rootMargin: "1500px 0px" },
    );
    container.querySelectorAll(":scope > .pd-page").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages.length, pagesRef]);

  // Bring the selected element into view (e.g. when picked in the outline).
  useEffect(() => {
    if (!selectedId) return;
    const el = pagesRef.current?.querySelector(`[data-node-id="${CSS.escape(selectedId)}"]`);
    // Don't return scrollIntoView's result: newer browsers return a Promise,
    // and React would call it as the effect's cleanup and crash.
    if (el) {
      el.scrollIntoView({ block: "nearest" });
      return;
    }
    const index = pages.findIndex((p) => p.fragments.some((f) => f.nodeId === selectedId));
    pagesRef.current?.querySelectorAll(":scope > .pd-page")[index]?.scrollIntoView({ block: "start" });
    // Only when the selection changes, not on every layout.
  }, [selectedId]);

  // After each layout, put the caret back if its text moved to another fragment.
  useLayoutEffect(() => {
    if (mode === "edit") restoreCaret(pagesRef.current);
  }, [pages, doc, mode, pagesRef]);

  // ---- Editing ----

  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  /**
   * Text edits inside a split paragraph shift the offsets of the fragments
   * after the caret. Apply that shift in the same render as the edit, so the
   * fragment being typed in never shows stale text (which would fight the caret).
   */
  const onUpdate = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      const node = byIdRef.current.get(id);
      const caret = caretRecord();
      if (node && typeof patch.text === "string" && typeof node.props.text === "string" && caret?.key === `${id}/text`) {
        const delta = patch.text.length - node.props.text.length;
        if (delta) {
          setPages((prev) =>
            prev.map((page) => ({
              ...page,
              fragments: page.fragments.map((f) => {
                if (f.nodeId !== id || f.to === undefined && f.from === undefined) return f;
                if ((f.from ?? 0) === caret.base) return { ...f, to: f.to === undefined ? undefined : f.to + delta };
                if ((f.from ?? 0) > caret.base) return { ...f, from: f.from! + delta, to: f.to === undefined ? undefined : f.to + delta };
                return f;
              }),
            })),
          );
        }
      }
      dispatch({ type: "updateProps", id, patch });
    },
    [dispatch],
  );
  // ---- Drag and drop onto pages (edit mode) ----

  const dropTarget = (clientY: number) => {
    const blocks = pagesRef.current?.querySelectorAll<HTMLElement>(".ed-block[data-index]") ?? [];
    for (const b of blocks) {
      const r = b.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return Number(b.dataset.index);
    }
    return doc.elements.length;
  };
  const dndHandlers =
    mode === "edit"
      ? {
          onDragOver(e: React.DragEvent) {
            if (!e.dataTransfer.types.includes("application/x-paged-editor")) return;
            e.preventDefault();
            setDropIndex(dropTarget(e.clientY));
          },
          onDragLeave(e: React.DragEvent) {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropIndex(null);
          },
          onDrop(e: React.DragEvent) {
            setDropIndex(null);
            try {
              const payload = JSON.parse(e.dataTransfer.getData("application/x-paged-editor"));
              e.preventDefault();
              const index = dropTarget(e.clientY);
              dispatch(
                payload.kind === "new"
                  ? { type: "insert", elementType: payload.elementType, index }
                  : { type: "move", id: payload.id, to: index },
              );
            } catch {
              // Not ours.
            }
          },
        }
      : {};

  // In preview, clicking an element selects it.
  const onPreviewClick = (e: React.MouseEvent) => {
    if (mode !== "print") return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-node-id]");
    dispatch({ type: "select", id: el?.dataset.nodeId ?? null });
  };

  // ---- Render ----

  const { width, height } = pageDimensions(doc.page);
  const m = doc.page.margin;
  const contentHeight = `calc(${height}mm - ${m.top} - ${m.bottom})`;

  return (
    <div
      className={`pd-doc pd-${mode}`}
      style={{ ...toReactStyle(baseTypography(doc.page)), ["--pd-content-height" as string]: contentHeight }}
    >
      <style>{documentCss}</style>
      <style>{elementsCss(doc)}</style>
      <style>{scopedCustomCss(doc)}</style>
      {mode === "print" && selectedId && (
        <style>{`.pd-print .pd-pages [data-node-id="${CSS.escape(selectedId)}"] { outline: 2px solid #4f46e5; outline-offset: 2px; }`}</style>
      )}
      <DocContext.Provider value={doc}>
        <div className="pd-measure" aria-hidden inert style={{ width: `calc(${width}mm - ${m.left} - ${m.right})` }}>
          <div ref={probeRef} className="pd-probe" style={{ height: contentHeight }} />
          <div ref={flowRef} className="pd-flow">
            <MeasureFlow nodes={flowNodes} />
          </div>
        </div>

        <div ref={pagesRef} className="pd-pages" onClick={onPreviewClick} {...dndHandlers}>
          {pages.map((page, i) => (
            <Page
              key={i}
              page={page}
              visible={visible.has(i)}
              number={i + 1}
              total={pages.length}
              doc={doc}
              byId={byId}
              indexOf={indexOf}
              mode={mode}
              selectedId={selectedId}
              dropIndex={dropIndex}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      </DocContext.Provider>
    </div>
  );
});

/** The unpaginated document, always in print mode, used only for measuring. */
const MeasureFlow = memo(function MeasureFlow({ nodes }: { nodes: ElementNode[] }) {
  return (
    <>
      {nodes.map((node) => (
        <ElementView key={node.id} node={node} mode="print" />
      ))}
    </>
  );
});

export interface PageProps {
  page: PageLayout;
  visible: boolean;
  number: number;
  total: number;
  doc: DocumentModel;
  byId: Map<string, ElementNode>;
  indexOf: Map<string, number>;
  mode: Mode;
  selectedId: string | null;
  dropIndex: number | null;
  onUpdate?: (id: string, patch: Record<string, unknown>) => void;
}

export function Page({ page, visible, number, total, doc, byId, indexOf, mode, selectedId, dropIndex, onUpdate }: PageProps) {
  const { width, height } = pageDimensions(doc.page);
  const m = doc.page.margin;
  const info = useMemo(() => ({ number, total }), [number, total]);
  const header = page.header ? byId.get(page.header) : undefined;
  const footer = page.footer ? byId.get(page.footer) : undefined;
  const lastIndex = doc.elements.length;
  const style = { width: `${width}mm`, height: `${height}mm` };
  if (!visible) return <section className="pd-page" style={style} data-page={number} />;

  const region = (node: ElementNode | undefined, where: "top" | "bottom") => (
    <div
      className={`pd-margin pd-margin-${where}`}
      style={{ height: where === "top" ? m.top : m.bottom, paddingLeft: m.left, paddingRight: m.right }}
    >
      {node &&
        (mode === "edit" ? (
          <EditBlock node={node} index={indexOf.get(node.id)!} count={lastIndex} selected={node.id === selectedId} region>
            <ElementView node={node} mode={mode} page={info} selected={node.id === selectedId} onUpdate={onUpdate} />
          </EditBlock>
        ) : (
          <ElementView node={node} mode={mode} page={info} />
        ))}
    </div>
  );

  return (
    <section className="pd-page" style={style} data-page={number}>
      {region(header, "top")}
      <div className="pd-content" style={{ top: m.top, left: m.left, right: m.right, bottom: m.bottom }}>
        {page.fragments.map((f) => {
          const node = byId.get(f.nodeId);
          if (!node) return null;
          const view = <ElementView node={node} mode={mode} fragment={f} onUpdate={mode === "edit" ? onUpdate : undefined} />;
          if (mode !== "edit") return <Fragment key={`${f.nodeId}:${f.from ?? 0}`}>{view}</Fragment>;
          const index = indexOf.get(node.id)!;
          return (
            <EditBlock
              key={`${f.nodeId}:${f.from ?? 0}`}
              node={node}
              index={index}
              count={lastIndex}
              selected={node.id === selectedId}
              dropBefore={dropIndex === index && !f.continued}
              dropAfter={dropIndex === lastIndex && index === lastIndex - 1 && !f.continues}
            >
              {view}
            </EditBlock>
          );
        })}
      </div>
      {region(footer, "bottom")}
    </section>
  );
}

interface EditBlockProps {
  node: ElementNode;
  index: number;
  count: number;
  selected: boolean;
  region?: boolean;
  dropBefore?: boolean;
  dropAfter?: boolean;
  children: React.ReactNode;
}

/** Editor chrome around one fragment: selection outline and a toolbar in the page margin. */
const focusedInserts = new Set<string>();

function EditBlock({ node, index, count, selected, region, dropBefore, dropAfter, children }: EditBlockProps) {
  const { state, dispatch } = useEditor();
  const justInserted = state.lastInserted === node.id;
  const def = getDefinition(node.type);
  const ref = useRef<HTMLDivElement>(null);

  // A just inserted or duplicated block: put the caret in its first editable
  // text, selecting the default content so typing replaces it.
  useEffect(() => {
    if (!justInserted || region || focusedInserts.has(node.id)) return;
    focusedInserts.add(node.id);
    const editable = ref.current?.querySelector<HTMLElement>("[data-editable]");
    ref.current?.scrollIntoView({ block: "nearest" });
    if (!editable || document.activeElement?.closest("[data-editable]")) return;
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [justInserted, region, node.id]);

  let className = "ed-block";
  if (selected) className += " is-selected";
  if (region) className += " ed-region";
  if (dropBefore) className += " drop-before";
  if (dropAfter) className += " drop-after";

  return (
    <div
      ref={ref}
      className={className}
      data-index={region ? undefined : index}
      onMouseDown={() => {
        if (!selected) dispatch({ type: "select", id: node.id });
      }}
    >
      {!region && (
        <div className="ed-block-bar" onMouseDown={(e) => e.stopPropagation()}>
          <span
            className="ed-handle"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-paged-editor", JSON.stringify({ kind: "move", id: node.id }));
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => dispatch({ type: "select", id: node.id })}
            title={`${def?.label ?? node.type}: drag to move`}
          >
            ⋮⋮
          </span>
          {selected && (
            <>
              <button title="Move up" disabled={index === 0} onClick={() => dispatch({ type: "move", id: node.id, to: index - 1 })}>
                ↑
              </button>
              <button
                title="Move down"
                disabled={index === count - 1}
                onClick={() => dispatch({ type: "move", id: node.id, to: index + 2 })}
              >
                ↓
              </button>
              <button title="Duplicate" onClick={() => dispatch({ type: "duplicate", id: node.id })}>
                ⧉
              </button>
              <button title="Delete" onClick={() => dispatch({ type: "remove", id: node.id })}>
                ✕
              </button>
            </>
          )}
        </div>
      )}
      {children}
      {selected && <BoxModelOverlay containerRef={ref} />}
    </div>
  );
}
