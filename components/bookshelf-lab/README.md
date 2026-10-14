# Bookshelf Lab 📚

A reusable 2D / 2.5D bookshelf and reader component built with TypeScript, PixiJS 8, and GSAP.

[**Live demo →**](https://lilythking66-hub.github.io/Trinket-Lab/demos/bookshelf/)

[![Bookshelf Lab demo](../../docs/demo-images/bookshelf-demo.jpg)](https://lilythking66-hub.github.io/Trinket-Lab/demos/bookshelf/)

Bookshelf Lab focuses on the physical feeling of taking a book from a shelf, opening it, reading it, and putting it back. Product copy, skins, catalog data, and storage policy stay outside the core engine.

## What it includes

- Responsive shelves that wrap logical shelf rows without changing persisted shelf IDs.
- Mouse drag, touch long-press drag, keyboard reordering, and cross-shelf moves.
- Foreground pull-out, turn, open, close, and return animations.
- A replaceable `ReaderRenderer`; `SimplePageReader` is only the bundled default.
- Local order/progress persistence through an injectable `StorageAdapter`.
- Optional local library import for EPUB, TXT, Markdown, or pasted text.
- EPUB 2/3 metadata, cover, TOC, nested chapters, and DRM detection.
- Runtime themes, labels, and decoration hooks without changing the engine.
- Reduced-motion support and semantic DOM controls over the Pixi-rendered shelf.

The demo contains 24 procedural books. Three include original sample reading text; the rest intentionally demonstrate empty-content handling.

## Quick start

Bookshelf Lab is self-contained inside Trinket Lab.

```sh
cd components/bookshelf-lab
npm ci
npm run dev
```

Open the Vite URL printed in the terminal. The default development port is `5186`.

Useful commands:

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Node.js 20.19+ or 22.12+ is recommended by the current Vite toolchain.

## Integration

The public entry point is `src/index.ts`.

```ts
import {
  BookshelfEngine,
  BookshelfView,
  LocalPersistence,
  SimplePageReader,
  BookPresentation,
} from "./src";

const engine = new BookshelfEngine(
  books,
  shelves,
  new LocalPersistence("my-library:v1"),
);

const view = new BookshelfView(element, engine, {
  layout: { basis: "container" },
});
await view.init();

const reader = new SimplePageReader({
  onProgress: (id, progress) => engine.setProgress(id, progress),
  onClose: () => void presentation.close(),
});

const presentation = new BookPresentation(view, {
  onOpen: (book) => {
    engine.read(book.id);
    reader.open(book);
  },
  onReturn: () => engine.close(),
});

const unsubscribe = engine.subscribe((change) => {
  if (change !== "selection") return;
  if (engine.state.kind === "selected")
    void presentation.select(engine.book(engine.state.id));
  if (engine.state.kind === "idle") void presentation.close();
});

// On teardown:
// unsubscribe();
// presentation.destroy();
// reader.destroy();
// view.destroy();
```

## Architecture

`src/core/` does not depend on PixiJS, DOM, or GSAP.

```text
Host / Demo
   │
   ├── BookshelfEngine
   │    ├── Book / Shelf
   │    ├── LayoutEngine
   │    ├── InteractionState
   │    └── Persistence
   │
   ├── BookshelfView
   │    ├── Pixi renderers
   │    ├── MotionController
   │    └── PointerController
   │
   ├── BookPresentation
   │
   └── ReaderRenderer
        └── SimplePageReader
```

See [Architecture](docs/ARCHITECTURE.md) for the ownership rules and lifecycle.

## Themes and copy

The engine defaults to a neutral theme and English labels. Hosts can override appearance and copy independently.

```ts
import {
  defineTheme,
  applySurface,
  oakTheme,
} from "./src";

const theme = defineTheme({
  shelf: { top: 0xd9d4ea, front: 0xc4bddc },
});

applySurface(document.documentElement, theme.surface);
view.setTheme(oakTheme);
view.setLabels({ shelf: "Library" });
```

The main customization channels are:

- **Theme** — shelf, spine, drop-target, and foreground surface tokens.
- **Labels** — visible copy and accessible names.
- **Decoration hook** — optional cover/endpaper decoration owned by the host.
- **Layout options** — viewport/container breakpoints and geometry overrides.

## Importing books

The optional demo library can import:

- EPUB 2/3
- `.txt`
- `.md` / Markdown
- pasted text
- blank placeholder books

Imported content is normalized to plain text before it reaches the reader. EPUB scripts, styles, media, SVG, iframes, and other active content are not rendered.

The ZIP reader also enforces limits on entry count, per-entry uncompressed size, and total declared uncompressed size before extraction. Deflated entries are counted again while streaming so malformed metadata cannot bypass the per-entry expansion cap.

Imported books and cover blobs use IndexedDB. Placement and reading progress remain in the separate persistence adapter.

## Reader

`SimplePageReader` paginates continuous text against the real page box. Page positions are stored as text offsets so a resize can repaginate while preserving reading position.

If a product needs a different reading experience, implement `ReaderRenderer` and leave the shelf engine unchanged.

## Current boundaries

- No account or cloud sync.
- No rich-text / inline-image EPUB rendering; imported books become readable plain text.
- No DRM bypass.
- No thousand-book virtualization benchmark yet.
- No fallback shelf renderer when WebGL is unavailable.
- Foreground book presentation is viewport-based, even when the shelf itself is embedded in a smaller container.
- Real-device Safari/iPadOS/Android gesture regression is still recommended before shipping inside a production mobile web app.

See [Acceptance](docs/ACCEPTANCE.md) for the automated coverage and known limits.

## License

MIT. See the repository [LICENSE](../../LICENSE).
