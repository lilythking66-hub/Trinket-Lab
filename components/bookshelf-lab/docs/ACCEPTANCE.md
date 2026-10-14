# Bookshelf Lab Acceptance

This document describes the public automated coverage and the limits that remain outside the current test matrix.

## Automated suites

Run from `components/bookshelf-lab/`:

```sh
npm run build
npm test
npm run test:e2e
```

The test suites cover:

- responsive layout and row wrapping
- stable logical shelf/order across reflow
- drag commit and cancellation
- cross-shelf moves
- keyboard reordering
- local persistence and corrupt-storage fallback
- empty books
- foreground pull / turn / open / close / return
- top-shelf extraction outside canvas bounds
- resize while a book is selected
- tight spine hit regions
- reader progress and navigation
- touch scroll vs long press
- reader swipe
- TXT / Markdown parsing and legacy Chinese encodings
- EPUB 2 and EPUB 3 imports
- nested TOC and chapter jumps
- cover extraction
- DRM rejection
- ZIP stored/deflate reading
- ZIP expansion safety limits

Visual screenshots are not written into the repository during normal E2E runs. Set `BOOKSHELF_VISUAL_SHOTS=1` when a local visual-regression capture is useful; artifacts go to ignored `test-results/visual/`.

## Browser sizes

The Playwright configuration exercises:

- Desktop: 1440 × 900
- Tablet: 768 × 1024 with touch enabled
- Mobile: 390 × 844 with mobile/touch enabled

These are browser simulations, not claims of physical-device certification.

## Performance design

- Pixi automatic ticker is disabled.
- Rendering is scheduled on demand.
- Layout does not run on every animation frame.
- Spine textures are reused until their visual signature changes.
- Pagination yields periodically during long imported books.
- Reader progress is stored as text position for continuous imported text.

## Known limits

1. Real iOS Safari, iPadOS, and Android device gestures still deserve production regression testing.
2. There is no large-library virtualization or thousand-book benchmark.
3. The demo intentionally includes only a few readable sample texts.
4. Rich EPUB layout, inline images, tables, and original CSS are reduced to readable plain text.
5. WebGL failure has no DOM-only shelf fallback.
6. The public source is not published as an npm package.
7. Foreground presentation uses viewport coordinates; an embedded shelf still opens the book at viewport scope.
8. DRM-protected EPUBs are rejected rather than bypassed.
