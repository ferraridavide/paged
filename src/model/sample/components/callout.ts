import type { ComponentSource } from "../../types";
import { text } from "../util";

const INFO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`;

/** A multi-file component: entry module, a helper module, CSS and an SVG asset. */
export const callout: ComponentSource = {
  id: "callout",
  name: "Callout",
  entry: "index.tsx",
  dependencies: {},
  files: {
    "index.tsx": text(`import { defineElement, Editable } from "@paged/sdk";
import { tones, type Tone } from "./tones";
import infoIcon from "./assets/info.svg";

export default defineElement<{ tone: Tone; title: string; body: string }>({
  label: "Callout",
  icon: "!",
  fields: {
    tone: { kind: "select", options: Object.keys(tones), default: "info" },
    title: { kind: "text", default: "Note" },
    body: { kind: "textarea", default: "Something worth pointing out." },
  },
  render: ({ props }) => {
    console.log("render callout", props.tone);
    return (
      <div className="callout" style={{ "--tone": tones[props.tone] } as React.CSSProperties}>
        <img className="callout-icon" src={infoIcon} alt="" />
        <div>
          <Editable as="h4" field="title" />
          <Editable as="p" field="body" multiline />
        </div>
      </div>
    );
  },
});
`),
    "tones.ts": text(`export const tones = {
  info: "#4f46e5",
  success: "#16a34a",
  warning: "#d97706",
};

export type Tone = keyof typeof tones;
`),
    "callout.css": text(`/* Every .css file in a component applies to the document. */
.callout {
  display: flex;
  gap: 3mm;
  border-left: 4px solid var(--tone);
  background: color-mix(in srgb, var(--tone) 7%, white);
  padding: 3mm 4mm;
  margin: 0 0 1em;
}
.callout-icon { width: 5mm; height: 5mm; flex: none; margin-top: 0.5mm; opacity: 0.8; }
.callout h4 { margin: 0 0 1mm; color: var(--tone); font-size: 1em; }
.callout p { margin: 0; white-space: pre-wrap; }
`),
    "assets/info.svg": { kind: "asset", mime: "image/svg+xml", data: `data:image/svg+xml;utf8,${encodeURIComponent(INFO_ICON)}` },
  },
};
