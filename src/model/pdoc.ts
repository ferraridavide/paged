/**
 * The .pdoc file format: a zip container, like .docx or .odt, so a document
 * carries everything it needs.
 *
 *   mimetype                        "application/vnd.paged-editor+zip" (stored first, uncompressed)
 *   document.json                   page settings and elements
 *   components/<name>-<id>/
 *     component.json                name, entry file, pinned npm packages
 *     index.tsx, lib/…, assets/…    the component's own files, as written
 *   media/<element-id>-<prop>.<ext> embedded images, out of the JSON
 *
 * npm packages are referenced by pinned version and loaded from the CDN, not
 * stored in the file.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { normalizeDocument } from "./store";
import type { ComponentFile, ComponentSource, DocumentModel } from "./types";

export const PDOC_MIME = "application/vnd.paged-editor+zip";
const MEDIA_REF = "pdoc-media:";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "component";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** Text files a component can contain; anything else is a binary asset. */
export const TEXT_EXTENSIONS = ["tsx", "ts", "jsx", "js", "mjs", "css", "json", "md", "txt"];

export const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

export const extOf = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";

function dataUrlToBytes(url: string): { bytes: Uint8Array; mime: string } | null {
  // data:<mime>[;param…][;base64],<data>, e.g. data:image/svg+xml;utf8,<svg…
  const m = /^data:([^;,]+)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!m) return null;
  const [, mime, params, data] = m;
  if (params.split(";").includes("base64")) return { mime, bytes: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) };
  return { mime, bytes: strToU8(decodeURIComponent(data)) };
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}

export function packDocument(doc: DocumentModel): Uint8Array {
  const files: Zippable = { mimetype: [strToU8(PDOC_MIME), { level: 0 }] };
  const media: Record<string, string> = {}; // path → mime

  const components = doc.components.map((c) => {
    const dir = `components/${slug(c.name)}-${c.id}/`;
    files[dir + "component.json"] = strToU8(
      JSON.stringify({ id: c.id, name: c.name, entry: c.entry, dependencies: c.dependencies }, null, 2),
    );
    for (const [path, file] of Object.entries(c.files)) {
      if (file.kind === "text") files[dir + path] = strToU8(file.content);
      else files[dir + path] = [dataUrlToBytes(file.data)?.bytes ?? new Uint8Array(), { level: 0 }];
    }
    return { id: c.id, dir };
  });

  // Move embedded images (data: URLs in element props) into media/.
  const elements = doc.elements.map((node) => {
    const props: Record<string, unknown> = { ...node.props };
    for (const [key, value] of Object.entries(props)) {
      if (typeof value !== "string" || !value.startsWith("data:")) continue;
      const decoded = dataUrlToBytes(value);
      if (!decoded) continue;
      const path = `media/${node.id}-${slug(key)}.${EXT[decoded.mime] ?? "bin"}`;
      files[path] = [decoded.bytes, { level: decoded.mime === "image/svg+xml" ? 6 : 0 }];
      media[path] = decoded.mime;
      props[key] = MEDIA_REF + path;
    }
    return { ...node, props };
  });

  const json = { ...doc, elements, components, media };
  files["document.json"] = strToU8(JSON.stringify(json, null, 2));
  return zipSync(files, { level: 6 });
}

export function unpackDocument(bytes: Uint8Array): DocumentModel {
  const files = unzipSync(bytes);
  if (!files["document.json"]) throw new Error("Not a .pdoc file: document.json is missing.");
  type Stored = Omit<DocumentModel, "components"> & {
    components?: ({ id: string; dir: string } | { id: string; name: string; file: string })[];
    media?: Record<string, string>;
  };
  const raw = JSON.parse(strFromU8(files["document.json"])) as Stored;

  const components = (raw.components ?? []).map((c): ComponentSource | { id: string; name: string; source: string } => {
    if ("file" in c) {
      // Earlier single-file layout; normalizeDocument upgrades it.
      const file = files[c.file];
      if (!file) throw new Error(`Component file ${c.file} is missing.`);
      return { id: c.id, name: c.name, source: strFromU8(file) };
    }
    const meta = files[c.dir + "component.json"];
    if (!meta) throw new Error(`${c.dir}component.json is missing.`);
    const info = JSON.parse(strFromU8(meta)) as Omit<ComponentSource, "files">;
    const own: Record<string, ComponentFile> = {};
    for (const [path, bytes] of Object.entries(files)) {
      if (!path.startsWith(c.dir) || path.endsWith("/")) continue;
      const rel = path.slice(c.dir.length);
      if (rel === "component.json") continue;
      const ext = extOf(rel);
      own[rel] = TEXT_EXTENSIONS.includes(ext)
        ? { kind: "text", content: strFromU8(bytes) }
        : { kind: "asset", mime: MIME_BY_EXT[ext] ?? "application/octet-stream", data: bytesToDataUrl(bytes, MIME_BY_EXT[ext] ?? "application/octet-stream") };
    }
    return { ...info, id: c.id, files: own };
  });

  const elements = raw.elements.map((node) => {
    const props: Record<string, unknown> = { ...node.props };
    for (const [key, value] of Object.entries(props)) {
      if (typeof value !== "string" || !value.startsWith(MEDIA_REF)) continue;
      const path = value.slice(MEDIA_REF.length);
      const file = files[path];
      props[key] = file ? bytesToDataUrl(file, raw.media?.[path] ?? "application/octet-stream") : "";
    }
    return { ...node, props };
  });

  const { media: _media, ...rest } = raw;
  return normalizeDocument({ ...rest, elements, components } as unknown as DocumentModel);
}

/** Opens a .pdoc (zip) or a plain .json document. */
export async function readDocumentFile(file: File): Promise<DocumentModel> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  const doc = isZip ? unpackDocument(bytes) : normalizeDocument(JSON.parse(strFromU8(bytes)));
  if (doc.version !== 1 || !Array.isArray(doc.elements)) throw new Error("Not a Paged Editor document.");
  return doc;
}
