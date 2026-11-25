import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eraser,
  Eye,
  Link,
  Paintbrush,
  Pencil,
  Pilcrow,
  Plus,
  Puzzle,
  Merge,
  Scissors,
  SeparatorHorizontal,
  Settings,
  SlidersHorizontal,
  SquareDashed,
  SquareDashedMousePointer,
  Trash,
  Unlink,
} from "lucide-react";
import { getDefinition } from "../elements/registry";
import { newId } from "../model/ids";
import { stepTarget, useEditor } from "../model/store";
import { zoneInsertIndex, type Section } from "../layout/sections";
import type { ElementNode, Zone } from "../model/types";
import { tidy, type MenuItem } from "../ui/Menu";
import { useInsertItems } from "./commands";
import { useUi } from "./ui";

/** Right-click menu for an element on the page (edit or preview). */
export function useElementMenu() {
  const { state, dispatch } = useEditor();
  const ui = useUi();
  const insertItems = useInsertItems();

  return (node: ElementNode): MenuItem[] => {
    const index = state.doc.elements.findIndex((n) => n.id === node.id);
    const def = getDefinition(node.type);
    const zone = node.zone;
    const componentId = node.type.startsWith("custom:") ? node.type.slice("custom:".length) : null;
    const hasStyle = Object.keys(node.style).length > 0;
    const pasteAt = (at: number) =>
      ui.clipboard.node &&
      dispatch({ type: "insertNode", node: { ...structuredClone(ui.clipboard.node), id: newId() }, index: at, zone });

    return tidy([
      { type: "header", label: `${def?.label ?? node.type}${zone ? ` · in the ${zone}` : ""}` },
      { label: "Insert above", icon: ArrowUpToLine, submenu: insertItems(index, zone) },
      { label: "Insert below", icon: ArrowDownToLine, submenu: insertItems(index + 1, zone) },
      {
        label: "Text below",
        icon: Pilcrow,
        shortcut: "mod+enter",
        onSelect: () => {
          ui.set({ mode: "edit" });
          dispatch({ type: "placeEphemeral", index: index + 1, zone });
        },
      },
      { type: "separator" },
      {
        label: "Cut",
        icon: Scissors,
        shortcut: "mod+x",
        onSelect: () => {
          ui.setClipboard({ node });
          dispatch({ type: "remove", id: node.id });
        },
      },
      { label: "Copy", icon: Copy, shortcut: "mod+c", onSelect: () => ui.setClipboard({ node }) },
      { label: "Paste below", icon: ClipboardPaste, shortcut: "mod+v", disabled: !ui.clipboard.node, onSelect: () => pasteAt(index + 1) },
      { label: "Duplicate", icon: CopyPlus, shortcut: "mod+d", onSelect: () => dispatch({ type: "duplicate", id: node.id }) },
      { type: "separator" },
      {
        label: "Move up",
        icon: ArrowUp,
        shortcut: "alt+arrowup",
        disabled: stepTarget(state.doc, node.id, -1) === null,
        onSelect: () => dispatch({ type: "step", id: node.id, by: -1 }),
      },
      {
        label: "Move down",
        icon: ArrowDown,
        shortcut: "alt+arrowdown",
        disabled: stepTarget(state.doc, node.id, 1) === null,
        onSelect: () => dispatch({ type: "step", id: node.id, by: 1 }),
      },
      { type: "separator" },
      { label: "Copy style", icon: Paintbrush, shortcut: "mod+alt+c", disabled: !hasStyle, onSelect: () => ui.setClipboard({ style: { ...node.style } }) },
      {
        label: "Paste style",
        icon: Paintbrush,
        shortcut: "mod+alt+v",
        disabled: !ui.clipboard.style,
        onSelect: () => ui.clipboard.style && dispatch({ type: "updateStyle", id: node.id, style: { ...ui.clipboard.style } }),
      },
      { label: "Clear style", icon: Eraser, disabled: !hasStyle, onSelect: () => dispatch({ type: "updateStyle", id: node.id, style: {} }) },
      { type: "separator" },
      componentId !== null && { label: "Edit component…", icon: Puzzle, onSelect: () => ui.openStudio(componentId) },
      {
        label: "Properties",
        icon: SlidersHorizontal,
        onSelect: () => {
          dispatch({ type: "select", id: node.id });
          ui.set({ inspector: true });
        },
      },
      { type: "separator" },
      { label: "Delete", icon: Trash, shortcut: "backspace", danger: true, onSelect: () => dispatch({ type: "remove", id: node.id }) },
    ]);
  };
}

