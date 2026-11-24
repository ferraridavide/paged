import { useState, type DragEvent, type RefObject } from "react";
import type { Action } from "../model/store";

/** Drag payloads shared by the palette, the outline and the canvas. */
export type DragPayload = { kind: "new"; elementType: string } | { kind: "move"; id: string };

const MIME = "application/x-paged-editor";

export function startDrag(e: DragEvent, payload: DragPayload) {
  e.dataTransfer.setData(MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = payload.kind === "new" ? "copy" : "move";
}

function readDrag(e: DragEvent): DragPayload | null {
  try {
    return JSON.parse(e.dataTransfer.getData(MIME)) as DragPayload;
  } catch {
    return null;
  }
}

export function dropToAction(payload: DragPayload, index: number): Action {
  return payload.kind === "new"
    ? { type: "insert", elementType: payload.elementType, index }
    : { type: "move", id: payload.id, to: index };
}

/**
 * Tracks where a dragged block would land among the container's direct
 * children matching `itemSelector`, by comparing the pointer with each item's
 * vertical midpoint.
 */
export function useDropIndex(
  containerRef: RefObject<HTMLElement | null>,
  itemSelector: string,
  onDrop: (payload: DragPayload, index: number) => void,
) {
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const indexAt = (clientY: number) => {
    const items = containerRef.current?.querySelectorAll<HTMLElement>(`:scope > ${itemSelector}`) ?? [];
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return items.length;
  };

  const handlers = {
    onDragOver(e: DragEvent) {
      if (!e.dataTransfer.types.includes(MIME)) return;
      e.preventDefault();
      setDropIndex(indexAt(e.clientY));
    },
    onDragLeave(e: DragEvent) {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropIndex(null);
    },
    onDrop(e: DragEvent) {
      const payload = readDrag(e);
      setDropIndex(null);
      if (!payload) return;
      e.preventDefault();
      onDrop(payload, indexAt(e.clientY));
    },
  };

  return { dropIndex, handlers, clear: () => setDropIndex(null) };
}
