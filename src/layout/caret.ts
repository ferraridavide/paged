/**
 * Keeps the text caret where the user expects it while pages are re-laid out.
 *
 * Editable fields carry `data-caret-key` (node + field) and `data-caret-base`
 * (where this fragment starts inside the field). We remember the caret as
 * "key + offset in the whole field", so after a re-layout moves text to
 * another page, or remounts the fragment, the caret can be put back in the
 * right fragment.
 */

interface CaretRecord {
  key: string;
  /** Offset within the whole field. */
  offset: number;
  /** Start of the fragment the caret was in. */
  base: number;
  /**
   * The page it was on. Header/footer fields are on every page under the same
   * key, so this picks the copy being typed in.
   */
  page?: string;
}

let last: CaretRecord | null = null;
let pending: { key: string; offset: number; end?: number } | null = null;

export function caretRecord() {
  return last;
}

/** Text of an editable element, with line breaks as "\n". */
export function readText(el: HTMLElement) {
  return el.innerText;
}

export function getCaretOffset(el: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.endContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.endContainer, r.endOffset);
  return pre.toString().length;
}

/** Text offset of a DOM position inside `el`, counting characters across inline elements. */
export function offsetIn(el: HTMLElement, node: Node, offset: number) {
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(node, offset);
  return pre.toString().length;
}

/** The selection inside `el` as text offsets, or null if it isn't there. */
export function getSelectionOffsets(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
  return { start: offsetIn(el, r.startContainer, r.startOffset), end: offsetIn(el, r.endContainer, r.endOffset) };
}

function positionAt(el: HTMLElement, offset: number): [Node, number] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let lastText: Text | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    if (remaining <= t.data.length) return [t, remaining];
    remaining -= t.data.length;
    lastText = t;
  }
  return lastText ? [lastText, lastText.data.length] : [el, el.childNodes.length];
}

/** Selects text offsets [start, end) inside `el`. */
export function setSelectionOffsets(el: HTMLElement, start: number, end: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStart(...positionAt(el, start));
  range.setEnd(...positionAt(el, end));
  sel.removeAllRanges();
  sel.addRange(range);
}

export function setCaretOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node: Node | null;
  let placed = false;
  while ((node = walker.nextNode())) {
    const len = (node as Text).data.length;
    if (remaining <= len) {
      range.setStart(node, remaining);
      placed = true;
      break;
    }
    remaining -= len;
  }
  if (!placed) range.selectNodeContents(el), range.collapse(false);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function caretTarget(node: Node | null) {
  const el = node instanceof Element ? node : node?.parentElement;
  return el?.closest<HTMLElement>("[data-caret-key]") ?? null;
}

/** Records the caret of an editable element. Called on every input and selection change. */
export function recordCaret(el: HTMLElement) {
  const key = el.dataset.caretKey;
  const local = getCaretOffset(el);
  if (!key || local === null) return;
  const base = Number(el.dataset.caretBase ?? 0);
  last = { key, offset: base + local, base, page: el.closest<HTMLElement>(".pd-page")?.dataset.page };
}

/** Ask for the caret to go to `offset` in field `key` once that field is on screen. */
export function requestCaret(key: string, offset: number) {
  pending = { key, offset };
}

/** Ask for [start, end) to be selected in field `key` after the next layout (e.g. after formatting). */
export function requestSelection(key: string, start: number, end: number) {
  pending = { key, offset: start, end };
}

if (typeof document !== "undefined") {
  document.addEventListener("selectionchange", () => {
    const el = caretTarget(window.getSelection()?.focusNode ?? null);
    if (el) recordCaret(el);
  });
  // A mouse click is a deliberate move: stop chasing the old caret.
  document.addEventListener("mousedown", () => {
    last = null;
  });
}

/**
 * After a re-layout: if the caret's field moved to another fragment (or was
 * remounted), focus the fragment that now contains the remembered offset.
 */
export function restoreCaret(root: HTMLElement | null) {
  if (!root) return;
  const target = pending ?? last;
  if (!target) return;

  const page = last?.page;
  const onPage = (el: HTMLElement) => (page !== undefined && el.closest<HTMLElement>(".pd-page")?.dataset.page === page ? 0 : 1);
  // Copies on the caret's page first (the same field repeats in every page's header).
  const candidates = [...root.querySelectorAll<HTMLElement>(`[data-caret-key="${CSS.escape(target.key)}"]`)].sort(
    (a, b) => onPage(a) - onPage(b),
  );
  if (!candidates.length) return; // not rendered yet; keep `pending` for the next layout

  const lengthOf = (el: HTMLElement) => readText(el).length;
  const baseOf = (el: HTMLElement) => Number(el.dataset.caretBase ?? 0);
  const el =
    candidates.find((c) => target.offset >= baseOf(c) && target.offset < baseOf(c) + lengthOf(c)) ??
    candidates.find((c) => target.offset >= baseOf(c) && target.offset <= baseOf(c) + lengthOf(c)) ??
    // Past every fragment: the last one (sorting is stable, so the caret's page wins ties).
    [...candidates].sort((a, b) => baseOf(b) - baseOf(a))[0];

  const active = document.activeElement;
  const lostFocus = !active || active === document.body;
  // Only take over when focus was lost to a remount, the caret's text moved to
  // another fragment, or a component explicitly asked for it.
  if (!pending && !lostFocus && active !== el && !candidates.includes(active as HTMLElement)) return;
  if (!pending && active === el) return;

  const end = pending?.end;
  pending = null;
  el.focus({ preventScroll: true });
  const clamp = (n: number) => Math.max(0, Math.min(n - baseOf(el), lengthOf(el)));
  if (end !== undefined) setSelectionOffsets(el, clamp(target.offset), clamp(end));
  else setCaretOffset(el, clamp(target.offset));
  el.scrollIntoView({ block: "nearest" });
}
