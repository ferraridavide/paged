import { Baseline, Highlighter, Italic, RemoveFormatting, Strikethrough, Underline } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { FONT_FAMILIES } from "./fields/inputs";
import type { RichFormat } from "./richFormat";
import { useUi } from "./ui";

const SIZES = ["8pt", "9pt", "10pt", "11pt", "12pt", "13pt", "14pt", "16pt", "18pt", "20pt", "24pt", "28pt", "32pt", "40pt", "48pt"];
const WEIGHTS = [
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra bold" },
  { value: "900", label: "Black" },
];
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Floating toolbar above selected paragraph text: font, size, weight,
 * bold/italic/underline/strike, text and highlight colour, clear.
 */
export function FormatBar({ format }: { format: RichFormat }) {
  const ui = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const rect = format.selection?.rect;
  const show = format.active && ui.settings.mode === "edit" && !!rect;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!show || !el || !rect) return setPos(null);
    const { width, height } = el.getBoundingClientRect();
    let top = rect.top - height - 8;
    if (top < 64) top = rect.bottom + 8; // no room above: show below the selection
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2));
    setPos({ left, top });
  }, [show, rect?.top, rect?.left, rect?.width, rect?.bottom]);

  if (!show) return null;

  // Buttons must not take focus, or the text selection would be lost.
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const family = format.value("family") ?? "";
  const size = format.value("size") ?? "";
  const weight = format.value("weight") ?? "";
  const color = format.value("color");
  const background = format.value("background");

  return (
    <div
      ref={ref}
      className="format-bar"
      role="toolbar"
      aria-label="Text formatting"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      <select className="format-select format-family" value={family} onChange={(e) => format.set("family", e.target.value)} title="Font">
        <option value="">Font</option>
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <select className="format-select" value={size} onChange={(e) => format.set("size", e.target.value)} title="Size">
        <option value="">Size</option>
        {SIZES.map((s) => (
          <option key={s} value={s}>
            {s.replace("pt", "")}
          </option>
        ))}
      </select>
      <select className="format-select" value={weight} onChange={(e) => format.set("weight", e.target.value)} title="Weight">
        <option value="">Weight</option>
        {WEIGHTS.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
      <span className="format-sep" />
      <button className={format.isOn("bold") ? "is-on" : ""} onMouseDown={keep} onClick={() => format.toggle("bold")} title="Bold (⌘B)">
        <span className="format-bold">B</span>
      </button>
      <button className={format.isOn("italic") ? "is-on" : ""} onMouseDown={keep} onClick={() => format.toggle("italic")} title="Italic (⌘I)">
        <Italic size={15} />
      </button>
      <button
        className={format.isOn("underline") ? "is-on" : ""}
        onMouseDown={keep}
        onClick={() => format.toggle("underline")}
        title="Underline (⌘U)"
      >
        <Underline size={15} />
      </button>
      <button
        className={format.isOn("strike") ? "is-on" : ""}
        onMouseDown={keep}
        onClick={() => format.toggle("strike")}
        title="Strikethrough (⇧⌘X)"
      >
        <Strikethrough size={15} />
      </button>
      <span className="format-sep" />
      <label className="format-color" title="Text colour">
        <Baseline size={15} />
        <span className="format-swatch" style={{ background: color ?? "var(--text)" }} />
        <input type="color" value={color && HEX.test(color) ? color : "#000000"} onChange={(e) => format.set("color", e.target.value)} />
      </label>
      <label className="format-color" title="Highlight">
        <Highlighter size={15} />
        <span className="format-swatch" style={{ background: background ?? "transparent" }} />
        <input
          type="color"
          value={background && HEX.test(background) ? background : "#fef08a"}
          onChange={(e) => format.set("background", e.target.value)}
        />
      </label>
      <span className="format-sep" />
      <button onMouseDown={keep} onClick={format.clear} title="Clear formatting">
        <RemoveFormatting size={15} />
      </button>
    </div>
  );
}
