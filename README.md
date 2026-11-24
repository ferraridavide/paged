# Paged Editor

A first-draft WYSIWYG editor for print documents. Documents are made of React
element components (heading, text, list, table, image, …) that you edit
directly on real pages. Edit, Preview and print share one page layout,
computed by a small custom paginator (no Paged.js).

The interface is a standard desktop-style editor: a menu bar (File, Edit,
Insert, View, Components, Help), right-click menus on elements, pages and
studio files, an inspector on the right, a status bar with zoom, and keyboard
shortcuts (Help → Keyboard shortcuts, ⌘/). Like a word processor, clicking
empty space between or after elements starts a paragraph there; it is kept
only if you type into it (one undo step), otherwise it disappears. ⌘↩ starts
a paragraph below the selected element, and so does Enter at the end of a
heading. Every action is defined once in
`src/editor/commands.tsx`, so menus, context menus and shortcuts agree.

```bash
pnpm install
pnpm dev
```

## How it fits together

```
DocumentModel (JSON, in memory + localStorage)
   │
   ├─ measure flow ── every flow element in print mode, unpaginated, hidden,
   │                  at the page content width
   │        │
   │        ▼
   │   paginate() ── reads block boxes, fills pages, splits text by line,
   │                 lists by item, tables by row (header repeats)
   │        │
   │        ▼ PageLayout[]  (which fragment of which element is on which page)
   │
   ├─ Edit ──── pages with <Component mode="edit">: type straight on the page
   ├─ Preview ─ the same pages with <Component mode="print">
   └─ Print ─── renderToStaticMarkup(pages) → hidden iframe → window.print()
```

- **`src/model/types.ts`**: the internal format. A document is page settings plus a
  flat list of `ElementNode { id, type, props, style }`.
- **`src/model/store.tsx`**: reducer with undo/redo (typing is coalesced into one
  step) and autosave to localStorage.
- **`src/elements/`**: one file per element. Each exports an `ElementDefinition`
  (label, icon, default props, sidebar fields, component, and optionally
  `split`, `keepWithNext` or `region`). Components implement
  `ElementComponentProps`: `mode` is `"edit"` or `"print"`, `root` must be
  spread on the root element, and splittable elements render only their
  `fragment`.
- **`src/layout/paginate.ts`**: the paginator.
- **`src/layout/caret.ts`**: keeps the caret in the right place when a re-layout
  moves text to another page or remounts the fragment you're typing in.
- **`src/render/PagedDocument.tsx`**: the measure flow, layout, and page rendering
  for both modes. Only pages near the viewport render their content.
- **`src/model/css.ts`**: per-element styles become `[data-node-id="…"]` rules.

## Custom components

Documents carry their own React components. **Using** a component happens in
the document (Insert menu or right-click → Insert above/below, then edit its
props in the inspector). **Building** one happens in the **component studio**,
a separate full view opened from the Components menu, right-click → Edit
component…, or the components pill in the status bar:

| Area | What it does |
|---|---|
| Files | Tree of the component's files: code (`.tsx/.ts/.jsx/.js`), `.css`, `.json`, folders and uploaded assets (images, fonts). Create, rename, delete, upload. |
| Code | Monaco, with TSX, SDK autocompletion and compile errors as markers. |
| Preview | The component alone, Storybook-style, at the document's content width and typography, in Print or Edit mode, with its height compared to a page. |
| Controls | One input per `field`; changes only the preview. |
| Problems / Console | Compile and render errors (click to jump to the line), and anything the component logs with `console.*`. |
| Configuration | Name, entry file, and npm packages: look a package up, pick a version, pin it. |

```tsx
// index.tsx (the entry)
import { defineElement, Editable } from "@paged/sdk";
import QRCode from "react-qr-code";        // must be pinned in Configuration
import { tones } from "./tones";           // the component's own files
import logo from "./assets/logo.svg";      // assets import as URLs

export default defineElement({
  label: "QR code",
  fields: { value: { kind: "text", default: "https://example.com" } },
  render: ({ props }) => (
    <div className="qr">
      <QRCode value={props.value} size={88} />
      <Editable as="span" field="caption" />
    </div>
  ),
});
```

