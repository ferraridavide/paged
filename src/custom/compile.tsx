/**
 * Compiles a custom component (a small project of files) into an element
 * definition, in the browser:
 *
 * 1. Each code file is turned into JavaScript by Sucrase (types stripped, JSX
 *    to `react/jsx-runtime` calls) and becomes an ES module at a Blob URL.
 * 2. es-module-lexer finds every import and rewrites it:
 *    - "react", "react-dom", "@paged/sdk": left bare; index.html's import map
 *      resolves them to the editor's own instances.
 *    - "./x", "../lib/y": the sibling file's Blob URL (compiled first).
 *      CSS, JSON and asset files become modules exporting their content.
 *    - npm packages: esm.sh at the version pinned in the component's
 *      configuration. A package that isn't pinned is an error, never
 *      resolved automatically.
 * 3. The entry module is imported; its default export is the definition.
 */
import { init as initLexer, parse } from "es-module-lexer";
import { useMemo } from "react";
import { transform } from "sucrase";
import type { ElementComponentProps, ElementDefinition, FieldDef } from "../elements/types";
import { customType, type ComponentSource } from "../model/types";
import { ElementContext, isElementSpec, type ElementSpec, type FieldSpec } from "./sdk";

const CDN = "https://esm.sh";
const HOST_MODULES = new Set(["react", "react/jsx-runtime", "react-dom", "@paged/sdk"]);
const CODE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs"];

export function packageName(specifier: string) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

export function cdnUrl(specifier: string, version: string) {
  const name = packageName(specifier);
  return `${CDN}/${name}@${version}${specifier.slice(name.length)}?external=react,react-dom`;
}

export const isCodeFile = (path: string) => CODE_EXTENSIONS.some((e) => path.endsWith(e));

/** A problem tied to a file and position, for the Problems pane and editor markers. */
export class CompileError extends Error {
  constructor(
    message: string,
    public file?: string,
    public line?: number,
    public column?: number,
  ) {
    super(message);
  }
}

export interface CompileResult {
  def: ElementDefinition;
  /** npm packages the component imports. */
  packages: string[];
  /** Blob URLs of this build, revoked when the next build replaces it. */
  urls: string[];
}

/** Resolves "./x" from `fromFile` to a path in the component, trying extensions and index files. */
function resolveRelative(fromFile: string, spec: string, files: ComponentSource["files"]) {
  const parts = fromFile.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  const p = parts.join("/");
  const candidates = [p, ...CODE_EXTENSIONS.map((e) => p + e), ...CODE_EXTENSIONS.map((e) => `${p}/index${e}`)];
  return candidates.find((c) => files[c]);
}

const lineOf = (code: string, index: number) => code.slice(0, index).split("\n").length;

function blobUrl(code: string) {
  return URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
}

/** Location from an error's stack, using the sourceURL each module carries. */
function locate(err: Error, componentId: string) {
  const re = new RegExp(`component://${componentId}/([^\\s:)]+):(\\d+):(\\d+)`);
  const m = re.exec(err.stack ?? "");
  return m ? { file: m[1], line: Number(m[2]), column: Number(m[3]) } : {};
}

