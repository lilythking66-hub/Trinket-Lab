# Photo Engine

Shared mechanics for the Instant Photo family: the layered camera, the state machine, the film card, ejection, developing and the take-away gesture. Both `<instant-photo>` and `<instant-camera>` run on this one engine; neither has its own animation code.

Not responsible for camera capture, QR scanning, campaign logic or collection state.

## Files

| File | What it does |
|---|---|
| `photo-engine.js` | `PhotoEngine` — state machine, stage building, film card, motion, drag-to-take |
| `camera-element.js` | `TrinketCameraElement` — base custom element: shadow DOM, attributes → options, event forwarding |
| `skin.js` | `loadSkin(url)` — reads a skin's `web/manifest.json` |
| `render-card.js` | Renders a finished card (paper + photo + caption) to a canvas for save/share |
| `sound.js` | Synthesized shutter / motor / paper cues (no audio files) |
| `style.js` | Shadow-DOM CSS |
| `util.js` | Small helpers |

Plain ES modules, no build step, no dependencies.

## States

~~~text
idle → shutter → flash → ejecting → developing → ready → taken → idle
~~~

- `print()` is accepted only in `idle` or `ready`. In `ready` the current photo is taken first. Any other state returns `false`, so a print can never overlap another.
- `reset()` aborts whatever is running and returns to `idle` without emitting `taken`.
- If the image fails to load, the engine returns to `idle` and emits `error`.

## Events

Dispatched on the engine, and re-dispatched from the elements with `bubbles` and `composed` set.

| Event | `detail` |
|---|---|
| `statechange` | `{ state, prev }` |
| `ready` | `{ recipe }` |
| `taken` | `{ recipe, toBlob(type?, scale?), toCanvas(scale?) }` — the output hand-off |
| `error` | `{ error }` |

The elements also reflect the current state as a `state="…"` attribute, so CSS can react to it.

## Timing

~~~js
DEFAULT_TIMING = { shutter: 110, flash: 170, eject: 1700, develop: 3600, take: 460 } // ms
~~~

Override per element with `develop-duration="…"` / `eject-duration="…"`, or pass `timing` to `new PhotoEngine(...)`.

`prefers-reduced-motion` is respected: no recoil, motor jitter or sway, a short take-away animation and a dimmer screen flash.

## Skins

The engine places skin images by **role name** (`shared/body-shell`, `shared/slot-lip`, `instant-photo/lens`, …) and owns the z-order defined in [`docs/SKIN_CONTRACT.md`](../../docs/SKIN_CONTRACT.md). A skin is just pictures plus `web/manifest.json`. Changing skins never touches this folder:

~~~html
<instant-photo skin="/skins/my-skin/web/manifest.json"></instant-photo>
~~~

Generate `web/` from a contract-compliant skin with `skins/<skin>/_source/export_web.py`. It trims each layer to its visible box and converts to WebP (Neutral Camera V1 is about 430 KB in total).

## Responsive behavior

Every position is a percentage of the skin's stage, so one camera scales from a small phone to a desktop. Image `sizes` are kept in step with the rendered width, so the browser picks @2x or @3x as needed. Mouse, touch and keyboard all work:

- the shutter is a real `<button>` with a larger hit area than the drawn button;
- a ready photo can be tapped, dragged, or taken with Enter/Space.
