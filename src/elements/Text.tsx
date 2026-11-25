import { marksStyle, propsRuns, replaceRange, runsText, sliceRuns, type Run } from "../model/runs";
import { RichText } from "./RichText";
import type { ElementComponentProps, ElementDefinition } from "./types";

/** A paragraph of inline runs, each with its own formatting (bold, colour, size…). */
export interface TextProps {
  runs: Run[];
}

function Text({ node, mode, root, update, fragment }: ElementComponentProps<TextProps>) {
  const runs = propsRuns(node.props as unknown as Record<string, unknown>);
  const from = fragment?.from ?? 0;
  const to = fragment?.to ?? runsText(runs).length;
  const part = sliceRuns(runs, from, to);

  // Print: plain text for unformatted runs, a <span> per formatted run. The
  // paginator measures this and splits it by line across the runs.
  if (mode === "print") {
    return (
      <p {...root}>
        {part.map((r, i) =>
          r.marks ? (
            <span key={i} style={marksStyle(r.marks)}>
              {r.text}
            </span>
          ) : (
            r.text
          ),
        )}
      </p>
    );
  }
  return (
    <RichText
      as="p"
      {...root}
      runs={part}
      placeholder={fragment?.continued ? undefined : "Start typing…"}
      caretKey={`${node.id}/text`}
      caretBase={from}
      onChange={(next) => update({ runs: replaceRange(runs, from, to, next) })}
    />
  );
}

export const textElement: ElementDefinition<TextProps> = {
  type: "text",
  label: "Text",
  icon: "¶",
  group: "Text",
  create: () => ({ props: { runs: [] } }),
  fields: [{ key: "runs", label: "Text", kind: "runs", help: "Select text on the page to format it." }],
  summary: (p) => runsText(propsRuns(p as unknown as Record<string, unknown>)),
  split: "lines",
  Component: Text,
};
