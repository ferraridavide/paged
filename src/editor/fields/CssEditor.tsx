import Editor from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";

const SCOPE_OPEN = ":scope {\n";
const SCOPE_CLOSE = "\n}";
const COMMIT_DELAY_MS = 300;

/** Declarations ("color: red;") shown as a rule, so Monaco offers property completions and checks. */
function wrap(declarations: string) {
  const body = declarations
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => `  ${l.trim()}`)
    .join("\n");
  return `${SCOPE_OPEN}${body}${SCOPE_CLOSE}`;
}

/** Back to declarations: whatever sits between the first "{" and the last "}". */
function unwrap(text: string) {
  const open = text.indexOf("{");
  const close = text.lastIndexOf("}");
  return (open >= 0 && close > open ? text.slice(open + 1, close) : text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

interface Props {
  /** "stylesheet": full CSS. "declarations": one element's properties, edited inside `:scope { … }`. */
  kind: "stylesheet" | "declarations";
  value: string;
  onChange: (css: string) => void;
  /** Model URI, so each element keeps its own undo history and view state. */
  path: string;
  height?: number;
}

/**
 * Monaco for CSS in the inspector. Changes apply as you type (after a short
 * pause). While the editor has focus it shows your own text, so a change
 * coming back from the document never moves the caret; when it loses focus
 * it shows the document's current CSS again.
 */
export function CssEditor({ kind, value, onChange, path, height = 160 }: Props) {
  const external = kind === "declarations" ? wrap(value) : value;
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<(() => void) | null>(null);
  const latest = useRef({ onChange, kind });
  latest.current = { onChange, kind };

  // A pending edit is bound to the element it was typed for: selecting another
  // element swaps this editor's model, and the edit must not land there.
  const flush = () => {
    clearTimeout(timer.current);
    const run = pending.current;
    pending.current = null;
    run?.();
  };
  const schedule = (text: string) => {
    const { onChange: change, kind: k } = latest.current;
    pending.current = () => change(k === "declarations" ? unwrap(text) : text);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, COMMIT_DELAY_MS);
  };
  useEffect(() => flush, []);

  return (
    <div className="css-editor" style={{ height }}>
      <Editor
        path={path}
        language="css"
        value={draft ?? external}
        loading={<div className="css-editor-loading">Loading editor…</div>}
        onMount={(editor) => {
          editor.onDidFocusEditorText(() => setDraft(editor.getValue()));
          editor.onDidBlurEditorText(() => {
            flush();
            setDraft(null);
          });
        }}
        onChange={(text) => {
          setDraft(text ?? "");
          schedule(text ?? "");
        }}
        options={{
          minimap: { enabled: false },
          lineNumbers: "off",
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 8,
          lineNumbersMinChars: 0,
          fontSize: 12,
          tabSize: 2,
          wordWrap: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          // Suggestions and hovers escape the narrow inspector instead of being clipped.
          fixedOverflowWidgets: true,
          padding: { top: 6, bottom: 6 },
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, alwaysConsumeMouseWheel: false },
        }}
      />
    </div>
  );
}
