import type { ComponentFile } from "../types";

/** A text file of a component. */
export const text = (content: string): ComponentFile => ({ kind: "text", content });

/** A binary asset of a component, from SVG markup. */
export const svgAsset = (svg: string): ComponentFile => ({
  kind: "asset",
  mime: "image/svg+xml",
  data: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
});
