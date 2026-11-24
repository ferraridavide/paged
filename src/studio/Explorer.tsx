import { useRef, useState } from "react";
import { getCompileStatus, useRegistryVersion } from "../elements/registry";
import { extOf, TEXT_EXTENSIONS } from "../model/pdoc";
import { useEditor } from "../model/store";
import { customType, type ComponentSource } from "../model/types";
import { buildTree, CONFIG, dirOf, KEEP, starterFor, text, type TreeNode } from "./files";

interface Props {
  comp: ComponentSource;
  selected: string;
  onSelect: (path: string) => void;
}

const ICONS: Record<string, string> = {
  tsx: "⚛",
  jsx: "⚛",
  ts: "TS",
  js: "JS",
  css: "#",
  json: "{}",
  md: "M",
};

function fileIcon(path: string, asset: boolean) {
  if (asset) return "▣";
  return ICONS[extOf(path)] ?? "·";
}

/** The component's files: a tree of folders, code, styles and assets, plus its configuration. */
export function Explorer({ comp, selected, onSelect }: Props) {
  const { dispatch } = useEditor();
  useRegistryVersion();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [contextDir, setContextDir] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const status = getCompileStatus(customType(comp.id));
  const problemFiles = new Set(status?.problems.map((p) => p.file).filter(Boolean));

  const tree = buildTree(Object.keys(comp.files));
  // New files go next to the last clicked file or folder.
  const baseDir = contextDir;

  const newFile = () => {
    const path = prompt("New file (use / for folders):", `${baseDir}NewFile.tsx`)?.trim();
    if (!path) return;
    if (comp.files[path]) return alert(`${path} already exists.`);
    dispatch({ type: "writeFile", id: comp.id, path, file: text(starterFor(path)) });
    onSelect(path);
  };

  const newFolder = () => {
    const name = prompt("New folder:", `${baseDir}assets`)?.trim().replace(/\/+$/, "");
    if (!name) return;
    dispatch({ type: "writeFile", id: comp.id, path: `${name}/${KEEP}`, file: text("") });
    setContextDir(`${name}/`);
  };

  const upload = (files: FileList | null) => {
    for (const file of files ?? []) {
      const path = `${baseDir}${file.name}`;
      const reader = new FileReader();
      if (TEXT_EXTENSIONS.includes(extOf(file.name))) {
        reader.onload = () => dispatch({ type: "writeFile", id: comp.id, path, file: text(String(reader.result)) });
        reader.readAsText(file);
      } else {
        reader.onload = () =>
          dispatch({
            type: "writeFile",
            id: comp.id,
            path,
            file: { kind: "asset", mime: file.type || "application/octet-stream", data: String(reader.result) },
          });
        reader.readAsDataURL(file);
      }
    }
  };

  const rename = (node: TreeNode) => {
    const to = prompt(`Rename ${node.dir ? "folder" : "file"}:`, node.path.replace(/\/$/, ""))?.trim().replace(/\/+$/, "");
    if (!to || to === node.path.replace(/\/$/, "")) return;
    const target = node.dir ? `${to}/` : to;
    if (!node.dir && comp.files[target]) return alert(`${target} already exists.`);
    dispatch({ type: "renameFile", id: comp.id, from: node.path, to: target });
    if (!node.dir && comp.entry === node.path) dispatch({ type: "updateComponent", id: comp.id, patch: { entry: target } });
    if (selected === node.path) onSelect(target);
  };

  const remove = (node: TreeNode) => {
    const what = node.dir ? `the folder ${node.path} and everything in it` : node.path;
    const entryWarning = !node.dir && node.path === comp.entry ? "\n\nIt is the component's entry file." : "";
    if (!confirm(`Delete ${what}?${entryWarning}`)) return;
    dispatch({ type: "deleteFile", id: comp.id, path: node.path });
    if (selected === node.path || (node.dir && selected.startsWith(node.path))) onSelect(CONFIG);
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isOpen = !collapsed.has(node.path);
    const file = node.dir ? undefined : comp.files[node.path];
    return (
      <li key={node.path}>
        <div
          className={`tree-row${selected === node.path ? " is-selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => {
            if (node.dir) {
              setContextDir(node.path);
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              });
            } else {
              setContextDir(dirOf(node.path));
              onSelect(node.path);
            }
          }}
          title={node.path}
        >
          <span className="tree-icon">{node.dir ? (isOpen ? "▾" : "▸") : fileIcon(node.path, file?.kind === "asset")}</span>
          <span className={`tree-name${problemFiles.has(node.path) ? " has-problem" : ""}`}>{node.name}</span>
          {node.path === comp.entry && <span className="tree-badge">entry</span>}
          <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
            <button title="Rename" onClick={() => rename(node)}>
              ✎
            </button>
            <button title="Delete" onClick={() => remove(node)}>
              ✕
            </button>
          </span>
        </div>
        {node.dir && isOpen && node.children.length > 0 && <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <aside className="studio-explorer">
      <div className="studio-pane-header">
        <span>Files</span>
        <span className="studio-pane-actions">
          <button title="New file" onClick={newFile}>
            +
          </button>
          <button title="New folder" onClick={newFolder}>
            ⊞
          </button>
          <button title="Upload assets (images, fonts, …)" onClick={() => uploadRef.current?.click()}>
            ⇪
          </button>
        </span>
        <input
          ref={uploadRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <div className="studio-explorer-body">
        <div className={`tree-row tree-config${selected === CONFIG ? " is-selected" : ""}`} onClick={() => onSelect(CONFIG)}>
          <span className="tree-icon">⚙</span>
          <span className="tree-name">Configuration</span>
          <span className="tree-badge">{Object.keys(comp.dependencies).length} pkg</span>
        </div>
        <ul className="tree">{tree.map((n) => renderNode(n, 0))}</ul>
        <p className="muted studio-context">
          New files go in <code>{contextDir || "/"}</code>
          {contextDir && (
            <>
              {" "}
              <button className="link" onClick={() => setContextDir("")}>
                use root
              </button>
            </>
          )}
        </p>
      </div>
    </aside>
  );
}
