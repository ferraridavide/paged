import { X } from "lucide-react";
import { useEffect } from "react";
import { formatShortcut } from "../ui/Menu";
import type { Command, Commands } from "./commands";
import { useUi } from "./ui";

const GROUPS: { title: string; ids: (keyof Commands)[] }[] = [
  { title: "File", ids: ["open", "save", "print"] },
  { title: "Edit", ids: ["undo", "redo", "cut", "copy", "paste", "duplicate", "moveUp", "moveDown", "copyStyle", "pasteStyle", "remove", "deselect"] },
  { title: "View", ids: ["togglePreview", "boxModel", "inspector", "zoomIn", "zoomOut", "zoomReset"] },
  { title: "Insert", ids: ["textBelow"] },
  { title: "Format", ids: ["bold", "italic", "underline", "strike"] },
  { title: "Help", ids: ["shortcuts"] },
];

/** Help → Keyboard shortcuts. Built from the same commands the menus use. */
export function ShortcutsDialog({ commands }: { commands: Commands }) {
  const ui = useUi();
  useEffect(() => {
    if (!ui.shortcutsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && ui.setShortcutsOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui]);
  if (!ui.shortcutsOpen) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={() => ui.setShortcutsOpen(false)}>
      <div className="dialog" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <header className="dialog-header">
          <h2>Keyboard shortcuts</h2>
          <button className="icon-button" onClick={() => ui.setShortcutsOpen(false)} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="dialog-body shortcuts-grid">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.ids.map((id) => {
                  const cmd: Command = commands[id];
                  return (
                    <div key={id} className="shortcut-row">
                      <dt>{cmd.label}</dt>
                      <dd>
                        {cmd.keys?.map((k) => (
                          <kbd key={k}>{formatShortcut(k)}</kbd>
                        ))}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
          <p className="muted shortcuts-note">Right-click elements, pages and files for more actions.</p>
        </div>
      </div>
    </div>
  );
}
