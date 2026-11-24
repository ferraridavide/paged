import { EditableText } from "./EditableText";
import type { ElementComponentProps, ElementDefinition } from "./types";

export interface TextProps {
  text: string;
}

function Text({ node, mode, root, update, fragment }: ElementComponentProps<TextProps>) {
  const { text } = node.props;
  const from = fragment?.from ?? 0;
  const to = fragment?.to ?? text.length;
  const part = text.slice(from, to);

  // Print mode must stay a single text node: the paginator measures its lines.
  if (mode === "print") return <p {...root}>{part}</p>;
  return (
    <EditableText
      as="p"
      {...root}
      multiline
      value={part}
      placeholder={fragment?.continued ? undefined : "Start typing…"}
      caretKey={`${node.id}/text`}
      caretBase={from}
      onChange={(v) => update({ text: text.slice(0, from) + v + text.slice(to) })}
    />
  );
}

export const textElement: ElementDefinition<TextProps> = {
  type: "text",
  label: "Text",
  icon: "¶",
  group: "Text",
  create: () => ({ props: { text: "" } }),
  fields: [{ key: "text", label: "Text", kind: "textarea" }],
  summary: (p) => p.text,
  split: "lines",
  Component: Text,
};
