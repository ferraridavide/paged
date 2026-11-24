import { useComponentCompiler } from "./custom/useComponentCompiler";
import { AppHeader } from "./editor/AppHeader";
import { useCommands, useKeyboardShortcuts } from "./editor/commands";
import { Inspector } from "./editor/Inspector";
import { ShortcutsDialog } from "./editor/ShortcutsDialog";
import { StatusBar } from "./editor/StatusBar";
import { useUi } from "./editor/ui";
import { Workspace } from "./editor/Workspace";
import { ComponentStudio } from "./studio/ComponentStudio";

/**
 * Two views under one menu bar: the document (using components) and the
 * component studio (building one). Components compile in the background in both.
 */
export default function App() {
  const ui = useUi();
  const commands = useCommands();
  useKeyboardShortcuts(commands);
  useComponentCompiler();

  return (
    <div
      className={`app${ui.studio ? " is-studio" : ""}${ui.settings.inspector ? "" : " no-inspector"}`}
      style={{ ["--inspector-width" as string]: `${ui.settings.inspectorWidth}px` }}
    >
      <AppHeader commands={commands} />
      {ui.studio ? (
        <ComponentStudio componentId={ui.studio} onOpen={ui.openStudio} onClose={() => ui.openStudio(null)} />
      ) : (
        <>
          <main className="workspace">
            <Workspace />
          </main>
          {ui.settings.inspector && <Inspector />}
          <StatusBar />
        </>
      )}
      <ShortcutsDialog commands={commands} />
    </div>
  );
}
