import type { ComponentFile, ComponentSource } from "../model/types";
import { extOf } from "../model/pdoc";

export const CONFIG = "::configuration";

/** Placeholder file that keeps an empty folder in existence; hidden in the explorer. */
export const KEEP = ".keep";

export const text = (content: string): ComponentFile => ({ kind: "text", content });

export function languageOf(path: string) {
  switch (extOf(path)) {
    case "tsx":
    case "ts":
      return "typescript";
    case "jsx":
    case "js":
    case "mjs":
      return "javascript";
    case "css":
      return "css";
    case "json":
      return "json";
    case "md":
      return "markdown";
    default:
      return "plaintext";
  }
}

export const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "");

export interface TreeNode {
  name: string;
  /** Files: "a/b.ts". Folders: "a/". */
  path: string;
  dir: boolean;
  children: TreeNode[];
}

/** Builds the explorer tree from flat file paths: folders first, then files, alphabetically. */
export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", dir: true, children: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      if (isFile && part === KEEP) return;
      const p = parts.slice(0, i + 1).join("/") + (isFile ? "" : "/");
      let child = node.children.find((c) => c.path === p);
      if (!child) {
        child = { name: part, path: p, dir: !isFile, children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    nodes.forEach((n) => sort(n.children));
  };
  sort(root.children);
  return root.children;
}

export function newComponent(id: string, name: string): ComponentSource {
  return {
    id,
    name,
    entry: "index.tsx",
    dependencies: {},
    files: {
      "index.tsx": text(`import { defineElement, Editable } from "@paged/sdk";

export default defineElement({
  label: "${name}",
  icon: "◆",
  fields: {
    title: { kind: "text", default: "Hello" },
    tone: { kind: "select", options: ["neutral", "accent"], default: "neutral" },
  },
  render: ({ props }) => (
    <div className={\`my-component is-\${props.tone}\`}>
      <Editable as="strong" field="title" />
    </div>
  ),
});
`),
      "styles.css": text(`/* Every .css file in the component applies to the document. */
.my-component {
  padding: 4mm;
  border: 1px solid #d6d3d1;
  border-radius: 4px;
  margin: 0 0 1em;
}
.my-component.is-accent {
  border-color: #4f46e5;
  background: #eef2ff;
}
`),
    },
  };
}

/** Starter content for a file created in the explorer. */
export function starterFor(path: string): string {
  switch (extOf(path)) {
    case "tsx":
    case "jsx":
      return `export function ${(path.split("/").pop() ?? "Part").replace(/\.\w+$/, "").replace(/[^A-Za-z0-9]/g, "") || "Part"}() {\n  return <div />;\n}\n`;
    case "json":
      return "{}\n";
    default:
      return "";
  }
}

/** Latest and all versions of an npm package, from jsDelivr. Cached per session. */
const versionCache = new Map<string, Promise<{ latest: string; versions: string[] }>>();

export function fetchVersions(name: string) {
  let p = versionCache.get(name);
  if (!p) {
    p = fetch(`https://data.jsdelivr.com/v1/packages/npm/${name}`).then(async (res) => {
      if (!res.ok) throw new Error(res.status === 404 ? `"${name}" isn't on npm.` : `npm lookup failed (${res.status}).`);
      const data = (await res.json()) as { tags?: { latest?: string }; versions?: { version: string }[] };
      const versions = (data.versions ?? []).map((v) => v.version);
      return { latest: data.tags?.latest ?? versions[0] ?? "", versions };
    });
    p.catch(() => versionCache.delete(name));
    versionCache.set(name, p);
  }
  return p;
}
