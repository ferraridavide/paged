import { createElement } from "react";
import { requestCaret } from "../layout/caret";
import { EditableText } from "./EditableText";
import type { ElementComponentProps, ElementDefinition } from "./types";

export interface ListProps {
  items: string[];
  ordered: boolean;
  marker: string;
}

function List({ node, mode, root, update, fragment }: ElementComponentProps<ListProps>) {
  const { items, ordered, marker } = node.props;
  const from = fragment?.from ?? 0;
  const to = fragment?.to ?? items.length;
  const tag = ordered ? "ol" : "ul";
  const attrs = {
    ...root,
    style: marker ? { listStyleType: marker } : undefined,
    // A numbered list continued from the previous page keeps counting.
    start: ordered && from > 0 ? from + 1 : undefined,
  };
  const key = (i: number) => `${node.id}/items/${i}`;

  if (mode === "print") {
    return createElement(
      tag,
      attrs,
      items.slice(from, to).map((item, i) => <li key={from + i}>{item}</li>),
    );
  }

  return createElement(
    tag,
    attrs,
    items.slice(from, to).map((item, j) => {
      const i = from + j;
      return (
        <EditableText
          key={i}
          as="li"
          value={item}
          placeholder="List item"
          caretKey={key(i)}
          onChange={(v) => update({ items: items.map((it, k) => (k === i ? v : it)) })}
          onEnter={() => {
            update({ items: [...items.slice(0, i + 1), "", ...items.slice(i + 1)] });
            requestCaret(key(i + 1), 0);
          }}
          onDeleteEmpty={() => {
            if (items.length === 1) return;
            update({ items: items.filter((_, k) => k !== i) });
            if (i > 0) requestCaret(key(i - 1), items[i - 1].length);
          }}
        />
      );
    }),
  );
}

export const listElement: ElementDefinition<ListProps> = {
  type: "list",
  label: "List",
  icon: "•",
  group: "Text",
  create: () => ({ props: { items: ["First item", "Second item"], ordered: false, marker: "" } }),
  fields: [
    { key: "ordered", label: "Numbered", kind: "boolean" },
    {
      key: "marker",
      label: "Marker",
      kind: "select",
      options: [
        { value: "", label: "Default" },
        { value: "disc", label: "Disc" },
        { value: "circle", label: "Circle" },
        { value: "square", label: "Square" },
        { value: "decimal", label: "1, 2, 3" },
        { value: "lower-alpha", label: "a, b, c" },
        { value: "upper-roman", label: "I, II, III" },
        { value: "none", label: "None" },
      ],
    },
    { key: "items", label: "Items", kind: "lines", help: "One item per line. On the page, Enter adds an item." },
  ],
  summary: (p) => p.items.filter(Boolean).join(", "),
  split: "items",
  Component: List,
};
