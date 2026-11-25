/**
 * Rich text as a list of inline runs: consecutive pieces of text, each with
 * its own formatting ("marks"). Formatting a selection splits the runs at the
 * selection's edges and changes the marks of the runs in between:
 *
 *   [the quick brown fox jumps]        select "fox", Bold
 *   [the quick brown ][fox][ jumps]    → the middle run gets { weight: "700" }
 *
 * Offsets are character offsets into the paragraph's plain text. Runs render
 * as inline <span>s, so they wrap and paginate like ordinary text.
 */
import type { CSSProperties } from "react";

export interface Marks {
  /** CSS font-weight, e.g. "700" for bold. */
  weight?: string;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  family?: string;
  /** CSS font-size, e.g. "14pt". */
  size?: string;
  color?: string;
  background?: string;
}

export interface Run {
  text: string;
  marks?: Marks;
}

export const runsText = (runs: Run[]) => runs.map((r) => r.text).join("");

function cleanMarks(marks: Marks | undefined): Marks | undefined {
  if (!marks) return undefined;
  const out: Marks = {};
  for (const [k, v] of Object.entries(marks) as [keyof Marks, Marks[keyof Marks]][]) {
    if (v !== undefined && v !== "" && v !== false && v !== null) (out as Record<string, unknown>)[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

const marksKey = (m: Marks | undefined) => JSON.stringify(Object.entries(cleanMarks(m) ?? {}).sort(([a], [b]) => a.localeCompare(b)));
export const sameMarks = (a: Marks | undefined, b: Marks | undefined) => marksKey(a) === marksKey(b);

/** Drops empty runs and merges neighbours with identical marks. */
export function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const marks = cleanMarks(r.marks);
    const prev = out[out.length - 1];
    if (prev && sameMarks(prev.marks, marks)) prev.text += r.text;
    else out.push(marks ? { text: r.text, marks } : { text: r.text });
  }
  return out;
}

/** Splits runs so that a run boundary falls exactly at `offset`. */
function splitAt(runs: Run[], offset: number): Run[] {
  const out: Run[] = [];
  let pos = 0;
  for (const r of runs) {
    const end = pos + r.text.length;
    if (offset > pos && offset < end) {
      out.push({ ...r, text: r.text.slice(0, offset - pos) }, { ...r, text: r.text.slice(offset - pos) });
    } else {
      out.push(r);
    }
    pos = end;
  }
  return out;
}

/** The runs covering [from, to). */
export function sliceRuns(runs: Run[], from: number, to: number): Run[] {
  const out: Run[] = [];
  let pos = 0;
  for (const r of runs) {
    const end = pos + r.text.length;
    const a = Math.max(from, pos);
    const b = Math.min(to, end);
    if (b > a) out.push({ ...r, text: r.text.slice(a - pos, b - pos) });
    pos = end;
  }
  return out;
}

/** Replaces [from, to) with `insert`. */
export function replaceRange(runs: Run[], from: number, to: number, insert: Run[]): Run[] {
  const total = runsText(runs).length;
  return normalizeRuns([...sliceRuns(runs, 0, from), ...insert, ...sliceRuns(runs, to, total)]);
}

/** Marks for text typed at `offset`: those of the character before it, like a word processor. */
export function marksAt(runs: Run[], offset: number): Marks | undefined {
  let pos = 0;
  for (const r of runs) {
    const end = pos + r.text.length;
    if (offset > pos && offset <= end) return r.marks;
    pos = end;
  }
  return runs[0]?.marks;
}

/** Inserts plain text at `offset` (replacing [offset, to) if given), continuing the surrounding formatting. */
export function insertText(runs: Run[], offset: number, text: string, to = offset): Run[] {
  return replaceRange(runs, offset, to, [{ text, marks: marksAt(runs, offset) }]);
}

/** Applies `fn` to the marks of every run inside [from, to), splitting runs at the edges. */
export function applyMarks(runs: Run[], from: number, to: number, fn: (m: Marks) => Marks): Run[] {
  if (to <= from) return runs;
  const split = splitAt(splitAt(runs, from), to);
  let pos = 0;
  const out = split.map((r) => {
    const start = pos;
    pos += r.text.length;
    return start >= from && pos <= to ? { ...r, marks: fn({ ...(r.marks ?? {}) }) } : r;
  });
  return normalizeRuns(out);
}

/** True if every character in [from, to) has `test(marks)`. */
export function everyMarked(runs: Run[], from: number, to: number, test: (m: Marks) => boolean): boolean {
  const covered = sliceRuns(runs, from, to);
  return covered.length > 0 && covered.every((r) => test(r.marks ?? {}));
}

/** The value of a mark if it's the same across [from, to), else undefined (mixed). */
export function commonMark<K extends keyof Marks>(runs: Run[], from: number, to: number, key: K): Marks[K] | undefined {
  const covered = from === to ? [{ text: "", marks: marksAt(runs, from) }] : sliceRuns(runs, from, to);
  const values = new Set(covered.map((r) => r.marks?.[key]));
  return values.size === 1 ? [...values][0] : undefined;
}

/**
 * Applies a plain-text edit (e.g. from the sidebar textarea) while keeping the
 * formatting of the unchanged parts: only the differing middle is replaced.
 */
export function applyPlainEdit(runs: Run[], next: string): Run[] {
  const prev = runsText(runs);
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  return insertText(runs, start, next.slice(start, endNext), endPrev);
}

/** CSS for a run's marks. */
export function marksStyle(m: Marks | undefined): CSSProperties | undefined {
  if (!m) return undefined;
  const decoration = [m.underline && "underline", m.strike && "line-through"].filter(Boolean).join(" ");
  return {
    fontWeight: m.weight,
    fontStyle: m.italic ? "italic" : undefined,
    textDecorationLine: decoration || undefined,
    fontFamily: m.family,
    fontSize: m.size,
    color: m.color,
    backgroundColor: m.background,
  };
}

/** Runs for a text element's props, upgrading the older plain `text` prop. */
export function propsRuns(props: Record<string, unknown>): Run[] {
  if (Array.isArray(props.runs)) return props.runs as Run[];
  return typeof props.text === "string" && props.text ? [{ text: props.text }] : [];
}