/** Which page was right-clicked, for the section actions. */
export interface PageTarget {
  number: number;
  section: Section;
  sections: Section[];
  /** Set when the click was in the page's header or footer zone. */
  zone?: Zone;
  /** True when this page is the first page of its section. */
  startsSection: boolean;
  /** Index (in doc.elements) of the first element on the page, if any. */
  firstElementIndex: number | null;
}

export function usePageMenu() {
  const { state, dispatch } = useEditor();
  const ui = useUi();
  const insertItems = useInsertItems();

  const openSettings = (section: Section) => {
    ui.set({ inspector: true });
    dispatch({ type: "select", id: section.breakId });
  };

  const sectionItems = (t: PageTarget): MenuItem[] =>
    tidy([
      {
        type: "header",
        label: `Page ${t.number} · ${t.section.breakId ? `section ${t.section.index + 1}` : "document page settings"}`,
      },
      { label: t.section.breakId ? "Section settings…" : "Page settings…", icon: Settings, onSelect: () => openSettings(t.section) },
      !t.startsSection &&
        t.firstElementIndex !== null && {
          label: "Start a new section here",
          icon: SeparatorHorizontal,
          onSelect: () => {
            // A section break right before this page's first element: the new
            // section starts with this page, with nothing changed yet.
            dispatch({
              type: "insertNode",
              node: { id: newId(), type: "page-break", props: { section: {} }, style: {} },
              index: t.firstElementIndex!,
            });
            ui.set({ inspector: true });
          },
        },
      t.startsSection &&
        t.section.breakId !== null && {
          label: "Merge into the previous section",
          icon: Merge,
          onSelect: () => dispatch({ type: "updateProps", id: t.section.breakId!, patch: { section: null } }),
        },
      { type: "separator" },
    ]);

  const zoneItems = (t: PageTarget, zone: Zone): MenuItem[] => {
    const name = zone === "header" ? "header" : "footer";
    const { nodes, from } = t.section.zones[zone];
    const linked = from !== t.section.index;
    const source = t.sections[from];
    // A linked zone is the earlier section's: adding to it changes every section that shows it.
    const at = zoneInsertIndex(state.doc, source, zone);
    return tidy([
      {
        type: "header",
        label: `${zone === "header" ? "Header" : "Footer"}${linked ? ` · same as section ${from + 1}` : ""}`,
      },
      { label: `Insert into the ${name}`, icon: Plus, submenu: insertItems(at, zone) },
      {
        label: `Paste into the ${name}`,
        icon: ClipboardPaste,
        disabled: !ui.clipboard.node,
        onSelect: () =>
          ui.clipboard.node &&
          dispatch({ type: "insertNode", node: { ...structuredClone(ui.clipboard.node), id: newId() }, index: at, zone }),
      },
      linked &&
        nodes.length > 0 && {
          label: `Give section ${t.section.index + 1} its own ${name}`,
          icon: Unlink,
          onSelect: () =>
            dispatch({
              type: "insertNodes",
              nodes: nodes.map((n) => ({ ...structuredClone(n), id: newId() })),
              index: zoneInsertIndex(state.doc, t.section, zone),
            }),
        },
      !linked &&
        nodes.length > 0 &&
        t.sections.slice(0, t.section.index).some((s) => s.own[zone].length > 0) && {
          label: `Same ${name} as the previous section`,
          icon: Link,
          onSelect: () => dispatch({ type: "removeMany", ids: nodes.map((n) => n.id) }),
        },
      { type: "separator" },
    ]);
  };

  return (target?: PageTarget): MenuItem[] => [
    ...(target?.zone ? zoneItems(target, target.zone) : []),
    ...(target ? sectionItems(target) : []),
    { label: "Insert at end", icon: Plus, submenu: insertItems(undefined) },
    {
      label: "Paste at end",
      icon: ClipboardPaste,
      disabled: !ui.clipboard.node,
      onSelect: () =>
        ui.clipboard.node &&
        dispatch({ type: "insertNode", node: { ...structuredClone(ui.clipboard.node), id: newId() }, index: state.doc.elements.length }),
    },
    { type: "separator" },

    { label: "Margin & padding overlay", icon: SquareDashed, checked: ui.settings.boxModel, onSelect: () => ui.toggle("boxModel") },
    { label: "Outline elements on hover", icon: SquareDashedMousePointer, checked: ui.settings.hoverOutlines, onSelect: () => ui.toggle("hoverOutlines") },
    { type: "separator" },
    ui.settings.mode === "edit"
      ? { label: "Preview", icon: Eye, onSelect: () => ui.set({ mode: "preview" }) }
      : { label: "Edit", icon: Pencil, onSelect: () => ui.set({ mode: "edit" }) },
  ];
}
