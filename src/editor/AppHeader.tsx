import { ArrowLeft, Eye, Pencil, Printer, Puzzle } from "lucide-react";
import { useDrive } from "../drive/DriveContext";
import { useEditor } from "../model/store";
import { MenuBar, tidy, type MenuItem } from "../ui/Menu";
import { item, useInsertItems, type Commands } from "./commands";
import { useUi, ZOOM_STEPS } from "./ui";

/** Title bar: app mark, document title, menu bar, and the view switch. */
export function AppHeader({ commands: c }: { commands: Commands }) {
  const { state, dispatch } = useEditor();
  const ui = useUi();
  const drive = useDrive();
  const insertItems = useInsertItems();
  const { doc, selectedId } = state;
  const after = (() => {
    const i = doc.elements.findIndex((n) => n.id === selectedId);
    return i >= 0 ? i + 1 : undefined;
  })();

  const menus: { title: string; items: () => MenuItem[] }[] = [
    {
      title: "File",
      items: () =>
        tidy([
        item(c.newDocument),
        item(c.open),
        item(c.openDrive),
        { type: "separator" },
        item(c.save),
        item(c.saveDriveAs),
        drive.link && item(c.download),
        { type: "separator" },
        item(c.loadSample),
        { type: "separator" },
        item(c.pageSetup),
        item(c.print),
      ]),
    },
    {
      title: "Edit",
      items: () => [
        item(c.undo),
        item(c.redo),
        { type: "separator" },
        item(c.cut),
        item(c.copy),
        item(c.paste),
        item(c.duplicate),
        { type: "separator" },
        item(c.moveUp),
        item(c.moveDown),
        { type: "separator" },
        item(c.copyStyle),
        item(c.pasteStyle),
        item(c.clearStyle),
        { type: "separator" },
        item(c.remove),
        item(c.deselect),
      ],
    },
    { title: "Insert", items: () => [item(c.textBelow), { type: "separator" }, ...insertItems(after, doc.elements.find((n) => n.id === selectedId)?.zone)] },
    {
      title: "Format",
      items: () => [
        { type: "header", label: c.bold.enabled ? "Selected text" : "Select text in a paragraph" },
        item(c.bold),
        item(c.italic),
        item(c.underline),
        item(c.strike),
        { type: "separator" },
        item(c.clearFormatting),
      ],
    },
    {
      title: "View",
      items: () => [
        item(c.editMode),
        item(c.previewMode),
        { type: "separator" },
        item(c.boxModel),
        item(c.hoverOutlines),
        item(c.inspector),
        { type: "separator" },
        item(c.zoomIn),
        item(c.zoomOut),
        item(c.zoomReset),
        {
          label: "Zoom",
          submenu: ZOOM_STEPS.map((z) => ({
            label: `${Math.round(z * 100)}%`,
            checked: Math.abs(ui.settings.zoom - z) < 0.001,
            onSelect: () => ui.set({ zoom: z }),
          })),
        },
      ],
    },
    {
      title: "Components",
      items: () =>
        tidy([
          doc.components.length > 0 && { type: "header", label: "Open in the component studio" },
          ...doc.components.map(
            (comp): MenuItem => ({
              label: comp.name,
              icon: Puzzle,
              checked: ui.studio === comp.id,
              onSelect: () => ui.openStudio(comp.id),
            }),
          ),
          { type: "separator" },
          item(c.newComponent),
          ui.studio !== null && item(c.backToDocument),
        ]),
    },
    { title: "Help", items: () => [item(c.shortcuts), { type: "separator" }, item(c.github), item(c.commit)] },
  ];

  return (
    <header className="app-header">
      <div className="app-brand" title="Paged Editor">
        <span className="app-mark">¶</span>
      </div>
      <div className="app-titles">
        <input
          className="doc-title"
          value={doc.title}
          placeholder="Untitled"
          aria-label="Document title"
          onChange={(e) => dispatch({ type: "updateDoc", patch: { title: e.target.value } })}
        />
        <MenuBar menus={menus} />
      </div>
      <div className="app-header-actions">
        {ui.studio ? (
          <button className="btn" onClick={() => ui.openStudio(null)}>
            <ArrowLeft size={14} /> Back to document
          </button>
        ) : (
          <div className="segmented" role="tablist" aria-label="View">
            <button className={ui.settings.mode === "edit" ? "is-on" : ""} onClick={() => ui.set({ mode: "edit" })}>
              <Pencil size={13} /> Edit
            </button>
            <button className={ui.settings.mode === "preview" ? "is-on" : ""} onClick={() => ui.set({ mode: "preview" })}>
              <Eye size={13} /> Preview
            </button>
          </div>
        )}
        <button className="btn btn-primary" onClick={c.print.run} disabled={c.print.enabled === false}>
          <Printer size={14} /> Print
        </button>
      </div>
    </header>
  );
}
