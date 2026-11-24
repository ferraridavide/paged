import { createElement } from "react";
import { EditableText } from "./EditableText";
import type { ElementComponentProps, ElementDefinition } from "./types";

export interface HeadingProps {
  text: string;
  level: number;
}

function Heading({ node, mode, root, update, insertTextAfter }: ElementComponentProps<HeadingProps>) {
  const tag = `h${Math.min(6, Math.max(1, node.props.level))}`;
  const className = `${root.className} hd-h${node.props.level}`;
  if (mode === "print") {
    return createElement(tag, { ...root, className }, node.props.text);
  }
  return (
    <EditableText
      as={tag}
      {...root}
      className={className}
      value={node.props.text}
      placeholder="Heading"
      caretKey={`${node.id}/text`}
      onChange={(text) => update({ text })}
      onEnter={insertTextAfter}
    />
  );
}

export const headingElement: ElementDefinition<HeadingProps> = {
  type: "heading",
  label: "Heading",
  icon: "H",
  group: "Text",
  create: () => ({ props: { text: "Heading", level: 2 } }),
  fields: [
    {
      key: "level",
      label: "Level",
      kind: "select",
      options: [1, 2, 3, 4, 5, 6].map((l) => ({ value: String(l), label: `Heading ${l}` })),
    },
    { key: "text", label: "Text", kind: "text" },
  ],
  summary: (p) => p.text,
  keepWithNext: true,
  Component: Heading,
};
