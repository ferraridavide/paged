import { EditableText } from "./EditableText";
import { useDocument } from "../render/DocContext";
import type { ElementComponentProps, ElementDefinition } from "./types";

/**
 * Header and footer. Not part of the flow: the paginator assigns one to each
 * page and it is drawn in that page's top or bottom margin. Text can use
 * {page}, {pages} and {title}.
 */
export interface RunningRegionProps {
  left: string;
  center: string;
  right: string;
}

type Slot = "left" | "center" | "right";
const SLOTS: Slot[] = ["left", "center", "right"];

function resolve(template: string, page: number, pages: number, title: string) {
  return template.replace(/\{page\}/g, String(page)).replace(/\{pages\}/g, String(pages)).replace(/\{title\}/g, title);
}

function makeRunningRegion(kind: "header" | "footer"): ElementDefinition<RunningRegionProps> {
  function RunningRegion({ node, mode, root, update, page, selected }: ElementComponentProps<RunningRegionProps>) {
    const doc = useDocument();
    // Like a word processor: the header shows real values until you select it,
    // then its templates become editable.
    const editing = mode === "edit" && selected;

    return (
      <div {...root} className={`${root.className} hd-region`}>
        {SLOTS.map((slot) =>
          editing ? (
            <EditableText
              key={slot}
              className={`hd-run hd-run-${slot}`}
              value={node.props[slot]}
              placeholder={slot}
              caretKey={`${node.id}/${slot}`}
              onChange={(v) => update({ [slot]: v } as Partial<RunningRegionProps>)}
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

  return {
    type: kind,
    label: kind === "header" ? "Header" : "Footer",
    icon: kind === "header" ? "⊤" : "⊥",
    group: "Page",
    create: () => ({
      props:
        kind === "header"
          ? { left: "{title}", center: "", right: "" }
          : { left: "", center: "Page {page} of {pages}", right: "" },
    }),
    fields: [
      { key: "left", label: "Left", kind: "text", help: "Tokens: {page} {pages} {title}" },
      { key: "center", label: "Center", kind: "text" },
      { key: "right", label: "Right", kind: "text" },
    ],
    summary: (p) => [p.left, p.center, p.right].filter(Boolean).join(" · "),
    region: kind,
    Component: RunningRegion,
  };
}

export const headerElement = makeRunningRegion("header");
export const footerElement = makeRunningRegion("footer");
