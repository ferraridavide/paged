import { useLayoutEffect, useState, type RefObject } from "react";

interface Edges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface BoxModel {
  /** Border box, relative to the container. */
  x: number;
  y: number;
  width: number;
  height: number;
  margin: Edges;
  border: Edges;
  padding: Edges;
}

function edges(cs: CSSStyleDeclaration, prop: "margin" | "padding" | "border", suffix = ""): Edges {
  const read = (side: string) => Math.max(0, parseFloat(cs.getPropertyValue(`${prop}-${side}${suffix}`)) || 0);
  return { top: read("top"), right: read("right"), bottom: read("bottom"), left: read("left") };
}

function measure(container: HTMLElement): BoxModel | null {
  const el = container.querySelector<HTMLElement>(":scope > [data-node-id]");
  if (!el) return null;
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    x: r.left - c.left,
    y: r.top - c.top,
    width: r.width,
    height: r.height,
    margin: edges(cs, "margin"),
    border: edges(cs, "border", "-width"),
    padding: edges(cs, "padding"),
  };
}

const same = (a: BoxModel | null, b: BoxModel | null) => JSON.stringify(a) === JSON.stringify(b);
const widths = (e: Edges) => `${e.top}px ${e.right}px ${e.bottom}px ${e.left}px`;

/**
 * Devtools-style box model for the selected element: margin (orange), border
 * (yellow) and padding (green) drawn as rings around it, without filling the
 * content box. Purely visual: absolutely positioned and ignores the pointer,
 * so it never changes layout.
 */
export function BoxModelOverlay({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const [box, setBox] = useState<BoxModel | null>(null);

  // Re-measure after every render of the block (text or style edits)…
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const next = measure(containerRef.current);
    setBox((prev) => (same(prev, next) ? prev : next));
  });

  // …and when the element resizes on its own (images or fonts loading).
  useLayoutEffect(() => {
    const container = containerRef.current;
    const el = container?.querySelector(":scope > [data-node-id]");
    if (!container || !el) return;
    const ro = new ResizeObserver(() => {
      const next = measure(container);
      setBox((prev) => (same(prev, next) ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  if (!box) return null;
  const { x, y, width, height, margin: m, border: b, padding: p } = box;

  return (
    <div className="ed-boxmodel" aria-hidden>
      <div
        className="ed-bm-margin"
        style={{
          left: x - m.left,
          top: y - m.top,
          width: width + m.left + m.right,
          height: height + m.top + m.bottom,
          borderWidth: widths(m),
        }}
      />
      <div className="ed-bm-border" style={{ left: x, top: y, width, height, borderWidth: widths(b) }} />
      <div
        className="ed-bm-padding"
        style={{
          left: x + b.left,
          top: y + b.top,
          width: width - b.left - b.right,
          height: height - b.top - b.bottom,
          borderWidth: widths(p),
        }}
      />
      <div className="ed-bm-outline" style={{ left: x, top: y, width, height }} />
    </div>
  );
}
