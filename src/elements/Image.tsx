import { EditableText } from "./EditableText";
import type { ElementComponentProps, ElementDefinition } from "./types";

export interface ImageProps {
  src: string;
  alt: string;
  caption: string;
  width: string;
  align: "left" | "center" | "right";
}

const alignMargins = {
  left: { marginLeft: 0, marginRight: "auto" },
  center: { marginLeft: "auto", marginRight: "auto" },
  right: { marginLeft: "auto", marginRight: 0 },
};

function Image({ node, mode, root, update }: ElementComponentProps<ImageProps>) {
  const { src, alt, caption, width, align } = node.props;
  const imgStyle = { width: width || undefined, ...alignMargins[align] };

  // Edit and print must have the same height, so the caption is only editable
  // in place once it exists (add it from the sidebar), and an empty image
  // reserves the same box in both modes.
  return (
    <figure {...root} style={{ textAlign: align }}>
      {src ? (
        <img src={src} alt={alt} style={imgStyle} />
      ) : (
        <div className="hd-image-empty">{mode === "edit" && "No image yet. Add one from the sidebar."}</div>
      )}
      {caption &&
        (mode === "print" ? (
          <figcaption>{caption}</figcaption>
        ) : (
          <EditableText
            as="figcaption"
            value={caption}
            caretKey={`${node.id}/caption`}
            onChange={(v) => update({ caption: v })}
          />
        ))}
    </figure>
  );
}

export const imageElement: ElementDefinition<ImageProps> = {
  type: "image",
  label: "Image",
  icon: "▣",
  group: "Media",
  create: () => ({ props: { src: "", alt: "", caption: "", width: "100%", align: "center" } }),
  fields: [
    { key: "src", label: "Image", kind: "image" },
    { key: "alt", label: "Alt text", kind: "text" },
    { key: "caption", label: "Caption", kind: "text" },
    { key: "width", label: "Width", kind: "text", placeholder: "100%, 80mm, 300px" },
    {
      key: "align",
      label: "Align",
      kind: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" },
      ],
    },
  ],
  summary: (p) => p.caption || p.alt || (p.src ? "Image" : "Empty image"),
  Component: Image,
};
