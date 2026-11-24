# Paged Editor

A first-draft WYSIWYG editor for print documents. Documents are made of React
element components (heading, text, list, table, image, …) that you edit
directly on real pages. Edit, Preview and print share one page layout,
computed by a small custom paginator (no Paged.js).

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
