import { styleToText, textToStyle } from "../../model/css";
import type { StyleMap } from "../../model/types";
import { CssEditor } from "./CssEditor";
import { ColorInput, FONT_FAMILIES, Row, Segmented, Select, TextInput } from "./inputs";

type Control =
  | { prop: string; label: string; kind: "text"; placeholder?: string }
  | { prop: string; label: string; kind: "color" }
  | { prop: string; label: string; kind: "select"; options: { value: string; label: string }[] }
  | { prop: string; label: string; kind: "segmented"; options: { value: string; label: string; title?: string }[] };

const opts = (values: string[]) => [{ value: "", label: "—" }, ...values.map((v) => ({ value: v, label: v }))];

/** The curated controls. Anything else can be typed in the CSS box below them. */
const SECTIONS: { title: string; controls: Control[] }[] = [
  {
    title: "Typography",
    controls: [
      { prop: "font-family", label: "Font", kind: "select", options: [{ value: "", label: "Inherit" }, ...FONT_FAMILIES] },
      { prop: "font-size", label: "Size", kind: "text", placeholder: "e.g. 12pt" },
      { prop: "font-weight", label: "Weight", kind: "select", options: opts(["300", "400", "500", "600", "700", "800"]) },
      { prop: "font-style", label: "Style", kind: "select", options: opts(["normal", "italic"]) },
      { prop: "line-height", label: "Line height", kind: "text", placeholder: "e.g. 1.4" },
      { prop: "letter-spacing", label: "Letter spacing", kind: "text", placeholder: "e.g. 0.02em" },
      {
        prop: "text-align",
        label: "Align",
        kind: "segmented",
        options: [
          { value: "left", label: "L", title: "Left" },
          { value: "center", label: "C", title: "Center" },
          { value: "right", label: "R", title: "Right" },
          { value: "justify", label: "J", title: "Justify" },
        ],
      },
      { prop: "text-transform", label: "Case", kind: "select", options: opts(["none", "uppercase", "lowercase", "capitalize"]) },
      { prop: "color", label: "Color", kind: "color" },
    ],
  },
  {
    title: "Spacing",
    controls: [
      { prop: "margin-top", label: "Margin top", kind: "text", placeholder: "e.g. 6mm" },
      { prop: "margin-bottom", label: "Margin bottom", kind: "text", placeholder: "e.g. 6mm" },
      { prop: "margin-left", label: "Margin left", kind: "text" },
      { prop: "margin-right", label: "Margin right", kind: "text" },
      { prop: "padding", label: "Padding", kind: "text", placeholder: "e.g. 4mm 6mm" },
    ],
  },
  {
    title: "Box",
    controls: [
      { prop: "width", label: "Width", kind: "text", placeholder: "e.g. 60%" },
      { prop: "background-color", label: "Background", kind: "color" },
      { prop: "border", label: "Border", kind: "text", placeholder: "1px solid #ccc" },
      { prop: "border-radius", label: "Radius", kind: "text", placeholder: "e.g. 4px" },
    ],
  },
  {
    title: "Pagination",
    controls: [
      { prop: "break-before", label: "Break before", kind: "select", options: opts(["auto", "page", "avoid"]) },
      { prop: "break-after", label: "Break after", kind: "select", options: opts(["auto", "page", "avoid"]) },
      { prop: "break-inside", label: "Break inside", kind: "select", options: opts(["auto", "avoid"]) },
    ],
  },
];

/** Per-element CSS. Every change produces a new StyleMap; empty values remove the property. */
export function StyleEditor({
  elementId,
  style,
  onChange,
}: {
  elementId: string;
  style: StyleMap;
  onChange: (s: StyleMap) => void;
}) {
  const set = (prop: string, value: string) => {
    const next = { ...style };
    if (value.trim()) next[prop] = value;
    else delete next[prop];
    onChange(next);
  };

  return (
    <div className="style-editor">
      {SECTIONS.map((section) => (
        <details key={section.title} className="section" open>
          <summary>{section.title}</summary>
          {section.controls.map((c) => {
            const value = style[c.prop] ?? "";
            const isSet = value !== "";
            return (
              <div key={c.prop} className={`style-row${isSet ? " is-set" : ""}`}>
                <Row label={c.label}>
                  {c.kind === "text" && <TextInput value={value} placeholder={c.placeholder} onChange={(v) => set(c.prop, v)} />}
                  {c.kind === "color" && <ColorInput value={value} onChange={(v) => set(c.prop, v)} />}
                  {c.kind === "select" && <Select value={value} options={c.options} onChange={(v) => set(c.prop, v)} />}
                  {c.kind === "segmented" && (
                    <Segmented value={value} options={c.options} allowEmpty onChange={(v) => set(c.prop, v)} />
                  )}
                </Row>
              </div>
            );
          })}
        </details>
      ))}

      <details className="section" open>
        <summary>CSS</summary>
        <p className="muted">
          Every style on this element as CSS. Add any property here, e.g. <code>box-shadow</code> or{" "}
          <code>column-count</code>. Applies as you type.
        </p>
        <CssEditor
          kind="declarations"
          path={`inmemory://paged/elements/${elementId}.css`}
          value={styleToText(style)}
          onChange={(text) => {
            const next = textToStyle(text);
            if (JSON.stringify(next) !== JSON.stringify(style)) onChange(next);
          }}
        />
        {Object.keys(style).length > 0 && (
          <button type="button" className="btn" onClick={() => onChange({})}>
            Clear all styles
          </button>
        )}
      </details>
    </div>
  );
}
