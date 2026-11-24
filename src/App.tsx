import { useEffect, useState } from "react";
import { Inspector } from "./editor/Inspector";
import { LeftPanel } from "./editor/LeftPanel";
import { TopBar, type ViewMode } from "./editor/TopBar";
import { Workspace } from "./editor/Workspace";
import { useEditor } from "./model/store";

function isFormField(el: EventTarget | null) {
  return el instanceof HTMLElement && el.matches("input, textarea, select");
}

function useShortcuts() {
  const { state, dispatch } = useEditor();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const editingText = e.target instanceof HTMLElement && e.target.isContentEditable;

      // Sidebar inputs keep their native undo; the canvas uses document history.
      if (mod && e.key.toLowerCase() === "z" && !isFormField(e.target)) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (e.key === "Escape") {
        (document.activeElement as HTMLElement | null)?.blur();
        dispatch({ type: "select", id: null });
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        state.selectedId &&
        !editingText &&
        !isFormField(e.target)
      ) {
        e.preventDefault();
        dispatch({ type: "remove", id: state.selectedId });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, state.selectedId]);
}

export default function App() {
  const [mode, setMode] = useState<ViewMode>("edit");
  useShortcuts();

  return (
    <div className="app">
      <TopBar mode={mode} setMode={setMode} />
      <LeftPanel />
      <main className="workspace">
        <Workspace mode={mode} />
      </main>
      <Inspector />
    </div>
  );
}
