import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { getCompileStatus, useRegistryVersion } from "../elements/registry";
import { useEditor } from "../model/store";
import { customType, type ComponentSource } from "../model/types";
import { SDK_TYPES } from "../custom/sdkTypes";
import { ConfigPane } from "./ConfigPane";
import { CONFIG, languageOf } from "./files";

export interface Reveal {
  file: string;
  line: number;
  column?: number;
  nonce: number;
}

type Monaco = Parameters<BeforeMount>[0];
type CodeEditor = Parameters<OnMount>[0];

/** Sets up Monaco's TypeScript service once: TSX, and types for "@paged/sdk". */
const beforeMount: BeforeMount = (monaco) => {
  // Newer Monaco moved the namespace; support both.
  const m = monaco as unknown as { typescript?: any; languages: { typescript?: any } };
  const ts = m.typescript ?? m.languages.typescript;
  if (!ts || (beforeMount as { done?: boolean }).done) return;
  (beforeMount as { done?: boolean }).done = true;
  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    allowNonTsExtensions: true,
    esModuleInterop: true,
  });
  // Syntax errors only for now: npm packages have no type definitions loaded.
  ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
  ts.typescriptDefaults.addExtraLib(SDK_TYPES, "file:///node_modules/@paged/sdk/index.d.ts");
};

const modelUri = (comp: ComponentSource, path: string) => `file:///components/${comp.id}/${path}`;

/** The middle pane: the selected file in Monaco, an asset preview, or the configuration. */
export function CodePane({
  comp,
  selected,
  reveal,
  onBack,
}: {
  comp: ComponentSource;
  selected: string;
  reveal: Reveal | null;
  onBack: () => void;
}) {
  const { dispatch } = useEditor();
  useRegistryVersion();
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<CodeEditor | null>(null);
  const status = getCompileStatus(customType(comp.id));
  const problems = status?.problems ?? [];

  // Compile problems as red squiggles in the open file.
  useEffect(() => {
    const monaco = monacoRef.current;
    const model = monaco?.editor.getModel(monaco.Uri.parse(modelUri(comp, selected)));
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(
      model,
      "paged",
      problems
        .filter((p) => p.file === selected && p.line)
        .map((p) => ({
          severity: monaco.MarkerSeverity.Error,
          message: p.message,
          startLineNumber: p.line!,
          startColumn: p.column ?? 1,
          endLineNumber: p.line!,
          endColumn: model.getLineMaxColumn(Math.min(p.line!, model.getLineCount())),
        })),
    );
  });

  // Jump to a problem picked in the Problems pane (also right after the editor mounts).
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  const applyReveal = () => {
    const editor = editorRef.current;
    const r = revealRef.current;
    if (!r || r.file !== selected || !editor) return;
    editor.revealLineInCenter(r.line);
    editor.setPosition({ lineNumber: r.line, column: r.column ?? 1 });
    editor.focus();
  };
  useEffect(applyReveal, [reveal, selected]);

  if (selected === CONFIG) return <ConfigPane comp={comp} onDeleted={onBack} />;

  const file = comp.files[selected];
  if (!file) return <div className="studio-empty">Select a file in the explorer.</div>;

  if (file.kind === "asset") {
    const relative = `./${selected}`;
    return (
      <div className="studio-asset">
        <div className="studio-pane-header">
          <span>{selected}</span>
          <span className="muted">{file.mime}</span>
        </div>
        <div className="studio-asset-body">
          {file.mime.startsWith("image/") ? (
            <img src={file.data} alt={selected} />
          ) : (
            <p className="muted">Binary file ({Math.round((file.data.length * 3) / 4 / 1024)} KB)</p>
          )}
          <p className="muted">Import it from code as a URL:</p>
          <pre className="studio-snippet">{`import url from "${relative}";`}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-code">
      <div className="studio-pane-header">
        <span>{selected}</span>
        {selected === comp.entry && <span className="tree-badge">entry</span>}
      </div>
      <div className="studio-code-editor">
        <Editor
          path={modelUri(comp, selected)}
          language={languageOf(selected)}
          value={file.content}
          beforeMount={beforeMount}
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;
            applyReveal();
          }}
          onChange={(content) =>
            dispatch({ type: "writeFile", id: comp.id, path: selected, file: { kind: "text", content: content ?? "" } })
          }
          options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2, scrollBeyondLastLine: false, automaticLayout: true }}
        />
      </div>
    </div>
  );
}