- **Compiling** (`src/custom/compile.tsx`): each code file is compiled by
  Sucrase into its own ES module (Blob URL); relative imports point at the
  sibling modules; `.css`, `.json` and assets become modules exporting their
  content. Every `.css` file applies to the document. Edits recompile after a
  400 ms pause; a failed build keeps the last working version on the pages.
- **Packages are deliberate**: bare imports resolve only to packages pinned in
  the component's Configuration, as `https://esm.sh/<pkg>@<version>?external=react,react-dom`.
  Anything else is a compile error; nothing is resolved automatically.
- **One React**: `index.html`'s import map sends `react`, `react-dom`,
  `react/jsx-runtime` and `@paged/sdk` to `public/runtime/*.js`, generated by
  `scripts/gen-runtime.mjs`, which re-export the editor's own instances.
- **Console**: each module gets its own `console` (`src/custom/logs.ts`), so
  logs show in the studio and in devtools.
- **Trust**: components run in the editor's page with full access. That's
  fine for code you or your team write; documents from untrusted sources need
  a sandbox first.

### Component state

Props are what the user sets in the sidebar. **State** is what a component
manages itself and must persist, like a 3D camera. It lives on the element
(`node.state`), is saved in the document (data URLs go to `media/` in a
.pdoc), and every change is an undoable edit:

```tsx
const [camera, setCamera] = useElementState("camera", DEFAULT_CAMERA);
```

Built-in elements use the same mechanism: dragging a table's column borders
stores `columnWidths` in the table's state (double-click a border to reset).

Print rendering is static HTML, so anything drawn at runtime (canvas, WebGL)
should save a still in state and render that in print mode. The sample
**3D scene** component (three.js) does exactly this: orbit/pan/zoom in Edit
mode, camera and a JPEG still saved on release, the still shown in Preview
and print.

## The .pdoc format

**Save .pdoc** writes a zip, like .docx:

```
mimetype                        application/vnd.paged-editor+zip (stored, first)
document.json                   page settings and elements
components/<name>-<id>/
  component.json                name, entry file, pinned npm packages
  index.tsx, lib/…, assets/…    the component's files, as written
media/<element>-<prop>.<ext>    embedded images, moved out of the JSON
```

**Open…** reads .pdoc files and older plain .json documents (single-file
components and document-wide package pins are upgraded automatically). npm
packages are referenced by pinned version, not stored in the file, so opening
a document needs network access to esm.sh.

## Rules for element components

The paginator measures the **print** rendering, and the editor shows the
**edit** rendering on the same pages. So both modes must produce boxes of the
same size: editor chrome (badges, placeholders) is absolutely positioned or
fits inside the same box. Splittable elements must render only
`fragment.from`–`fragment.to`. For `split: "lines"`, print mode must be a
single text node.

## Adding an element

1. Create `src/elements/MyThing.tsx` with a component taking
   `ElementComponentProps<MyThingProps>`.
2. Export an `ElementDefinition` with `create()` defaults and `fields` for the
   sidebar.
3. Add it to `ELEMENTS` in `src/elements/registry.ts`.

Base look goes in `src/styles/document.css` under `.hd-<type>`.

## Performance (dev build, 67-page stress document)

- Pagination pass after an edit: about 1–3 ms.
- Full edit → render → layout cycle: about 10–14 ms, including edits on page 1
  that push content down through every later page.
- Paged.js, for comparison, re-paginated the whole document on every change:
  about 270 ms at 30 pages and about 860 ms at 100 pages.

## Known gaps (first draft)

- Text is plain: no bold, italic or links inside a paragraph yet.
- No nesting (columns, sections). The document is a flat list.
- A typing method that composes characters (e.g. Japanese input) is only
  checked at composition end, not tested.
- Browser find (Cmd+F) only sees pages near the viewport.
- Document CSS is scoped with `@scope (.pd-doc)`; `@page` rules in it have no
  effect (page size and margins come from page settings).
- Custom components: Monaco checks syntax only (no types for npm packages or
  across the component's files yet), and CDN package code isn't stored in the
  .pdoc (needs esm.sh to open).
