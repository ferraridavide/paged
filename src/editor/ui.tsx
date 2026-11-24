import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PageLayout } from "../layout/paginate";
import type { ElementNode, StyleMap } from "../model/types";

/** View settings, remembered between sessions. */
export interface UiSettings {
  mode: "edit" | "preview";
  /** Devtools-style margin/border/padding overlay on the selected element. */
  boxModel: boolean;
  /** Outline elements under the pointer in Edit mode. */
  hoverOutlines: boolean;
  inspector: boolean;
  /** Width of the inspector panel in px (drag its left edge; double-click resets). */
  inspectorWidth: number;
  zoom: number;
}

export const INSPECTOR_WIDTH = { default: 304, min: 240, max: 640 };

const DEFAULTS: UiSettings = {
  mode: "edit",
  boxModel: true,
  hoverOutlines: true,
  inspector: true,
  inspectorWidth: INSPECTOR_WIDTH.default,
  zoom: 1,
};
const KEY = "paged-editor:ui";
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];

export interface LayoutInfo {
  layout: PageLayout[];
  pages: number;
  ms: number;
}

interface UiContextValue {
  settings: UiSettings;
  set: (patch: Partial<UiSettings>) => void;
  toggle: (key: "boxModel" | "hoverOutlines" | "inspector") => void;
  zoomBy: (dir: 1 | -1) => void;
  /** The component open in the studio, or null for the document. */
  studio: string | null;
  openStudio: (id: string | null) => void;
  /** Latest pagination result, for printing and the status bar. */
  layout: LayoutInfo | null;
  setLayout: (info: LayoutInfo) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  /** Copied element and copied style, for Edit → Paste / Paste style. */
  clipboard: { node?: ElementNode; style?: StyleMap };
  setClipboard: (patch: { node?: ElementNode; style?: StyleMap }) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

function load(): UiSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UiSettings>(load);
  const [studio, openStudio] = useState<string | null>(null);
  const [layout, setLayoutState] = useState<LayoutInfo | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [clipboard, setClipboardState] = useState<{ node?: ElementNode; style?: StyleMap }>({});
  const setClipboard = useCallback(
    (patch: { node?: ElementNode; style?: StyleMap }) => setClipboardState((c) => ({ ...c, ...patch })),
    [],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // Settings just won't persist.
    }
  }, [settings]);

  const set = useCallback((patch: Partial<UiSettings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const toggle = useCallback(
    (key: "boxModel" | "hoverOutlines" | "inspector") => setSettings((s) => ({ ...s, [key]: !s[key] })),
    [],
  );
  const zoomBy = useCallback(
    (dir: 1 | -1) =>
      setSettings((s) => {
        const next = dir > 0 ? ZOOM_STEPS.find((z) => z > s.zoom + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < s.zoom - 0.001);
        return { ...s, zoom: next ?? s.zoom };
      }),
    [],
  );
  const setLayout = useCallback((info: LayoutInfo) => {
    const prev = layoutRef.current;
    if (prev && prev.layout === info.layout && prev.ms === info.ms) return;
    setLayoutState(info);
  }, []);

  return (
    <UiContext.Provider
      value={{
        settings,
        set,
        toggle,
        zoomBy,
        studio,
        openStudio,
        layout,
        setLayout,
        shortcutsOpen,
        setShortcutsOpen,
        clipboard,
        setClipboard,
      }}
    >
      {children}
    </UiContext.Provider>
  );
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used inside <UiProvider>");
  return ctx;
}
