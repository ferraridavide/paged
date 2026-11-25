/**
 * Formatting the selected text of a paragraph. Tracks the current selection
 * inside a rich-text field (as paragraph offsets) and applies marks to it,
 * splitting the paragraph's runs at the selection's edges.
 */
import { useSyncExternalStore } from "react";
import { getSelectionOffsets, requestSelection } from "../layout/caret";
import { applyMarks, commonMark, everyMarked, propsRuns, type Marks } from "../model/runs";
import { useEditor } from "../model/store";

export interface RichSelection {
  nodeId: string;
  caretKey: string;
  /** Paragraph offsets (fragment base already added). */
  start: number;
  end: number;
  /** Viewport rect of the selection, for positioning the format bar. */
  rect: DOMRect;
}

let current: RichSelection | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(): RichSelection | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
  const host = anchor?.closest<HTMLElement>("[data-rich]");
  if (!host) return null;
  const offsets = getSelectionOffsets(host);
  const nodeId = host.dataset.nodeId ?? host.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
  if (!offsets || !nodeId) return null;
  const base = Number(host.dataset.caretBase ?? 0);
  return {
    nodeId,
    caretKey: host.dataset.caretKey ?? `${nodeId}/text`,
    start: base + offsets.start,
    end: base + offsets.end,
    rect: sel.getRangeAt(0).getBoundingClientRect(),
  };
}

function update() {
  // While a format bar control has focus (a font menu, a colour picker), keep
  // the last text selection so the control applies to it.
  if (document.activeElement?.closest(".format-bar")) return;
  const next = read();
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  emit();
}

if (typeof document !== "undefined") {
  document.addEventListener("selectionchange", update);
  window.addEventListener("scroll", update, true);
  window.addEventListener("resize", update);
}

export function useRichSelection() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

export type ToggleMark = "bold" | "italic" | "underline" | "strike";

const isOn: Record<ToggleMark, (m: Marks) => boolean> = {
  bold: (m) => Number(m.weight ?? 400) >= 600,
  italic: (m) => !!m.italic,
  underline: (m) => !!m.underline,
  strike: (m) => !!m.strike,
};

/** Formatting actions for the current text selection. */
export function useRichFormat() {
  const sel = useRichSelection();
  const { state, dispatch } = useEditor();
  const node = sel ? state.doc.elements.find((n) => n.id === sel.nodeId) : undefined;
  const runs = node ? propsRuns(node.props) : [];
  const active = !!sel && !!node && sel.end > sel.start;

  const apply = (fn: (m: Marks) => Marks) => {
    if (!active || !sel || !node) return;
    dispatch({ type: "updateProps", id: node.id, patch: { runs: applyMarks(runs, sel.start, sel.end, fn) } });
    requestSelection(sel.caretKey, sel.start, sel.end);
  };

  return {
    selection: sel,
    active,
    isOn: (mark: ToggleMark) => active && everyMarked(runs, sel!.start, sel!.end, isOn[mark]),
    /** The value shared by the whole selection, or undefined when mixed. */
    value: <K extends keyof Marks>(key: K) => (active ? commonMark(runs, sel!.start, sel!.end, key) : undefined),
    toggle: (mark: ToggleMark) => {
      if (!active) return;
      const on = everyMarked(runs, sel!.start, sel!.end, isOn[mark]);
      apply((m) => (mark === "bold" ? { ...m, weight: on ? undefined : "700" } : { ...m, [mark]: on ? undefined : true }));
    },
    set: <K extends keyof Marks>(key: K, value: Marks[K] | "") => apply((m) => ({ ...m, [key]: value || undefined })),
    clear: () => apply(() => ({})),
  };
}

export type RichFormat = ReturnType<typeof useRichFormat>;
