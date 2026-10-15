# Trinket Lab Architecture

## 1. Component boundary

A Trinket is an interactive object with a small public contract. Product flows should compose Trinkets instead of modifying their internals.

For the Instant Photo family, keep these concerns separate:

1. **Content source** — where the image/data comes from.
2. **Trigger** — what asks the interaction to start.
3. **Trinket component** — the user-facing object and its interaction flow.
4. **Shared engine** — reusable mechanics used by sibling components.
5. **Output** — what happens after the interaction completes.

## 2. Instant Photo family

### Photo Engine

Owns the reusable physical illusion:

- photo card geometry
- flash state
- paper ejection motion
- developing transition
- film/frame rendering hooks
- take / dismiss / save lifecycle
- motion state and cancellation

It should not own QR scanning, camera permission, location logic, campaign rules, or a specific product's collection state.

### Instant Photo

Receives prepared content from outside the component.

Conceptual input:

~~~ts
interface PhotoRecipe {
  image: string;
  title?: string;
  caption?: string;
  date?: string;
  stamp?: string;
  frame?: string;
  metadata?: Record<string, unknown>;
}
~~~

Conceptual use:

~~~ts
instantPhoto.print(recipe);
~~~

A Shuanglang experience might resolve a scanned spot ID into a recipe, but that resolver lives outside Instant Photo.

### Instant Camera

Owns camera-specific concerns:

- live preview
- camera selection / mirroring
- permission and unavailable-camera states
- shutter capture

After capture, it hands a normal image to the Photo Engine. Ejection and developing should not be reimplemented here.

## 3. Triggers

Triggers are optional adapters.

Examples:

- button
- QR code
- external program event
- auto trigger
- NFC / location / beacon in future integrations

The QR adapter should conceptually do only this:

~~~text
scan code → resolve payload → produce PhotoRecipe → call Instant Photo
~~~

Removing the QR adapter must not break Instant Photo.

## 4. Product integration rule

Product-specific state belongs in the product.

For example, the Shuanglang project can own:

- spot IDs
- which spots have been collected
- unlock rules
- album ordering
- backend/API calls
- QR payload validation

Trinket Lab only owns the reusable interaction object and generic adapters.

## 5. Repository evolution

Do not introduce workspace/package publishing infrastructure until there are multiple implemented components that benefit from it. Start with ordinary folders and working demos, then extract shared build tooling only after repetition appears.

## 6. Bookshelf

`components/bookshelf/` is an independent TypeScript package with its own dependency lockfile, Vite demo and tests. `src/core/` owns book data, layout, state and persistence; rendering and pointer input are adapters; `ReaderRenderer` allows replacing SimplePageReader without changing the shelf core. Demo-specific composition and content live in `src/demo/`. See its [architecture](../components/bookshelf/docs/ARCHITECTURE.md).

The existing photo and printer components retain their build-free workflow. Bookshelf is built from its own directory during GitHub Pages deployment and copied into `demos/bookshelf/`; no shared workspace or committed `dist/` is required.

## 7. Gacha

`components/gacha/` follows the printer's build-free shape. `gacha-core.js` owns the state machine (locked → idle → turning → dispensing → waiting → presenting → revealed), the weighted draw, stock and the knob ratchet; `capsule-physics.js` owns the capsule pile. Neither touches the DOM. `gacha-element.js` renders the procedural skin from `machine-art.js` and wires pointer/keyboard input. Prize content, draw rules decided by a server (`resolvePrize`), payments (`insertCoin()` with `coin-input="none"`) and collections stay in the host product.

## 8. Turntable

`components/turntable/` is build-free like the printer and gacha. `turntable-core.js` owns the mechanics without the DOM: platter inertia, the tonearm modes (rest → held / swing → lowering → tracking → run-out) and the mapping between arm angle and song position. `audio-engine.js` plays the music through an `<audio>` element whose playback rate follows the platter, plus synthesized crackle and mechanical sounds. `deck-art.js` draws the deck with an orthographic camera computed in JS (affine planes + SVG cylinders, no CSS 3D).

The local-music pipeline is deliberately separate from the deck: `metadata.js` (tags + cover from MP3/M4A/FLAC/OGG/WAV) → `record-maker.js` (record object, palette, loudness envelope) → `record-art.js` (vinyl, label, sleeve). Other trinkets can reuse it without the turntable. The crate, persistence of imported files, playlists and any product rules stay in the host.

## 9. Typewriter

`components/typewriter/` is build-free like the turntable. `typewriter-core.js` owns the page without the DOM: a grid of columns × rows, the carriage column and platen line, strike / space / tab / backspace (erase or move) / return / line feed, the bell, the margin (wrap or lock), grapheme segmentation and East-Asian wide cells. `keyboard-layout.js` describes key caps by physical `KeyboardEvent.code` and maps characters back to caps, so the cap that moves is independent of the user's OS layout or IME. `typewriter-art.js` draws the machine with the same orthographic-camera approach as the turntable; the carriage is one layer translated along x. The element owns input (hidden textarea, `beforeinput`, IME composition), a stroke queue that times key → typebar → impact → escapement, and the synthesized sound. What the page is used for, where ejected pages go and persistence stay in the host.
