/**
 * Every user action the editor offers, defined once. The menu bar, context
 * menus and keyboard shortcuts all run these, so labels, shortcuts and
 * enabled states always agree.
 */
import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eraser,
  Eye,
  FilePlus,
  FileText,
  FolderOpen,
  Keyboard,
  Paintbrush,
  PanelRight,
  Pencil,
  Pilcrow,
  Plus,
  Printer,
  Italic,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Puzzle,
  Redo2,
  Save,
  Scissors,
  Settings,
  SquareDashed,
  SquareDashedMousePointer,
  Trash,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { ELEMENTS, GROUPS, getCompileStatus, getDefinition, useRegistryVersion } from "../elements/registry";
import { newId } from "../model/ids";
import { packDocument, readDocumentFile } from "../model/pdoc";
import { sampleDocument } from "../model/sample";
import { useEditor } from "../model/store";
import { customType } from "../model/types";
import { printPages } from "../render/print";
import { newComponent } from "../studio/files";
import type { MenuItem } from "../ui/Menu";
import { elementIcon } from "./icons";
import { useRichFormat } from "./richFormat";
import { useUi, ZOOM_STEPS } from "./ui";

/**
 * When a shortcut may fire:
 * - "always": even while typing in a field (save, print, zoom…)
 * - "page": not in sidebar/code inputs, but yes while typing on the page (undo)
 * - "selection": only when not typing anywhere (copy element, delete…)
 */
type Scope = "always" | "page" | "selection";

export interface Command {
  label: string;
  icon?: LucideIcon;
  keys?: string[];
  scope?: Scope;
  enabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  run: () => void;
}

function pickFile(accept: string) {
  return new Promise<File | undefined>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0]);
    input.click();
  });
}