export async function compileComponent(comp: ComponentSource): Promise<CompileResult> {
  await initLexer();
  const urls = new Map<string, string>();
  const created: string[] = [];
  const visiting = new Set<string>();
  const packages = new Set<string>();

  async function moduleUrl(path: string): Promise<string> {
    const cached = urls.get(path);
    if (cached) return cached;
    if (visiting.has(path)) throw new CompileError(`Circular import involving ${path}`, path);
    visiting.add(path);

    const file = comp.files[path];
    let code: string;
    if (file.kind === "asset") {
      code = `export default ${JSON.stringify(file.data)};`;
    } else if (path.endsWith(".css") || path.endsWith(".md") || path.endsWith(".txt")) {
      code = `export default ${JSON.stringify(file.content)};`;
    } else if (path.endsWith(".json")) {
      try {
        JSON.parse(file.content);
      } catch (err) {
        throw new CompileError(`Invalid JSON: ${(err as Error).message}`, path);
      }
      code = `export default ${file.content};`;
    } else {
      code = await compileScript(path, file.content);
    }

    const url = blobUrl(code);
    created.push(url);
    urls.set(path, url);
    visiting.delete(path);
    return url;
  }

  async function compileScript(path: string, source: string) {
    let code: string;
    try {
      code = transform(source, {
        transforms: ["typescript", "jsx"],
        jsxRuntime: "automatic",
        production: true,
        filePath: path,
      }).code;
    } catch (err) {
      const message = (err as Error).message.replace(/^Error transforming [^:]+: /, "");
      const pos = /\((\d+):(\d+)\)\s*$/.exec(message);
      throw new CompileError(
        message.replace(/\s*\(\d+:\d+\)\s*$/, ""),
        path,
        pos ? Number(pos[1]) : undefined,
        pos ? Number(pos[2]) + 1 : undefined,
      );
    }

    const [imports] = parse(code);
    let out = "";
    let last = 0;
    for (const imp of imports) {
      if (imp.type === "import-meta") continue;
      const spec = imp.specifier;
      if (!spec || HOST_MODULES.has(spec) || /^https?:\/\//.test(spec)) continue;
      const line = lineOf(code, imp.start);

      let url: string;
      if (spec.startsWith("./") || spec.startsWith("../")) {
        const target = resolveRelative(path, spec, comp.files);
        if (!target) throw new CompileError(`Cannot find "${spec}" in this component.`, path, line);
        url = await moduleUrl(target);
      } else if (spec.startsWith("/")) {
        throw new CompileError(`Use relative paths ("./…") to import the component's own files.`, path, line);
      } else {
        const name = packageName(spec);
        const version = comp.dependencies[name];
        if (!version) {
          throw new CompileError(`Package "${name}" isn't added to this component. Add and pin it in Configuration.`, path, line);
        }
        packages.add(name);
        url = cdnUrl(spec, version);
      }

      // start..end covers the specifier; keep quotes if the range includes them.
      const quoted = /['"`]/.test(code[imp.start]);
      out += code.slice(last, imp.start) + (quoted ? JSON.stringify(url) : url);
      last = imp.end;
    }
    out += code.slice(last);

    // Route console calls to the studio (same line, so positions stay right).
    const consoleShim = `const console = globalThis.__PAGED_CONSOLE__(${JSON.stringify(comp.id)}, ${JSON.stringify(path)});`;
    return `${consoleShim}${out}\n//# sourceURL=component://${comp.id}/${path}`;
  }

  if (!comp.files[comp.entry]) throw new CompileError(`Entry file "${comp.entry}" doesn't exist. Pick one in Configuration.`);

  let mod: { default?: unknown };
  try {
    const entry = await moduleUrl(comp.entry);
    mod = await import(/* @vite-ignore */ entry);
  } catch (err) {
    created.forEach((u) => URL.revokeObjectURL(u));
    if (err instanceof CompileError) throw err;
    const { file, line, column } = locate(err as Error, comp.id);
    throw new CompileError(`Failed to load: ${(err as Error).message}`, file, line, column);
  }

  if (!isElementSpec(mod.default)) {
    created.forEach((u) => URL.revokeObjectURL(u));
    throw new CompileError('The default export must be defineElement({ ... }) from "@paged/sdk".', comp.entry);
  }

  // Every .css file in the component applies to the document.
  const css = [
    mod.default.css ?? "",
    ...Object.entries(comp.files)
      .filter(([p, f]) => p.endsWith(".css") && f.kind === "text")
      .map(([, f]) => (f.kind === "text" ? f.content : "")),
  ]
    .filter(Boolean)
    .join("\n");

  return { def: toDefinition(comp, mod.default, css), packages: [...packages], urls: created };
}

/* ---------- From the SDK's spec to the editor's ElementDefinition ---------- */

function defaultFor(field: FieldSpec) {
  if (field.default !== undefined) return field.default;
  switch (field.kind) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "lines":
      return [];
    case "select": {
      const first = field.options?.[0];
      return typeof first === "string" ? first : (first?.value ?? "");
    }
    default:
      return "";
  }
}

function toFieldDef(key: string, f: FieldSpec): FieldDef<any> {
  const base = { key, label: f.label ?? key[0].toUpperCase() + key.slice(1), help: f.help };
  switch (f.kind) {
    case "number":
      return { ...base, kind: "number", min: f.min, max: f.max };
    case "select":
      return {
        ...base,
        kind: "select",
        options: (f.options ?? []).map((o) => (typeof o === "string" ? { value: o, label: o } : o)),
      };
    case "boolean":
      return { ...base, kind: "boolean" };
    default:
      return { ...base, kind: f.kind, placeholder: f.placeholder };
  }
}

function toDefinition(comp: ComponentSource, spec: ElementSpec, css: string): ElementDefinition {
  const fields = Object.entries(spec.fields ?? {});
  const Render = spec.render;

  // The element's root carries data-node-id and per-element styles; the
  // author's markup goes inside it, with the SDK context for <Editable>.
  function CustomElement({ node, mode, root, update, page }: ElementComponentProps<Record<string, any>>) {
    const ctx = useMemo(() => ({ node, mode, update, page }), [node, mode, update, page]);
    return (
      <div {...root}>
        <ElementContext.Provider value={ctx}>
          <Render props={node.props} mode={mode} />
        </ElementContext.Provider>
      </div>
    );
  }
  CustomElement.displayName = `Custom(${comp.name})`;

  return {
    type: customType(comp.id),
    label: spec.label || comp.name,
    icon: spec.icon ?? "◆",
    group: "Custom",
    create: () => ({ props: Object.fromEntries(fields.map(([k, f]) => [k, defaultFor(f)])) }),
    fields: fields.map(([k, f]) => toFieldDef(k, f)),
    summary: (props) => String(Object.values(props).find((v) => typeof v === "string" && v) ?? ""),
    keepWithNext: spec.keepWithNext,
    css,
    Component: CustomElement,
  };
}
