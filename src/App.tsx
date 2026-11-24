import { useEffect, useState } from "react";
import { Inspector } from "./editor/Inspector";
import { LeftPanel } from "./editor/LeftPanel";
import { TopBar, type ViewMode } from "./editor/TopBar";
import { Workspace } from "./editor/Workspace";
import { useComponentCompiler } from "./custom/useComponentCompiler";
import { useEditor } from "./model/store";
import { ComponentStudio } from "./studio/ComponentStudio";

function isFormField(el: EventTarget | null) {
  return el instanceof HTMLElement && el.matches("input, textarea, select");
}

function useShortcuts(inDocument: boolean) {
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
        inDocument &&
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
  }, [dispatch, state.selectedId, inDocument]);
}

/**
 * Two views: the document (using components) and the component studio
 * (building one). Components compile in the background in both.
 */
export default function App() {
  const [mode, setMode] = useState<ViewMode>("edit");
  const [studioComponent, setStudioComponent] = useState<string | null>(null);
  useShortcuts(studioComponent === null);
  useComponentCompiler();

  if (studioComponent) {
    return (
      <div className="app is-studio">
        <TopBar mode={mode} setMode={setMode} inStudio />
        <ComponentStudio componentId={studioComponent} onOpen={setStudioComponent} onClose={() => setStudioComponent(null)} />
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar mode={mode} setMode={setMode} />
      <LeftPanel onOpenComponent={setStudioComponent} />
      <main className="workspace">
        <div className="workspace-main">
          <Workspace mode={mode} />
        </div>
      </main>
      <Inspector />
    </div>
  );
}
