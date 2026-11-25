import type { ReactNode } from "react";
import { knownClasses } from "../model/css";
import { useEditor } from "../model/store";
import type { PageOverrides, PageSettings } from "../model/types";
import { ClassInput } from "./fields/ClassInput";
import { CssEditor } from "./fields/CssEditor";
import { ColorInput, FONT_FAMILIES, Row, Segmented, Select, TextInput } from "./fields/inputs";

interface Props {
  /** The effective settings (document defaults with any section overrides). */
  value: PageSettings;
  onChange: (patch: PageOverrides) => void;
  /** For a section: the settings it changes, highlighted. */
  overridden?: PageOverrides;
  /** Monaco model for this page CSS. */
  cssPath: string;
  /** Extra content at the top of the first group (e.g. the document title). */
  intro?: ReactNode;
}

/**
 * Page settings, shared by the document defaults and by each section:
 * page box, header and footer, look (background, classes), typography and
 * CSS that applies only inside these pages.
 */
export function PageSettingsForm({ value, onChange, overridden, cssPath, intro }: Props) {
  const { state } = useEditor();
  const set = (key: keyof PageSettings) => (overridden && key in overridden ? " is-set" : "");
  const field = (key: keyof PageSettings, label: string, control: ReactNode, help?: string) => (
    <div className={`style-row${set(key)}`}>
      <Row label={label} help={help}>
        {control}
      </Row>
    </div>
  );
  const toggle = (key: "header" | "footer" | "firstPageDifferent", label: string, checked: boolean) => (
    <label className={`row row-inline style-row${set(key)}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange({ [key]: e.target.checked })} />
      <span className="row-label">{label}</span>
    </label>
  );

  return (
    <>
      <details className="section" open>
        <summary>Page</summary>
        {intro}
        {field(
          "size",
          "Size",
          <Select
            value={value.size}
            onChange={(size) => onChange({ size: size as PageSettings["size"] })}
            options={["A4", "A5", "Letter", "Legal"].map((v) => ({ value: v, label: v }))}
          />,
        )}
        {field(
          "orientation",
          "Orientation",
          <Segmented
            value={value.orientation}
            onChange={(o) => onChange({ orientation: o as PageSettings["orientation"] })}
            options={[
              { value: "portrait", label: "Portrait" },
              { value: "landscape", label: "Landscape" },
            ]}
          />,
        )}
        <div className={`margin-grid style-row${set("margin")}`}>
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <Row key={side} label={`Margin ${side}`}>
              <TextInput value={value.margin[side]} onChange={(v) => onChange({ margin: { ...value.margin, [side]: v } })} />
            </Row>
          ))}
        </div>
      </details>

      <details className="section" open>
        <summary>Header & footer</summary>
        {toggle("header", "Show the header", value.header !== false)}
        {toggle("footer", "Show the footer", value.footer !== false)}
        {toggle("firstPageDifferent", "No header or footer on the first page", !!value.firstPageDifferent)}
      </details>

      <details className="section" open>
        <summary>Look</summary>
        {field("background", "Background", <ColorInput value={value.background ?? ""} onChange={(background) => onChange({ background })} placeholder="white" />)}
        <div className={`style-row${set("classes")}`}>
          <Row label="Page classes" help="Style what's inside these pages from Document CSS, e.g. .cover .hd-heading">
            <ClassInput classes={value.classes ?? []} known={knownClasses(state.doc)} onChange={(classes) => onChange({ classes })} />
          </Row>
        </div>
      </details>

      <details className="section" open>
        <summary>Typography</summary>
        {field(
          "fontFamily",
          "Font",
          <Select
            value={value.fontFamily}
            onChange={(fontFamily) => onChange({ fontFamily })}
            options={
              FONT_FAMILIES.some((f) => f.value === value.fontFamily)
                ? FONT_FAMILIES
                : [{ value: value.fontFamily, label: "Custom" }, ...FONT_FAMILIES]
            }
          />,
        )}
        {field("fontSize", "Size", <TextInput value={value.fontSize} onChange={(fontSize) => onChange({ fontSize })} />)}
        {field("lineHeight", "Line height", <TextInput value={value.lineHeight} onChange={(lineHeight) => onChange({ lineHeight })} />)}
        {field("color", "Color", <ColorInput value={value.color} onChange={(color) => onChange({ color })} />)}
      </details>

      <details className="section" open>
        <summary>Page CSS</summary>
        <p className="muted">
          Applies only inside these pages, e.g. <code>.hd-heading {"{"} font-size: 32pt; {"}"}</code>.
        </p>
        <div className={`style-row${set("css")}`}>
          <CssEditor kind="stylesheet" path={cssPath} height={160} value={value.css ?? ""} onChange={(css) => css !== (value.css ?? "") && onChange({ css })} />
        </div>
      </details>
    </>
  );
}
