import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { getDefinition } from "../elements/registry";
import { newId } from "./ids";
import { sampleDocument } from "./sample";
import { propsRuns, runsText } from "./runs";
import type { ComponentFile, ComponentSource, DocumentModel, ElementNode, PageSettings, StyleMap } from "./types";

export type Action =
  | { type: "select"; id: string | null }
  | { type: "insert"; elementType: string; index?: number }
  | { type: "insertNode"; node: ElementNode; index?: number }
  | { type: "updateProps"; id: string; patch: Record<string, unknown> }
  | { type: "updateStyle"; id: string; style: StyleMap }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; to: number }
  | { type: "duplicate"; id: string }
  | { type: "updatePage"; patch: Partial<PageSettings> }
  | { type: "updateDoc"; patch: Partial<Pick<DocumentModel, "title" | "customCss">> }
  | { type: "load"; doc: DocumentModel }
  | { type: "addComponent"; component: ComponentSource }
  | { type: "updateComponent"; id: string; patch: Partial<Pick<ComponentSource, "name" | "entry" | "dependencies">> }
  | { type: "removeComponent"; id: string }
  | { type: "writeFile"; id: string; path: string; file: ComponentFile }
  | { type: "deleteFile"; id: string; path: string }
  | { type: "renameFile"; id: string; from: string; to: string }
  | { type: "placeEphemeral"; index: number }
  | { type: "settleEphemeral" }
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
  /**
   * A paragraph placed by clicking empty space (or ⌘↩), like a word
   * processor's caret. It is kept only if text is typed into it: settling it
   * removes it when empty (no undo step) or records it as one edit.
   */
  ephemeral: string | null;
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
    case "insertNode": {
      const index = action.index ?? doc.elements.length;
      const elements = [...doc.elements.slice(0, index), action.node, ...doc.elements.slice(index)];
      return { doc: { ...doc, elements }, selectedId: action.node.id };
    }
    case "updateProps": {
      // "$state" in a patch targets the element's own state, not its props.
      const { $state, ...props } = action.patch as { $state?: Record<string, unknown> };
      return {
        doc: updateElement(doc, action.id, (n) => ({
          ...n,
          props: { ...n.props, ...props },
          ...($state ? { state: { ...n.state, ...$state } } : {}),
        })),
      };
    }
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
      return { doc: normalizeDocument(action.doc), selectedId: null };
    case "addComponent":
      return { doc: { ...doc, components: [...doc.components, action.component] } };
    case "updateComponent":
      return {
        doc: {
          ...doc,
          components: doc.components.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
        },
      };
    case "removeComponent":
      return { doc: { ...doc, components: doc.components.filter((c) => c.id !== action.id) } };
    case "writeFile":
      return updateComponentFiles(doc, action.id, (files) => ({ ...files, [action.path]: action.file }));
    case "deleteFile":
      // A path ending in "/" deletes a whole folder.
      return updateComponentFiles(doc, action.id, (files) =>
        Object.fromEntries(
          Object.entries(files).filter(([p]) => (action.path.endsWith("/") ? !p.startsWith(action.path) : p !== action.path)),
        ),
      );
    case "renameFile":
      return updateComponentFiles(doc, action.id, (files) =>
        Object.fromEntries(
          Object.entries(files).map(([p, f]) => {
            if (p === action.from) return [action.to, f];
            if (action.from.endsWith("/") && p.startsWith(action.from)) return [action.to + p.slice(action.from.length), f];
            return [p, f];
          }),
        ),
      );
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
    case "updateComponent":
      return `component:${action.id}:${Object.keys(action.patch).join(",")}`;
    case "writeFile":
      return `file:${action.id}:${action.path}`;
    default:
      return null;
  }
}

const isEmptyText = (n: ElementNode | undefined) => !!n && n.type === "text" && !runsText(propsRuns(n.props)).trim();

/** Ends the ephemeral paragraph: drops it if still empty, otherwise records it as one undo step. */
function settle(state: EditorState): EditorState {
  if (!state.ephemeral) return state;
  const id = state.ephemeral;
  const node = state.doc.elements.find((n) => n.id === id);
  const without = { ...state.doc, elements: state.doc.elements.filter((n) => n.id !== id) };
  if (!node || isEmptyText(node)) {
    return {
      ...state,
      doc: node ? without : state.doc,
      ephemeral: null,
      selectedId: state.selectedId === id ? null : state.selectedId,
    };
  }
  return { ...state, ephemeral: null, past: [...state.past, without].slice(-HISTORY_LIMIT), future: [], lastEdit: null };
}

