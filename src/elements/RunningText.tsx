import { EditableText } from "./EditableText";
import { useDocument } from "../render/DocContext";
import type { ElementComponentProps, ElementDefinition } from "./types";

/**
 * Left, centre and right text that can show the page number, the page count
 * and the document title ({page}, {pages}, {title}). Made for header and
 * footer zones, but works anywhere: every page passes its number down.
 */
export interface RunningTextProps {
  left: string;
  center: string;
  right: string;
}

type Slot = "left" | "center" | "right";
const SLOTS: Slot[] = ["left", "center", "right"];

function resolve(template: string, page: number, pages: number, title: string) {
  return template.replace(/\{page\}/g, String(page)).replace(/\{pages\}/g, String(pages)).replace(/\{title\}/g, title);
}

function RunningText({ node, mode, root, update, page, selected }: ElementComponentProps<RunningTextProps>) {
  const doc = useDocument();
  // Like a word processor: the fields show real values until you select the
  // element, then its templates become editable.
  const editing = mode === "edit" && selected;

  return (
    <div {...root} className={`${root.className} hd-running`}>
      {SLOTS.map((slot) =>
        editing ? (
          <EditableText
            key={slot}
            className={`hd-run hd-run-${slot}`}
            value={node.props[slot]}
            placeholder={slot}
            caretKey={`${node.id}/${slot}`}
            onChange={(v) => update({ [slot]: v } as Partial<RunningTextProps>)}
          />
        ) : (
          <div key={slot} className={`hd-run hd-run-${slot}`}>
            {resolve(node.props[slot], page?.number ?? 1, page?.total ?? 1, doc.title)}
          </div>
        ),
      )}
    </div>
  );
}

export const runningTextElement: ElementDefinition<RunningTextProps> = {
  type: "running-text",
  label: "Page number & title",
  icon: "#",
  group: "Page",
  create: () => ({ props: { left: "{title}", center: "", right: "Page {page} of {pages}" } }),
  fields: [
    { key: "left", label: "Left", kind: "text", help: "Tokens: {page} {pages} {title}" },
    { key: "center", label: "Center", kind: "text" },
    { key: "right", label: "Right", kind: "text" },
  ],
  summary: (p) => [p.left, p.center, p.right].filter(Boolean).join(" · "),
  Component: RunningText,
};
