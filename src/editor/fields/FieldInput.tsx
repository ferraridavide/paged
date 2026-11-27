import { Component, useRef, type ReactNode } from "react";
import type { FieldDef } from "../../elements/types";
import type { PageOverrides } from "../../model/types";
import { SectionField } from "./SectionField";
import { applyPlainEdit, runsText, type Run } from "../../model/runs";
import { ColorInput, Row, Select, TextInput } from "./inputs";

type FieldProps = {
  field: FieldDef<any>;
  value: unknown;
  onChange: (v: unknown) => void;
};

/**
 * Renders one element parameter from its FieldDef. A missing value shows the
 * field's default (what the element renders with). A value of the wrong shape
 * (a hand-edited document, a component whose fields changed) breaks only this
 * field, not the editor.
 */
export function FieldInput({ field, value, onChange }: FieldProps) {
  return (
    <FieldBoundary label={field.label} value={value}>
      <FieldControl field={field} value={value ?? field.default} onChange={onChange} />
    </FieldBoundary>
  );
}

class FieldBoundary extends Component<
  { label: string; value: unknown; children: ReactNode },
  { error: Error | null; value: unknown }
> {
  state = { error: null as Error | null, value: this.props.value };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { value: unknown }, state: { value: unknown }) {
    // A new value (undo, another element) gets a fresh chance.
    return props.value !== state.value ? { error: null, value: props.value } : null;
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Row label={this.props.label}>
        <span className="row-help is-error">Can't edit this value here: {this.state.error.message}</span>
      </Row>
    );
  }
}

function FieldControl({ field, value, onChange }: FieldProps) {
  const help = field.help;

  switch (field.kind) {
    case "text":
      return (
        <Row label={field.label} help={help}>
          <TextInput value={String(value ?? "")} placeholder={field.placeholder} onChange={onChange} />
        </Row>
      );
    case "textarea":
      return (
        <Row label={field.label} help={help}>
          <textarea className="input" rows={5} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
        </Row>
      );
    case "runs":
      // Plain-text view of formatted runs; editing keeps the formatting of untouched text.
      return (
        <Row label={field.label} help={help}>
          <textarea
            className="input"
            rows={5}
            value={runsText((value as Run[]) ?? [])}
            onChange={(e) => onChange(applyPlainEdit((value as Run[]) ?? [], e.target.value))}
          />
        </Row>
      );
    case "lines":
      return (
        <Row label={field.label} help={help}>
          <textarea
            className="input"
            rows={5}
            value={(Array.isArray(value) ? value : []).join("\n")}
            onChange={(e) => onChange(e.target.value.split("\n"))}
          />
        </Row>
      );
    case "number":
      return (
        <Row label={field.label} help={help}>
          <input
            className="input"
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={Number(value ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </Row>
      );
    case "select":
      return (
        <Row label={field.label} help={help}>
          <Select
            value={String(value ?? "")}
            options={field.options}
            onChange={(v) => onChange(typeof value === "number" ? Number(v) : v)}
          />
        </Row>
      );
    case "section":
      return <SectionField value={(value as PageOverrides | null | undefined) ?? null} onChange={onChange} />;
    case "boolean":
      return (
        <label className="row row-inline">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <span className="row-label">{field.label}</span>
        </label>
      );
    case "color":
      return (
        <Row label={field.label} help={help}>
          <ColorInput value={String(value ?? "")} onChange={onChange} placeholder="default" />
        </Row>
      );
    case "image":
      return <ImageField label={field.label} value={String(value ?? "")} onChange={onChange} />;
    case "table":
      return <TableSizeField label={field.label} rows={Array.isArray(value) ? (value as string[][]) : [[""]]} onChange={onChange} />;
  }
}

function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isData = value.startsWith("data:");

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="row row-stack">
      <span className="row-label">{label}</span>
      {value && <img className="image-thumb" src={value} alt="" />}
      <input
        className="input"
        placeholder="https://…"
        value={isData ? "" : value}
        onChange={(e) => onChange(e.target.value)}
      />
      {isData && <span className="row-help">Embedded image (stored in the document)</span>}
      <span className="row-buttons">
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Upload…
        </button>
        {value && (
          <button type="button" className="btn" onClick={() => onChange("")}>
            Remove
          </button>
        )}
      </span>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}

function TableSizeField({ label, rows, onChange }: { label: string; rows: string[][]; onChange: (v: string[][]) => void }) {
  const cols = rows[0]?.length ?? 0;
  const addRow = () => onChange([...rows, Array(cols).fill("")]);
  const removeRow = () => rows.length > 1 && onChange(rows.slice(0, -1));
  const addCol = () => onChange(rows.map((r) => [...r, ""]));
  const removeCol = () => cols > 1 && onChange(rows.map((r) => r.slice(0, -1)));

  return (
    <div className="row row-stack">
      <span className="row-label">{label}</span>
      <div className="table-size">
        <span>Rows</span>
        <button type="button" className="btn" onClick={removeRow} disabled={rows.length <= 1}>
          −
        </button>
        <strong>{rows.length}</strong>
        <button type="button" className="btn" onClick={addRow}>
          +
        </button>
        <span>Columns</span>
        <button type="button" className="btn" onClick={removeCol} disabled={cols <= 1}>
          −
        </button>
        <strong>{cols}</strong>
        <button type="button" className="btn" onClick={addCol}>
          +
        </button>
      </div>
      <span className="row-help">Edit cell text directly in the canvas.</span>
    </div>
  );
}
