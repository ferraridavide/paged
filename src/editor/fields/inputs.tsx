import { useState, type ReactNode } from "react";

/** Small form primitives shared by the inspector panels. */

export function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-control">{children}</span>
      {help && <span className="row-help">{help}</span>}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <span className="color-input">
      <input type="color" value={HEX.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} />
      <input className="input" value={value} placeholder={placeholder ?? "inherit"} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented({
  value,
  onChange,
  options,
  allowEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; title?: string }[];
  allowEmpty?: boolean;
}) {
  return (
    <span className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title ?? o.label}
          className={value === o.value ? "is-on" : ""}
          onClick={() => onChange(allowEmpty && value === o.value ? "" : o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** A textarea that edits a local draft and only commits on blur. */
export function DraftTextarea({
  value,
  onCommit,
  rows = 6,
  placeholder,
  className = "input mono",
}: {
  value: string;
  onCommit: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <textarea
      className={className}
      rows={rows}
      spellCheck={false}
      placeholder={placeholder}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
    />
  );
}

export const FONT_FAMILIES = [
  { value: 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif', label: "Sans serif" },
  { value: 'Georgia, "Times New Roman", serif', label: "Serif" },
  { value: '"Iowan Old Style", "Palatino Linotype", Palatino, serif', label: "Book serif" },
  { value: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', label: "Monospace" },
];
