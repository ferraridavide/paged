import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { getDefinition } from "../elements/registry";
import { newId } from "./ids";
import { sampleDocument } from "./sample";
import type { DocumentModel, ElementNode, PageSettings, StyleMap } from "./types";

export type Action =
  | { type: "select"; id: string | null }
  | { type: "insert"; elementType: string; index?: number }
  | { type: "updateProps"; id: string; patch: Record<string, unknown> }
  | { type: "updateStyle"; id: string; style: StyleMap }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; to: number }
  | { type: "duplicate"; id: string }
  | { type: "updatePage"; patch: Partial<PageSettings> }
  | { type: "updateDoc"; patch: Partial<Pick<DocumentModel, "title" | "customCss">> }
  | { type: "load"; doc: DocumentModel }
  | { type: "undo" }
  | { type: "redo" };

export interface EditorState {
  doc: DocumentModel;
  selectedId: string | null;
  past: DocumentModel[];
  future: DocumentModel[];
  /** The element most recently inserted or duplicated, so the editor can focus it. */
  lastInserted: string | null;
  /** Consecutive edits with the same key within COALESCE_MS share one undo step. */
  lastEdit: { key: string; at: number } | null;
}

const COALESCE_MS = 1000;
const HISTORY_LIMIT = 200;
const STORAGE_KEY = "paged-editor:document";

function updateElement(doc: DocumentModel, id: string, fn: (n: ElementNode) => ElementNode): DocumentModel {
  return { ...doc, elements: doc.elements.map((n) => (n.id === id ? fn(n) : n)) };
}

/** Applies a document-changing action. Returns null for actions that don't touch the document. */
function applyToDoc(state: EditorState, action: Action): { doc: DocumentModel; selectedId?: string | null } | null {
  const { doc } = state;
  switch (action.type) {
    case "insert": {
      const def = getDefinition(action.elementType);
      if (!def) return null;
      const { props, style } = def.create();
      const node: ElementNode = { id: newId(), type: def.type, props, style: style ?? {} };
      const index = action.index ?? doc.elements.length;
      const elements = [...doc.elements.slice(0, index), node, ...doc.elements.slice(index)];
      return { doc: { ...doc, elements }, selectedId: node.id };
    }
    case "updateProps":
      return { doc: updateElement(doc, action.id, (n) => ({ ...n, props: { ...n.props, ...action.patch } })) };
    case "updateStyle":
      return { doc: updateElement(doc, action.id, (n) => ({ ...n, style: action.style })) };
    case "remove": {
      const index = doc.elements.findIndex((n) => n.id === action.id);
      const elements = doc.elements.filter((n) => n.id !== action.id);
      const next = elements[Math.min(index, elements.length - 1)];
      return { doc: { ...doc, elements }, selectedId: next?.id ?? null };
    }
    case "move": {
      const from = doc.elements.findIndex((n) => n.id === action.id);
      if (from < 0) return null;
      const elements = [...doc.elements];
      const [node] = elements.splice(from, 1);
      // `to` is an insertion index in the list *before* removal.
      const to = action.to > from ? action.to - 1 : action.to;
      if (to === from) return null;
      elements.splice(Math.max(0, Math.min(elements.length, to)), 0, node);
      return { doc: { ...doc, elements } };
    }
    case "duplicate": {
      const index = doc.elements.findIndex((n) => n.id === action.id);
      if (index < 0) return null;
      const copy: ElementNode = { ...structuredClone(doc.elements[index]), id: newId() };
      const elements = [...doc.elements.slice(0, index + 1), copy, ...doc.elements.slice(index + 1)];
      return { doc: { ...doc, elements }, selectedId: copy.id };
    }
    case "updatePage":
      return { doc: { ...doc, page: { ...doc.page, ...action.patch } } };
    case "updateDoc":
      return { doc: { ...doc, ...action.patch } };
    case "load":
      return { doc: action.doc, selectedId: null };
    default:
      return null;
  }
}

/** Typing into the same field merges into one undo step. */
function coalesceKey(action: Action): string | null {
  switch (action.type) {
    case "updateProps":
      return `props:${action.id}:${Object.keys(action.patch).join(",")}`;
    case "updateStyle":
      return `style:${action.id}`;
    case "updatePage":
      return `page:${Object.keys(action.patch).join(",")}`;
    case "updateDoc":
      return `doc:${Object.keys(action.patch).join(",")}`;
    default:
      return null;
  }
}

export function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "select":
      return { ...state, selectedId: action.id, lastEdit: null };
    case "undo": {
      const prev = state.past.at(-1);
      if (!prev) return state;
      return {
        ...state,
        doc: prev,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        lastEdit: null,
        selectedId: prev.elements.some((n) => n.id === state.selectedId) ? state.selectedId : null,
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        doc: next,
        past: [...state.past, state.doc],
        future: state.future.slice(1),
        lastEdit: null,
        selectedId: next.elements.some((n) => n.id === state.selectedId) ? state.selectedId : null,
      };
    }
  }

  const result = applyToDoc(state, action);
  if (!result) return state;

  const key = coalesceKey(action);
  const now = Date.now();
  const merge = key !== null && state.lastEdit?.key === key && now - state.lastEdit.at < COALESCE_MS;

  return {
    doc: result.doc,
    selectedId: result.selectedId !== undefined ? result.selectedId : state.selectedId,
    lastInserted: action.type === "insert" || action.type === "duplicate" ? (result.selectedId ?? null) : state.lastInserted,
    past: merge ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
    lastEdit: key ? { key, at: now } : null,
  };
}

function loadInitialDocument(): DocumentModel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const doc = JSON.parse(raw) as DocumentModel;
      if (doc?.version === 1 && Array.isArray(doc.elements)) return doc;
    }
  } catch {
    // Ignore unreadable storage and fall back to the sample.
  }
  return sampleDocument();
}

const EditorContext = createContext<{ state: EditorState; dispatch: Dispatch<Action> } | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    doc: loadInitialDocument(),
    selectedId: null,
    past: [],
    future: [],
    lastInserted: null,
    lastEdit: null,
  }));

  // Autosave, debounced.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.doc));
      } catch {
        // Storage full or blocked: the document still lives in memory.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [state.doc]);

  // Handy for debugging and performance checks from the browser console.
  if (import.meta.env.DEV) (window as unknown as { __editor: unknown }).__editor = { state, dispatch };

  return <EditorContext.Provider value={{ state, dispatch }}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used inside <EditorProvider>");
  return ctx;
}

export function useSelectedNode() {
  const { state } = useEditor();
  return state.doc.elements.find((n) => n.id === state.selectedId) ?? null;
}
