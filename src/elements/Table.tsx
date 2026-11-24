import { EditableText } from "./EditableText";
import type { ElementComponentProps, ElementDefinition } from "./types";

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

  const cell = (Tag: "th" | "td", value: string, r: number, c: number) =>
    mode === "print" ? (
      <Tag key={c}>{value}</Tag>
    ) : (
      <EditableText
        key={c}
        as={Tag}
        value={value}
        multiline
        caretKey={`${node.id}/rows/${r}/${c}`}
        onChange={(v) => setCell(r, c, v)}
      />
    );

  return (
    <table {...root} className={`${root.className}${striped ? " hd-table--striped" : ""}`} style={vars}>
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
