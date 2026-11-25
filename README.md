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

## Sections (page settings for some pages)

Pages come out of pagination, so settings can't be tied to "page 3" (what's on
it changes with every edit). Like Word, the document is split into
**sections** instead: a page break can start a section (select it and turn on
"Start a new section", or right-click a page → "Start a new section here").
Every page up to the next section break uses the document's page settings
with that section's changes:

- size, orientation, margins (sections can mix portrait and landscape)
- header and footer on/off, and no header/footer on the section's first page
- page background, page classes (for Document CSS like `.cover .hd-heading`)
- typography, and **Page CSS** that applies only inside those pages

The document's own page settings (no element selected) are the defaults; its
"No header or footer on the first page" makes a cover page.

Each section is laid out separately (`src/layout/sections.ts`): its own hidden
measure flow at its content width, and its own page height, so text reflows
when a section changes size. Print gives each page size a named `@page` rule.

## Classes and CSS

Every element can carry CSS classes: type them into **Classes** at the top of
the inspector (space, Enter or comma turns them into pills; Backspace removes
the last; suggestions come from classes already used in the document and
class selectors in Document CSS). Style them in **Document CSS** (Page panel);
per-element CSS lives in the element's **Style** tab. Both CSS boxes are
Monaco editors with completions, and apply as you type.

Cascade, lowest to highest: built-in element styles (`document.css`),
component CSS, Document CSS, section Page CSS, then the element's own styles.
Each is wrapped in `@scope` with a closer root than the one before (the
document, the section's pages, the element itself), so nothing restyles the
editor and the more specific context wins at equal specificity.

## Formatted text (inline runs)

A paragraph (`text` element) is a list of **runs**: pieces of text with their
own marks (weight, italic, underline, strikethrough, font, size, colour,
highlight). Selecting text shows a format bar; the Format menu and ⌘B / ⌘I /
⌘U / ⇧⌘X work too. Formatting a selection splits the runs at its edges:

```
[the quick brown fox jumps]   select "fox", Bold
[the quick brown ][fox][ jumps]   the middle run gets { weight: "700" }
```

- `src/model/runs.ts`: split, slice, replace and mark operations; neighbours
  with identical marks are merged back together.
- `src/elements/RichText.tsx`: the editable paragraph. Typing goes through the
  browser and is read back; Enter, paste, replacing a selection and
  formatting are applied to the runs, so the markup stays one span per run.
- Runs render as inline spans, so the paginator still splits paragraphs by
  line: it counts characters across all the spans' text nodes, and a run cut
  by a page break continues with the same formatting on the next page.

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

### Sample components

- **Callout**: a multi-file component (module, CSS, SVG asset).
- **Chart**: [chart.js](https://www.chartjs.org) bar, line, area, pie and
  doughnut charts from comma/tab-separated data in the sidebar. Chart.js draws
  on a canvas, which static print markup can't carry, so the chart is drawn
  synchronously to an off-screen canvas at 3× resolution and shown as an
  image: the same box in Edit, Preview and print, cached per settings.
- **QR code**: `react-qr-code` from esm.sh.
- **3D scene**: three.js, orbit in Edit mode; print uses the saved still.

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
