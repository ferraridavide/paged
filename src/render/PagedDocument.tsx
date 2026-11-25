import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import documentCss from "../styles/document.css?raw";
import { componentsCss, getDefinition, useRegistryVersion } from "../elements/registry";
import { Ellipsis, GripVertical, Plus } from "lucide-react";
import { BoxModelOverlay } from "../editor/BoxModelOverlay";
import { useInsertItems } from "../editor/commands";
import { useElementMenu, usePageMenu } from "../editor/contextMenus";
import { useUi } from "../editor/ui";
import { useContextMenu, useMenu } from "../ui/Menu";
import { restoreCaret, caretRecord } from "../layout/caret";
import { paginate, reconcile, type PageLayout } from "../layout/paginate";
import { sectionAttrs, sectionBox, sectionsCss, sectionsOf, type Section } from "../layout/sections";
import { elementsCss, scopedCustomCss } from "../model/css";
import { useEditor } from "../model/store";
import { propsRuns, runsText, type Run } from "../model/runs";
import type { DocumentModel, ElementNode, Mode } from "../model/types";
import { DocContext } from "./DocContext";
import { ElementView, InsertTextAfterContext } from "./ElementView";

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
  // One hidden measure flow per section (each has its own content width).
  const flowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const probeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pages, setPages] = useState<PageLayout[]>([{ section: 0, fragments: [] }]);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const sections = useMemo(() => sectionsOf(doc), [doc]);
  const flowNodes = useMemo(() => doc.elements.filter((n) => !getDefinition(n.type)?.region), [doc.elements]);
  const byId = useMemo(() => new Map(doc.elements.map((n) => [n.id, n])), [doc.elements]);
  const indexOf = useMemo(() => new Map(doc.elements.map((n, i) => [n.id, i])), [doc.elements]);

  // ---- Layout ----

  // Custom components compiling changes what (and how) elements render.
  const registryVersion = useRegistryVersion();

  const flowHeights = () => flowRefs.current.slice(0, sections.length).map((el) => el?.getBoundingClientRect().height ?? 0);
  const lastFlowHeights = useRef<number[]>([]);
  const relayout = useCallback(() => {
    const flows = sections.map((_, i) => {
      const el = flowRefs.current[i];
      const probe = probeRefs.current[i];
      return el && probe ? { el, pageHeight: probe.getBoundingClientRect().height } : null;
    });
    if (!flows[0]) return;
    const t0 = performance.now();
    const next = paginate(doc, sections, flows);
    const ms = performance.now() - t0;
    lastFlowHeights.current = flowHeights();
    setPages((prev) => reconcile(prev, next));
    onLayout?.({ layout: next, pages: next.length, ms });
    // registryVersion is listed on purpose: re-run the layout when components recompile.
  }, [doc, sections, onLayout, registryVersion]);

  useLayoutEffect(relayout, [relayout]);

  // Re-layout when a flow changes size on its own (images, web fonts loading).
  const relayoutRef = useRef(relayout);
  relayoutRef.current = relayout;
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const now = flowHeights();
      if (now.some((h, i) => Math.abs(h - (lastFlowHeights.current[i] ?? -1)) > 0.5)) relayoutRef.current();
    });
    flowRefs.current.slice(0, sections.length).forEach((el) => el && ro.observe(el));
    document.fonts?.ready.then(() => relayoutRef.current());
    return () => ro.disconnect();
    // Re-observe when the number of sections changes.
  }, [sections.length]);

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
      if (node && Array.isArray(patch.runs) && node.type === "text" && caret?.key === `${id}/text`) {
        const delta = runsText(patch.runs as Run[]).length - runsText(propsRuns(node.props)).length;
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

  // Right-click: an element's menu (preview, or regions/blocks not handled below), else the page menu.
  const contextMenu = useContextMenu();
  const elementMenu = useElementMenu();
  const pageMenu = usePageMenu();
  const onContextMenu = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-node-id]");
    const node = el ? byId.get(el.dataset.nodeId!) : undefined;
    if (node) {
      dispatch({ type: "select", id: node.id });
      contextMenu(e, elementMenu(node));
    } else {
      const pageEl = (e.target as HTMLElement).closest<HTMLElement>(".pd-page");
      const i = pageEl ? Number(pageEl.dataset.page) - 1 : -1;
      const page = pages[i];
      const first = page?.fragments[0];
      contextMenu(
        e,
        pageMenu(
          page && {
            number: i + 1,
            section: sections[page.section] ?? sections[0],
            startsSection: i === 0 || pages[i - 1].section !== page.section,
            firstElementIndex: first ? (indexOf.get(first.nodeId) ?? null) : null,
          },
        ),
      );
    }
  };

  // In preview, clicking an element selects it.
  // ---- Word-processor caret: click empty space to start a paragraph there ----

  const docRef = useRef(doc);
  docRef.current = doc;
  const ephemeral = state.ephemeral;

  /** Puts the caret in an existing empty paragraph next to `index` instead of adding another. */
  const focusEmptyNear = (index: number) => {
    for (const n of [docRef.current.elements[index - 1], docRef.current.elements[index]]) {
      if (n?.type !== "text" || runsText(propsRuns(n.props)).trim()) continue;
      dispatch({ type: "select", id: n.id });
      const el = pagesRef.current?.querySelector<HTMLElement>(`[data-caret-key="${CSS.escape(n.id)}/text"]`);
      el?.focus();
      return true;
    }
    return false;
  };

  const insertTextAfter = useCallback(
    (id: string) => {
      const index = docRef.current.elements.findIndex((n) => n.id === id) + 1;
      if (index > 0 && !focusEmptyNear(index)) dispatch({ type: "placeEphemeral", index });
    },
    // focusEmptyNear only reads refs, so dispatch is the only dependency.
    [dispatch],
  );

  const onPagesMouseDown = (e: React.MouseEvent) => {
    if (mode !== "edit" || e.button !== 0) return;
    const target = e.target as HTMLElement;
    const content = target.closest<HTMLElement>(".pd-content");
    if (!content || target.closest(".ed-block, button, a, input")) return;
    // Clicked between or after elements: insert before the first block below
    // the pointer on this page, or after the page's last block.
    e.preventDefault();
    e.stopPropagation();
    const blocks = [...content.querySelectorAll<HTMLElement>(":scope > .ed-block[data-index]")];
    const below = blocks.find((b) => b.getBoundingClientRect().top > e.clientY);
    const lastFlow = docRef.current.elements.reduce((last, n, i) => (getDefinition(n.type)?.region ? last : i), -1);
    const index = below
      ? Number(below.dataset.index)
      : blocks.length
        ? Number(blocks[blocks.length - 1].dataset.index) + 1
        : lastFlow + 1;
    if (!focusEmptyNear(index)) dispatch({ type: "placeEphemeral", index });
  };

  // Leaving the ephemeral paragraph (not just the window) settles it.
  const onPagesBlur = (e: React.FocusEvent) => {
    if (!ephemeral || !document.hasFocus()) return;
    const from = (e.target as HTMLElement).closest<HTMLElement>("[data-node-id]");
    if (from?.dataset.nodeId !== ephemeral) return;
    const to = e.relatedTarget as HTMLElement | null;
    if (to?.closest(`[data-node-id="${CSS.escape(ephemeral)}"]`)) return;
    dispatch({ type: "settleEphemeral" });
  };

  const onPreviewClick = (e: React.MouseEvent) => {
    if (mode !== "print") return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-node-id]");
    dispatch({ type: "select", id: el?.dataset.nodeId ?? null });
  };

  // ---- Render ----

  const { settings } = useUi();
  let docClass = `pd-doc pd-${mode}`;
  if (!settings.hoverOutlines) docClass += " no-hover-outlines";
  if (!settings.boxModel) docClass += " no-box-model";

  return (
    <div className={docClass} style={sectionAttrs(sections[0], "").style}>
      <style>{documentCss}</style>
      <style>{componentsCss()}</style>
      {/* Document CSS, then section CSS (closer scope), then element styles (closest). */}
      <style>{scopedCustomCss(doc)}</style>
      <style>{sectionsCss(sections)}</style>
      <style>{elementsCss(doc)}</style>
      {mode === "print" && selectedId && (
        <style>{`.pd-print .pd-pages [data-node-id="${CSS.escape(selectedId)}"] { outline: 2px solid #4f46e5; outline-offset: 2px; }`}</style>
      )}
      <InsertTextAfterContext.Provider value={mode === "edit" ? insertTextAfter : null}>
        <DocContext.Provider value={doc}>
          {sections.map((section, i) => {
            const attrs = sectionAttrs(section, "pd-measure");
            const box = sectionBox(section);
            return (
              <div key={i} {...attrs} aria-hidden inert style={{ ...attrs.style, width: box.contentWidth }}>
                <div ref={(el) => void (probeRefs.current[i] = el)} className="pd-probe" style={{ height: box.contentHeight }} />
                <div ref={(el) => void (flowRefs.current[i] = el)} className="pd-flow">
                  <MeasureFlow nodes={section.nodes} />
                </div>
              </div>
            );
          })}

          <div
            ref={pagesRef}
            className="pd-pages"
            style={{ zoom: settings.zoom }}
            onClick={onPreviewClick}
            onMouseDown={onPagesMouseDown}
            onBlur={onPagesBlur}
            onContextMenu={onContextMenu}
            {...dndHandlers}
          >
            {pages.map((page, i) => (
              <Page
                key={i}
                page={page}
                section={sections[page.section] ?? sections[0]}
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
                empty={i === 0 && mode === "edit" && flowNodes.length === 0}
              />
            ))}
          </div>
        </DocContext.Provider>
      </InsertTextAfterContext.Provider>
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
  /** The section whose page settings this page uses. */
  section: Section;
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
  /** Show the "empty document" hint on this page. */
  empty?: boolean;
}

