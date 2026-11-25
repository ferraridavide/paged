import { createElement, useEffect, useLayoutEffect, useRef, type HTMLAttributes } from "react";
import { getSelectionOffsets, recordCaret, setSelectionOffsets } from "../layout/caret";
import { insertText, marksStyle, normalizeRuns, replaceRange, runsText, type Marks, type Run } from "../model/runs";

type Props = Omit<HTMLAttributes<HTMLElement>, "onChange"> & {
  as?: string;
  runs: Run[];
  onChange: (runs: Run[]) => void;
  placeholder?: string;
  /** Identifies the field so the caret survives re-layouts (node + "/text"). */
  caretKey: string;
  /** Offset of this fragment in the whole paragraph, for split paragraphs. */
  caretBase?: number;
};

/** Builds the editable DOM for runs: one <span> per run, carrying its marks. */
function renderRuns(host: HTMLElement, runs: Run[]) {
  host.textContent = "";
  for (const run of runs) {
    const span = document.createElement("span");
    if (run.marks) {
      span.dataset.marks = JSON.stringify(run.marks);
      // Only set marks that are present: assigning undefined would set the
      // literal value "undefined" (a valid font-family name, for instance).
      for (const [prop, value] of Object.entries(marksStyle(run.marks) ?? {})) {
        if (value !== undefined) (span.style as unknown as Record<string, string>)[prop] = String(value);
      }
    }
    span.textContent = run.text;
    host.appendChild(span);
  }
}

/** Reads runs back from the DOM after the browser edited it (typing, native deletes). */
function readRuns(host: HTMLElement): Run[] {
  const runs: Run[] = [];
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child instanceof Text) {
        const owner = child.parentElement?.closest<HTMLElement>("[data-marks]");
        const marks = owner && host.contains(owner) ? (JSON.parse(owner.dataset.marks!) as Marks) : undefined;
        runs.push({ text: child.data, marks });
      } else if (child instanceof HTMLBRElement) {
        // A trailing <br> is the browser's placeholder in an emptied editable, not a line break.
        if (child !== host.lastChild && child.nextSibling) runs.push({ text: "\n" });
      } else {
        walk(child);
      }
    }
  };
  walk(host);
  return normalizeRuns(runs);
}

const same = (a: Run[], b: Run[]) => JSON.stringify(normalizeRuns(a)) === JSON.stringify(normalizeRuns(b));

/**
 * A paragraph of formatted inline runs, editable in place.
 *
 * Plain typing and single-character deletes are left to the browser (fast,
 * and right for input methods) and read back from the DOM. Edits that would
 * make the browser restructure the markup (Enter, paste, replacing or
 * deleting a selection, formatting shortcuts) are applied to the runs
 * instead, and the DOM is rebuilt from them.
 */
export function RichText({ as = "p", runs, onChange, placeholder, caretKey, caretBase = 0, ...rest }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const composing = useRef(false);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const latest = useRef({ runs, onChange });
  latest.current = { runs, onChange };

  // Rebuild the DOM only when the runs differ from what it already shows.
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host || composing.current) return;
    const pending = pendingSelection.current;
    pendingSelection.current = null;
    if (same(readRuns(host), runs)) {
      if (pending && document.activeElement === host) setSelectionOffsets(host, pending.start, pending.end);
      return;
    }
    // Rebuilding replaces the text nodes: keep the selection where it was.
    const selection = pending ?? (document.activeElement === host ? getSelectionOffsets(host) : null);
    renderRuns(host, runs);
    if (selection && document.activeElement === host) setSelectionOffsets(host, selection.start, selection.end);
  }, [runs]);

  // Structural edits go through the model (native beforeinput gives us inputType).
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const onBeforeInput = (e: InputEvent) => {
      if (composing.current || e.isComposing) return;
      const sel = getSelectionOffsets(host);
      if (!sel) return;
      const { runs: current, onChange: change } = latest.current;
      const { start, end } = sel;
      const commit = (next: Run[], caret: number) => {
        e.preventDefault();
        pendingSelection.current = { start: caret, end: caret };
        change(next);
      };

      switch (e.inputType) {
        case "insertParagraph":
        case "insertLineBreak":
          return commit(insertText(current, start, "\n", end), start + 1);
        case "insertText":
        case "insertReplacementText":
          if (start !== end) return commit(insertText(current, start, e.data ?? "", end), start + (e.data ?? "").length);
          return;
        case "insertFromPaste":
        case "insertFromDrop": {
          const text = (e.dataTransfer?.getData("text/plain") ?? "").replace(/\r\n?/g, "\n");
          return commit(insertText(current, start, text, end), start + text.length);
        }
        case "deleteByCut":
          return commit(replaceRange(current, start, end, []), start);
        default:
          if (e.inputType.startsWith("delete") && start !== end) return commit(replaceRange(current, start, end, []), start);
          // The editor handles formatting and undo itself.
          if (e.inputType.startsWith("format") || e.inputType.startsWith("history")) e.preventDefault();
      }
    };
    host.addEventListener("beforeinput", onBeforeInput);
    return () => host.removeEventListener("beforeinput", onBeforeInput);
  }, []);

  const emit = (host: HTMLElement) => {
    recordCaret(host);
    onChange(readRuns(host));
  };

  return createElement(as, {
    ...rest,
    ref,
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: true,
    "data-placeholder": placeholder,
    "data-editable": "",
    "data-rich": "",
    "data-caret-key": caretKey,
    "data-caret-base": caretBase,
    "data-length": runsText(runs).length,
    onInput: (e: React.FormEvent<HTMLElement>) => {
      if (!composing.current) emit(e.currentTarget);
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (e: React.CompositionEvent<HTMLElement>) => {
      composing.current = false;
      emit(e.currentTarget);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      // ⌘/Ctrl+Enter is the editor's "text below" shortcut, not a line break.
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.preventDefault();
    },
  });
}
