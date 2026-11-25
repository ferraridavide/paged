import { describeOverrides } from "../layout/sections";
import type { PageOverrides } from "../model/types";
import type { ElementComponentProps, ElementDefinition } from "./types";

/* ---------- Divider ---------- */

export interface DividerProps {
  thickness: number;
  color: string;
  lineStyle: "solid" | "dashed" | "dotted" | "double";
}

function Divider({ node, root }: ElementComponentProps<DividerProps>) {
  const { thickness, color, lineStyle } = node.props;
  return (
    <hr
      {...root}
      style={{ borderTop: `${lineStyle === "double" ? Math.max(3, thickness) : thickness}px ${lineStyle} ${color || "currentColor"}` }}
    />
  );
}

export const dividerElement: ElementDefinition<DividerProps> = {
  type: "divider",
  label: "Divider",
  icon: "—",
  group: "Layout",
  create: () => ({ props: { thickness: 1, color: "#d1d5db", lineStyle: "solid" } }),
  fields: [
    { key: "thickness", label: "Thickness (px)", kind: "number", min: 1, max: 20 },
    { key: "color", label: "Color", kind: "color" },
    {
      key: "lineStyle",
      label: "Line",
      kind: "select",
      options: ["solid", "dashed", "dotted", "double"].map((v) => ({ value: v, label: v })),
    },
  ],
  Component: Divider,
};

/* ---------- Spacer ---------- */

export interface SpacerProps {
  height: string;
}

function Spacer({ node, mode, root }: ElementComponentProps<SpacerProps>) {
  return (
    <div {...root} style={{ height: node.props.height }} aria-hidden>
      {mode === "edit" && <span className="ed-badge">Spacer · {node.props.height}</span>}
    </div>
  );
}

export const spacerElement: ElementDefinition<SpacerProps> = {
  type: "spacer",
  label: "Spacer",
  icon: "↕",
  group: "Layout",
  create: () => ({ props: { height: "10mm" } }),
  fields: [{ key: "height", label: "Height", kind: "text", placeholder: "10mm" }],
  summary: (p) => p.height,
  Component: Spacer,
};

/* ---------- Page break ---------- */

export interface PageBreakProps {
  /** When set, the break starts a section with these page settings changes. */
  section?: PageOverrides | null;
}

function PageBreak({ node, mode, root }: ElementComponentProps<PageBreakProps>) {
  const section = node.props.section;
  // Zero height in both modes; the editor badge floats so it takes no space.
  return (
    <div {...root} className={`${root.className}${section ? " is-section" : ""}`}>
      {mode === "edit" && (
        <span className="ed-badge ed-badge-float">{section ? `Section break · ${describeOverrides(section)}` : "Page break"}</span>
      )}
    </div>
  );
}

export const pageBreakElement: ElementDefinition<PageBreakProps> = {
  type: "page-break",
  label: "Page break",
  icon: "⤓",
  group: "Layout",
  create: () => ({ props: {} }),
  fields: [{ key: "section", label: "Section", kind: "section" }],
  summary: (p) => (p.section ? `Section · ${describeOverrides(p.section)}` : ""),
  Component: PageBreak,
};