function download(bytes: Uint8Array, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function useCommands() {
  const { state, dispatch } = useEditor();
  const ui = useUi();
  useRegistryVersion();
  const { doc, selectedId } = state;
  const inDocument = ui.studio === null;
  const format = useRichFormat();
  const canFormat = inDocument && format.active;
  const index = doc.elements.findIndex((n) => n.id === selectedId);
  const node = index >= 0 ? doc.elements[index] : null;
  const hasSelection = inDocument && node !== null;
  const after = index >= 0 ? index + 1 : undefined;

  const paste = (at?: number) => {
    const copied = ui.clipboard.node;
    if (!copied) return;
    dispatch({ type: "insertNode", node: { ...structuredClone(copied), id: newId() }, index: at });
  };

  const commands = {
    // File
    newDocument: {
      label: "New document",
      icon: FilePlus,
      run: () => {
        if (!confirm("Start a new, empty document? The current one is replaced (it stays in undo history).")) return;
        dispatch({ type: "load", doc: { ...sampleDocument(), title: "Untitled", elements: [], components: [] } });
        ui.openStudio(null);
      },
    },
    open: {
      label: "Open…",
      icon: FolderOpen,
      keys: ["mod+o"],
      scope: "always",
      run: async () => {
        const file = await pickFile(".pdoc,.json,application/zip,application/json");
        if (!file) return;
        try {
          dispatch({ type: "load", doc: await readDocumentFile(file) });
          ui.openStudio(null);
        } catch (err) {
          alert(`Could not open: ${(err as Error).message}`);
        }
      },
    },
    save: {
      label: "Save as .pdoc",
      icon: Save,
      keys: ["mod+s"],
      scope: "always",
      run: () => download(packDocument(doc), `${doc.title || "document"}.pdoc`),
    },
    loadSample: {
      label: "Load sample document",
      icon: FileText,
      run: () => {
        dispatch({ type: "load", doc: sampleDocument() });
        ui.openStudio(null);
      },
    },
    print: {
      label: "Print / Save as PDF…",
      icon: Printer,
      keys: ["mod+p"],
      scope: "always",
      enabled: ui.layout !== null,
      run: () => ui.layout && printPages(doc, ui.layout.layout),
    },
    pageSetup: {
      label: "Page setup…",
      icon: Settings,
      run: () => {
        ui.openStudio(null);
        ui.set({ inspector: true });
        dispatch({ type: "select", id: null });
      },
    },

    // Edit
    undo: {
      label: "Undo",
      icon: Undo2,
      keys: ["mod+z"],
      scope: "page",
      enabled: state.past.length > 0,
      run: () => dispatch({ type: "undo" }),
    },
    redo: {
      label: "Redo",
      icon: Redo2,
      keys: ["mod+shift+z", "mod+y"],
      scope: "page",
      enabled: state.future.length > 0,
      run: () => dispatch({ type: "redo" }),
    },
    cut: {
      label: "Cut element",
      icon: Scissors,
      keys: ["mod+x"],
      scope: "selection",
      enabled: hasSelection,
      run: () => {
        if (!node) return;
        ui.setClipboard({ node });
        dispatch({ type: "remove", id: node.id });
      },
    },
    copy: {
      label: "Copy element",
      icon: Copy,
      keys: ["mod+c"],
      scope: "selection",
      enabled: hasSelection,
      run: () => node && ui.setClipboard({ node }),
    },
    paste: {
      label: "Paste element",
      icon: ClipboardPaste,
      keys: ["mod+v"],
      scope: "selection",
      enabled: inDocument && !!ui.clipboard.node,
      run: () => paste(after),
    },
    duplicate: {
      label: "Duplicate",
      icon: CopyPlus,
      keys: ["mod+d"],
      scope: "selection",
      enabled: hasSelection,
      run: () => node && dispatch({ type: "duplicate", id: node.id }),
    },
    moveUp: {
      label: "Move up",
      icon: ArrowUp,
      keys: ["alt+arrowup"],
      scope: "selection",
      enabled: hasSelection && index > 0,
      run: () => node && dispatch({ type: "move", id: node.id, to: index - 1 }),
    },
    moveDown: {
      label: "Move down",
      icon: ArrowDown,
      keys: ["alt+arrowdown"],
      scope: "selection",
      enabled: hasSelection && index < doc.elements.length - 1,
      run: () => node && dispatch({ type: "move", id: node.id, to: index + 2 }),
    },
    copyStyle: {
      label: "Copy style",
      icon: Paintbrush,
      keys: ["mod+alt+c"],
      scope: "selection",
      enabled: hasSelection && Object.keys(node?.style ?? {}).length > 0,
      run: () => node && ui.setClipboard({ style: { ...node.style } }),
    },
    pasteStyle: {
      label: "Paste style",
      icon: Paintbrush,
      keys: ["mod+alt+v"],
      scope: "selection",
      enabled: hasSelection && !!ui.clipboard.style,
      run: () => node && ui.clipboard.style && dispatch({ type: "updateStyle", id: node.id, style: { ...ui.clipboard.style } }),
    },
    clearStyle: {
      label: "Clear style",
      icon: Eraser,
      enabled: hasSelection && Object.keys(node?.style ?? {}).length > 0,
      run: () => node && dispatch({ type: "updateStyle", id: node.id, style: {} }),
    },
    remove: {
      label: "Delete",
      icon: Trash,
      keys: ["backspace", "delete"],
      scope: "selection",
      enabled: hasSelection,
      danger: true,
      run: () => node && dispatch({ type: "remove", id: node.id }),
    },
    deselect: {
      label: "Select none",
      keys: ["escape"],
      scope: "page",
      enabled: inDocument,
      run: () => {
        (document.activeElement as HTMLElement | null)?.blur();
        dispatch({ type: "select", id: null });
      },
    },

    // Insert
    textBelow: {
      label: "Text below",
      icon: Pilcrow,
      keys: ["mod+enter"],
      scope: "page",
      enabled: inDocument,
      run: () => {
        ui.set({ mode: "edit" });
        const lastFlow = doc.elements.reduce((last, n, i) => (getDefinition(n.type)?.region ? last : i), -1);
        dispatch({ type: "placeEphemeral", index: index >= 0 ? index + 1 : lastFlow + 1 });
      },
    },

    // Format (selected text in a paragraph)
    bold: {
      label: "Bold",
      keys: ["mod+b"],
      scope: "page",
      enabled: canFormat,
      checked: canFormat && format.isOn("bold"),
      run: () => format.toggle("bold"),
    },
    italic: {
      label: "Italic",
      icon: Italic,
      keys: ["mod+i"],
      scope: "page",
      enabled: canFormat,
      checked: canFormat && format.isOn("italic"),
      run: () => format.toggle("italic"),
    },
    underline: {
      label: "Underline",
      icon: Underline,
      keys: ["mod+u"],
      scope: "page",
      enabled: canFormat,
      checked: canFormat && format.isOn("underline"),
      run: () => format.toggle("underline"),
    },
    strike: {
      label: "Strikethrough",
      icon: Strikethrough,
      keys: ["mod+shift+x"],
      scope: "page",
      enabled: canFormat,
      checked: canFormat && format.isOn("strike"),
      run: () => format.toggle("strike"),
    },
    clearFormatting: {
      label: "Clear formatting",
      icon: RemoveFormatting,
      enabled: canFormat,
      run: () => format.clear(),
    },

    // View
    editMode: {
      label: "Edit",
      icon: Pencil,
      checked: ui.settings.mode === "edit",
      run: () => ui.set({ mode: "edit" }),
    },
    previewMode: {
      label: "Preview",
      icon: Eye,
      checked: ui.settings.mode === "preview",
      run: () => ui.set({ mode: "preview" }),
    },
    togglePreview: {
      label: "Toggle preview",
      keys: ["mod+shift+p"],
      scope: "always",
      run: () => ui.set({ mode: ui.settings.mode === "edit" ? "preview" : "edit" }),
    },
    boxModel: {
      label: "Margin & padding overlay",
      icon: SquareDashed,
      keys: ["mod+shift+b"],
      scope: "always",
      checked: ui.settings.boxModel,
      run: () => ui.toggle("boxModel"),
    },
    hoverOutlines: {
      label: "Outline elements on hover",
      icon: SquareDashedMousePointer,
      checked: ui.settings.hoverOutlines,
      run: () => ui.toggle("hoverOutlines"),
    },
    inspector: {
      label: "Inspector panel",
      icon: PanelRight,
      keys: ["mod+\\"],
      scope: "always",
      checked: ui.settings.inspector,
      run: () => ui.toggle("inspector"),
    },
    zoomIn: {
      label: "Zoom in",
      icon: ZoomIn,
      keys: ["mod+=", "mod++"],
      scope: "always",
      enabled: ui.settings.zoom < ZOOM_STEPS[ZOOM_STEPS.length - 1],
      run: () => ui.zoomBy(1),
    },
    zoomOut: {
      label: "Zoom out",
      icon: ZoomOut,
      keys: ["mod+-"],
      scope: "always",
      enabled: ui.settings.zoom > ZOOM_STEPS[0],
      run: () => ui.zoomBy(-1),
    },
    zoomReset: {
      label: "Actual size",
      keys: ["mod+0"],
      scope: "always",
      run: () => ui.set({ zoom: 1 }),
    },

    // Components
    newComponent: {
      label: "New component…",
      icon: Plus,
      run: () => {
        const id = newId().replace("el_", "c_");
        dispatch({ type: "addComponent", component: newComponent(id, `Component ${doc.components.length + 1}`) });
        ui.openStudio(id);
      },
    },
    backToDocument: {
      label: "Back to document",
      enabled: !inDocument,
      run: () => ui.openStudio(null),
    },

    // Help
    shortcuts: {
      label: "Keyboard shortcuts",
      icon: Keyboard,
      keys: ["mod+/"],
      scope: "always",
      run: () => ui.setShortcutsOpen(true),
    },
  } satisfies Record<string, Command>;

  return commands;
}

export type Commands = ReturnType<typeof useCommands>;

/** A command as a menu item. */
export function item(cmd: Command, label?: string): MenuItem {
  return {
    label: label ?? cmd.label,
    icon: cmd.icon,
    shortcut: cmd.keys?.[0],
    disabled: cmd.enabled === false,
    checked: cmd.checked,
    danger: cmd.danger,
    onSelect: cmd.run,
  };
}

/** Insert menu items: built-in elements by group, then the document's components. */
export function useInsertItems() {
  const { state, dispatch } = useEditor();
  const ui = useUi();
  useRegistryVersion();
  const { doc } = state;

  return (at: number | undefined): MenuItem[] => {
    const items: MenuItem[] = [];
    for (const group of GROUPS) {
      const defs = ELEMENTS.filter((d) => d.group === group);
      if (!defs.length) continue;
      items.push({ type: "header", label: group });
      for (const d of defs) {
        items.push({
          label: d.label,
          icon: elementIcon(d.type),
          onSelect: () => {
            ui.set({ mode: "edit" });
            dispatch({ type: "insert", elementType: d.type, index: at });
          },
        });
      }
    }
    items.push({ type: "header", label: "Custom components" });
    for (const c of doc.components) {
      const type = customType(c.id);
      const status = getCompileStatus(type);
      items.push({
        label: c.name,
        icon: Puzzle,
        disabled: !getDefinition(type),
        shortcut: undefined,
        onSelect: () => {
          ui.set({ mode: "edit" });
          dispatch({ type: "insert", elementType: type, index: at });
        },
        ...(status?.state === "error" ? { label: `${c.name} (failed to compile)` } : {}),
      });
    }
    items.push({
      label: "New component…",
      icon: Plus,
      onSelect: () => {
        const id = newId().replace("el_", "c_");
        dispatch({ type: "addComponent", component: newComponent(id, `Component ${doc.components.length + 1}`) });
        ui.openStudio(id);
      },
    });
    return items;
  };
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function matches(e: KeyboardEvent, keys: string) {
  const parts = keys.toLowerCase().split("+");
  // "mod++" splits into [..., "", ""]: the key is "+".
  const key = keys.endsWith("++") ? "+" : parts[parts.length - 1];
  const mods = new Set(parts.slice(0, keys.endsWith("++") ? -2 : -1));
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mods.has("mod") !== mod) return false;
  if (mods.has("alt") !== e.altKey) return false;
  if (key.length === 1 && !/[a-z0-9]/.test(key)) {
    // Punctuation: the shifted character differs by layout, so ignore shift.
  } else if (mods.has("shift") !== e.shiftKey) return false;
  if (isMac && mods.has("ctrl") !== e.ctrlKey) return false;
  const pressed = e.key.toLowerCase();
  // With Alt on macOS, e.key is a special character: fall back to the physical key.
  const code = e.code.replace(/^Key/, "").replace(/^Digit/, "").toLowerCase();
  return pressed === key || (e.altKey && code === key) || (key === "\\" && code === "backslash");
}

/** Runs commands from the keyboard, respecting each command's scope. */
export function useKeyboardShortcuts(commands: Record<string, Command>) {
  const ref = useRef(commands);
  ref.current = commands;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = !!t?.matches?.("input, textarea, select");
      const inText = !!t?.isContentEditable;
      for (const cmd of Object.values(ref.current)) {
        if (!cmd.keys?.some((k) => matches(e, k))) continue;
        const scope = cmd.scope ?? "selection";
        if (scope === "page" && inField) continue;
        if (scope === "selection" && (inField || inText)) continue;
        e.preventDefault();
        if (cmd.enabled !== false) cmd.run();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
