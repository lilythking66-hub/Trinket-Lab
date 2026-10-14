# Bookshelf Architecture

## Ownership

Bookshelf is split so product UI and content do not leak into the reusable engine.

```text
Host / Demo
  │      │ theme · labels · decorate
  ├── BookshelfEngine → Book / Shelf / InteractionState / Persistence
  ├── BookshelfView → LayoutEngine + responsiveLayout
  │     ├── BookRenderer / ShelfRenderer → PixiJS
  │     ├── MotionController → GSAP
  │     └── PointerController → input adapters
  ├── BookPresentation → foreground book lifecycle
  └── ReaderRenderer → SimplePageReader → ReaderState
```

`src/index.ts` is the public source entry point.

## Single source of truth

`BookshelfEngine` owns catalog placement, selection/drag/read state, and persistence notifications. Renderers never own ordering state. Pointer adapters emit semantic actions back to the engine.

The core layer is independent from PixiJS, DOM, and GSAP, which keeps layout/state logic testable without a browser renderer.

## Layout and ordering

`layoutBooks()` is a pure layout function. It sorts by logical shelf and order, then creates as many visual rows as the available width requires. Wrapping never mutates a book's logical `shelfId`.

Drag targets are resolved to semantic `shelfId + beforeId` insertions. The engine snapshots placement at drag start, mutates only in memory while dragging, and commits on drop. Escape, pointer cancellation, blur, or an interrupted interaction restores the snapshot.

Automatic lean is visual only. In the default mode, an eligible final book in a row leans against its neighbor using a stable angle derived from the book ID. Manual and disabled lean modes are also supported.

## Rendering and performance

PixiJS renders the shelf and procedural spines. Spine textures are generated once per visual signature and reused. The Pixi ticker is disabled; rendering is scheduled only when layout, input, or GSAP animation changes something.

`ResizeObserver` relayouts the shelf when its effective width changes. Container-based layout is available for embedded cards or sidebars.

All interactive books also have semantic DOM buttons layered over the Pixi canvas for focus, labels, keyboard control, and pointer handling.

## Foreground book lifecycle

`BookPresentation` owns the viewport-level book illusion:

```text
pulling
→ turning
→ cover
→ opening
→ open
→ reading
→ closing
→ turning-back
→ returning
→ idle
```

These are presentation phases, not core business state.

`BookshelfView.takeBook()` temporarily hides the Pixi spine and hands the foreground layer its current viewport pose. The foreground book lives under `document.body`, so leaving the canvas does not clip it. On return, `slotPose()` is measured again so a resize or reflow cannot send the book back to stale coordinates.

Resize during a stable cover or reading state recomputes the target geometry. Resize during an in-progress transition cancels that transition and returns the book safely.

## Reader boundary

The shelf does not know how pages are rendered. `ReaderRenderer` defines the replaceable interface.

`SimplePageReader` is the included implementation. Continuous imported text is paginated with a hidden measurement twin of the real page box. Page boundaries are text offsets, so repagination after resize preserves the reader's logical position.

Imported text is HTML-escaped before it is inserted into the page body.

## Themes, labels, and host decoration

Visual direction is a host concern.

- `Theme.ts` owns shelf/spine/surface tokens.
- `Labels.ts` owns visible copy and accessible names.
- `BookPresentation.decorate()` lets the host add optional cover/endpaper decoration.
- `responsive/Layouts.ts` owns size and motion-related layout parameters.

The bundled demo is intentionally neutral. Alternate skins and product copy remain host concerns, not engine contract.

## Local library and imports

`src/import/` contains optional helpers for EPUB/TXT/Markdown ingestion.

EPUB handling follows:

```text
ZIP
→ container.xml
→ OPF metadata / manifest / spine
→ EPUB3 nav or EPUB2 NCX
→ plain-text chapter model
```

Active EPUB content is discarded: scripts, styles, SVG, media, objects, iframes, and similar elements are never rendered into the reader.

The ZIP reader accepts stored/deflate entries and enforces three expansion limits:

- maximum entry count
- maximum uncompressed size for one entry
- maximum declared uncompressed size for the archive

Deflated data is also counted while streaming before it is copied into the final buffer.

`IndexedDBBookStore` stores imported book metadata, text, and cover blobs. Shelf placement and reading progress remain separate through `StorageAdapter`.

## Lifecycle

Consumers should tear down all browser-owned layers:

```ts
unsubscribe();
presentation.destroy();
reader.destroy();
view.destroy();
```

`BookshelfView.destroy()` disconnects resize/input listeners, stops motion, releases Pixi resources, and removes DOM overlays.

## Deliberate non-goals

Bookshelf does not provide accounts, cloud sync, a remote catalog, DRM bypass, rich EPUB layout, page-curl physics, or a container-scoped foreground presentation.