/** Actions that only concern the ephemeral paragraph itself don't settle it. */
function keepsEphemeral(action: Action, id: string) {
  switch (action.type) {
    case "select":
      return action.id === id;
    case "updateProps":
    case "updateStyle":
      return action.id === id;
    case "placeEphemeral":
    case "settleEphemeral":
      return true;
    default:
      return false;
  }
}

export function reducer(current: EditorState, action: Action): EditorState {
  const state = current.ephemeral && !keepsEphemeral(action, current.ephemeral) ? settle(current) : current;

  switch (action.type) {
    case "select":
      return state.selectedId === action.id && state === current ? state : { ...state, selectedId: action.id, lastEdit: null };
    case "settleEphemeral":
      return settle(state);
    case "placeEphemeral": {
      // Replace any previous ephemeral paragraph; its removal shifts later indexes.
      let index = action.index;
      const previous = state.ephemeral ? state.doc.elements.findIndex((n) => n.id === state.ephemeral) : -1;
      const removed = previous >= 0 && isEmptyText(state.doc.elements[previous]);
      const base = settle(state);
      if (removed && previous < index) index--;
      const node: ElementNode = { id: newId(), type: "text", props: { runs: [] }, style: {} };
      const elements = [...base.doc.elements.slice(0, index), node, ...base.doc.elements.slice(index)];
      return { ...base, doc: { ...base.doc, elements }, selectedId: node.id, lastInserted: node.id, ephemeral: node.id, lastEdit: null };
    }
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

  // Typing into the ephemeral paragraph isn't history yet: settling records it.
  if (state.ephemeral && "id" in action && action.id === state.ephemeral) {
    return { ...state, doc: result.doc };
  }

  const key = coalesceKey(action);
  const now = Date.now();
  const merge = key !== null && state.lastEdit?.key === key && now - state.lastEdit.at < COALESCE_MS;

  return {
    doc: result.doc,
    selectedId: result.selectedId !== undefined ? result.selectedId : state.selectedId,
    lastInserted:
      action.type === "insert" || action.type === "insertNode" || action.type === "duplicate"
        ? (result.selectedId ?? null)
        : state.lastInserted,
    past: merge ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
    lastEdit: key ? { key, at: now } : null,
    ephemeral: action.type === "load" ? null : state.ephemeral,
  };
}

function updateComponentFiles(
  doc: DocumentModel,
  id: string,
  fn: (files: ComponentSource["files"]) => ComponentSource["files"],
) {
  return { doc: { ...doc, components: doc.components.map((c) => (c.id === id ? { ...c, files: fn(c.files) } : c)) } };
}

/** Earlier drafts: one `source` string per component, packages pinned per document. */
type LegacyComponent = { id: string; name: string; source?: string } & Partial<ComponentSource>;
type LegacyDocument = Omit<DocumentModel, "components"> & {
  components?: LegacyComponent[];
  dependencies?: Record<string, string>;
};

/** Fills in fields added after a document was saved, and upgrades older formats. */
export function normalizeDocument(input: DocumentModel | LegacyDocument): DocumentModel {
  const { dependencies: legacyDeps = {}, ...doc } = input as LegacyDocument;
  const components = (doc.components ?? []).map((c): ComponentSource => {
    if (c.files) return { id: c.id, name: c.name, entry: c.entry ?? "index.tsx", files: c.files, dependencies: c.dependencies ?? {} };
    const source = c.source ?? "";
    // Keep the document-wide pins this component actually imports.
    const dependencies = Object.fromEntries(
      Object.entries(legacyDeps).filter(([name]) => source.includes(`"${name}`) || source.includes(`'${name}`)),
    );
    return { id: c.id, name: c.name, entry: "index.tsx", files: { "index.tsx": { kind: "text", content: source } }, dependencies };
  });
  // Paragraphs were a plain `text` string before inline runs.
  const elements = doc.elements.map((n) => {
    if (n.type !== "text" || Array.isArray(n.props.runs)) return n;
    const { text: _text, ...rest } = n.props;
    return { ...n, props: { ...rest, runs: propsRuns(n.props) } };
  });
  return { ...doc, elements, customCss: doc.customCss ?? "", components };
}

function loadInitialDocument(): DocumentModel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const doc = JSON.parse(raw) as DocumentModel;
      if (doc?.version === 1 && Array.isArray(doc.elements)) return normalizeDocument(doc);
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
    ephemeral: null,
  }));

  // Autosave, debounced.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        // An empty ephemeral paragraph isn't content yet.
        const doc = state.ephemeral
          ? { ...state.doc, elements: state.doc.elements.filter((n) => n.id !== state.ephemeral || !isEmptyText(n)) }
          : state.doc;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
      } catch {
        // Storage full or blocked: the document still lives in memory.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [state.doc, state.ephemeral]);

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