export function Page({ page, section, visible, number, total, doc, byId, indexOf, mode, selectedId, dropIndex, onUpdate, empty }: PageProps) {
  const box = sectionBox(section);
  const { width, height, margin: m } = box;
  const attrs = sectionAttrs(section, "pd-page");
  const info = useMemo(() => ({ number, total }), [number, total]);
  const header = page.header ? byId.get(page.header) : undefined;
  const footer = page.footer ? byId.get(page.footer) : undefined;
  const lastIndex = doc.elements.length;
  const style: React.CSSProperties = {
    ...attrs.style,
    width: `${width}mm`,
    height: `${height}mm`,
    background: section.settings.background || undefined,
  };
  const pageAttrs = { ...attrs, style, "data-page": number, "data-page-size": box.sizeKey };
  if (!visible) return <section {...pageAttrs} />;

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
    <section {...pageAttrs}>
      {region(header, "top")}
      <div className="pd-content" style={{ top: m.top, left: m.left, right: m.right, bottom: m.bottom }}>
        {empty && <EmptyHint />}
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

function EditBlock({ node, index, selected, region, dropBefore, dropAfter, children }: EditBlockProps) {
  const { state, dispatch } = useEditor();
  const { settings } = useUi();
  const menu = useMenu();
  const contextMenu = useContextMenu();
  const elementMenu = useElementMenu();
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
    // Inserting is deliberate, so the new element takes focus even from other text.
    if (!editable) return;
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
      onMouseDown={(e) => {
        if (e.button === 0 && !selected) dispatch({ type: "select", id: node.id });
      }}
      onContextMenu={(e) => {
        dispatch({ type: "select", id: node.id });
        contextMenu(e, elementMenu(node));
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
            <GripVertical size={14} />
          </span>
          <button
            title="More actions"
            onClick={(e) => {
              dispatch({ type: "select", id: node.id });
              const r = e.currentTarget.getBoundingClientRect();
              menu.open({ items: elementMenu(node), x: r.left, y: r.bottom + 4 });
            }}
          >
            <Ellipsis size={14} />
          </button>
        </div>
      )}
      {children}
      {selected && settings.boxModel && <BoxModelOverlay containerRef={ref} />}
    </div>
  );
}

/** Shown on the first page of an empty document. */
function EmptyHint() {
  const menu = useMenu();
  const insertItems = useInsertItems();
  return (
    <div className="ed-empty">
      <p>This document is empty.</p>
      <button
        className="btn btn-primary"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          menu.open({ items: insertItems(undefined), x: r.left, y: r.bottom + 4 });
        }}
      >
        <Plus size={14} /> Insert element
      </button>
      <p className="muted">or right-click the page, or use the Insert menu.</p>
    </div>
  );
}
