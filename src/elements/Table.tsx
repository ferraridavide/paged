import { useRef, useState } from "react";
import { EditableText } from "./EditableText";
import type { ElementComponentProps, ElementDefinition } from "./types";

/** Narrowest a column can be dragged, in percent of the table. */
const MIN_COL = 5;

export interface TableProps {
  rows: string[][];
  headerRow: boolean;
  striped: boolean;
  borderColor: string;
  headerBackground: string;
  cellPadding: string;
}

function Table({ node, mode, root, update, fragment }: ElementComponentProps<TableProps>) {
  const { rows, headerRow, striped, borderColor, headerBackground, cellPadding } = node.props;
  const offset = headerRow ? 1 : 0;
  const from = fragment?.from ?? offset;
  const to = fragment?.to ?? rows.length;

  const vars = {
    "--hd-table-border": borderColor || undefined,
    "--hd-table-head-bg": headerBackground || undefined,
    "--hd-cell-padding": cellPadding || undefined,
  } as React.CSSProperties;

  const setCell = (r: number, c: number, value: string) =>
    update({ rows: rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? value : cell)) : row)) });

  // Column widths (percent) are element state: set by dragging, not in the sidebar.
  const cols = rows[0]?.length ?? 0;
  const saved = node.state?.columnWidths as number[] | undefined;
  // While dragging, widths are previewed locally and saved once on release,
  // so one drag is one undo step.
  const [draft, setDraft] = useState<number[] | null>(null);
  const widths = draft ?? (saved?.length === cols ? saved : null);
  const tableRef = useRef<HTMLTableElement>(null);

  const startResize = (e: React.PointerEvent, c: number) => {
    e.preventDefault();
    e.stopPropagation();
    const table = tableRef.current;
    if (!table) return;
    // Client px → table px, so dragging stays right when the pages are zoomed.
    const scale = table.getBoundingClientRect().width / table.offsetWidth;
    const start = widths ?? Array<number>(cols).fill(100 / cols);
    const pair = start[c] + start[c + 1];
    const x0 = e.clientX;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    let last = start;
    const move = (ev: PointerEvent) => {
      const delta = ((ev.clientX - x0) / scale / table.offsetWidth) * 100;
      const left = Math.min(pair - MIN_COL, Math.max(MIN_COL, start[c] + delta));
      const next = [...start];
      next[c] = +left.toFixed(2);
      next[c + 1] = +(pair - left).toFixed(2);
      last = next;
      setDraft(next);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      if (last !== start) update({ $state: { columnWidths: last } } as never);
      setDraft(null);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  // In edit mode each cell holds its editable text plus, on the first row, a
  // resize handle on its right edge (absolutely positioned: no layout change).
  const firstRow = headerRow ? 0 : from;
  const cell = (Tag: "th" | "td", value: string, r: number, c: number) =>
    mode === "print" ? (
      <Tag key={c}>{value}</Tag>
    ) : (
      <Tag key={c}>
        <EditableText
          as="div"
          value={value}
          multiline
          caretKey={`${node.id}/rows/${r}/${c}`}
          onChange={(v) => setCell(r, c, v)}
        />
        {r === firstRow && c < cols - 1 && (
          <span
            className="ed-col-resize"
            title="Drag to resize columns · double-click to make them equal"
            onPointerDown={(e) => startResize(e, c)}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={() => update({ $state: { columnWidths: null } } as never)}
          />
        )}
      </Tag>
    );

  return (
    <table
      {...root}
      ref={tableRef}
      className={`${root.className}${striped ? " hd-table--striped" : ""}${widths ? " has-widths" : ""}`}
      style={vars}
    >
      {widths && (
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
      )}
      {/* The header row repeats on every page the table spans. */}
      {headerRow && rows[0] && (
        <thead>
          <tr>{rows[0].map((v, c) => cell("th", v, 0, c))}</tr>
        </thead>
      )}
      <tbody>
        {rows.slice(from, to).map((row, j) => (
          <tr key={from + j} className={(from + j - offset) % 2 ? "is-even" : undefined}>
            {row.map((v, c) => cell("td", v, from + j, c))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const tableElement: ElementDefinition<TableProps> = {
  type: "table",
  label: "Table",
  icon: "▦",
  group: "Data",
  create: () => ({
    props: {
      rows: [
        ["Item", "Qty", "Price"],
        ["", "", ""],
        ["", "", ""],
      ],
      headerRow: true,
      striped: false,
      borderColor: "",
      headerBackground: "",
      cellPadding: "",
    },
  }),
  fields: [
    { key: "rows", label: "Rows & columns", kind: "table" },
    { key: "headerRow", label: "First row is header", kind: "boolean" },
    { key: "striped", label: "Striped rows", kind: "boolean" },
    { key: "borderColor", label: "Border color", kind: "color" },
    { key: "headerBackground", label: "Header background", kind: "color" },
    { key: "cellPadding", label: "Cell padding", kind: "text", placeholder: "6px 8px" },
  ],
  summary: (p) => `${p.rows.length} × ${p.rows[0]?.length ?? 0}`,
  split: "rows",
  Component: Table,
};
