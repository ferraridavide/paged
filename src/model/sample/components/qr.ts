import type { ComponentSource } from "../../types";
import { text } from "../util";

export const qr: ComponentSource = {
  id: "qr",
  name: "QR code",
  entry: "index.tsx",
  // Packages are added deliberately in the component's Configuration.
  dependencies: { "react-qr-code": "2.2.0" },
  files: {
    "index.tsx": text(`import { defineElement, Editable } from "@paged/sdk";
import QRCode from "react-qr-code";

export default defineElement({
  label: "QR code",
  icon: "▩",
  fields: {
    value: { kind: "text", label: "Link or text", default: "https://example.com" },
    size: { kind: "number", label: "Size (px)", default: 88, min: 32, max: 400 },
    caption: { kind: "text", default: "Scan for the online version" },
  },
  css: \`
    .qr { display: flex; align-items: center; gap: 5mm; margin: 0 0 1em; }
    .qr span { font-size: 0.85em; color: #78716c; }
  \`,
  render: ({ props }) => (
    <div className="qr">
      <QRCode value={props.value} size={props.size} />
      <Editable as="span" field="caption" />
    </div>
  ),
});
`),
  },
};
