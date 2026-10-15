# Crank Press

A reusable 2.5D hand-crank roller press: **grab the wheel and turn it → a brass pattern roller grips the sheet → the pattern is pressed in as it comes out → the sheet rests on the table until you take it.**

The machine is the reusable part. What the sheet is (an embossed slip, a ticket, a fortune note, a card), what's printed on it and where it goes afterwards stay in the host. The same base is meant to become a ticket machine, a little note printer or an embosser by changing the roller, the paper and the sheet content, not the mechanics.

[Open the live demo →](https://lilythking66-hub.github.io/Trinket-Lab/demos/crank-press/)

## Use

~~~html
<script type="module" src="./components/crank-press/press-element.js"></script>
<trinket-press roller="vine" autoload></trinket-press>
~~~

Drag the wheel (or the handle) round. On a keyboard, focus the machine and hold → / ↓ / Space; Enter cranks the sheet all the way out, or takes it when it is out.

~~~js
const press = document.querySelector("trinket-press");

await press.load({ paper: "kraft", length: 440 });   // resolves when the rollers grip it
await press.crank(1);                                // one animated turn
await press.feedAll();                               // crank until the sheet is on the table
const { sheet, node } = await press.take();          // node: a standalone copy for your page
~~~

## How it behaves

- **One shaft drives everything.** The pattern roller sits on the crank shaft: one turn feeds one roller circumference (`press.turnLength`, about 327 sheet px). The wheel, crank arm, gears, counter-gear and the roller surface all follow the same angle.
- **Ratchet.** A pawl lets the crank go forward only. Turning back settles on the last tooth (12 per turn) with a click and a `pawl` event.
- **Flywheel.** Let go mid-turn and it coasts. A sheet in the nip adds friction, so pressing feels heavier than turning empty.
- **The sheet's life:** `loading` (slides along the infeed to the nip) → `gripped` (moves exactly with the roller surface) → `released` (the trailing edge leaves the nip and it slides out) → `out` (resting on the table, tap to take) → taken.
- **The impression is real to the roller.** The roller and the paper share one height map, so what's on the sheet is exactly what the roller pressed at that moment. The roller carries the mirror image, like a die, so letters read correctly on paper.
- **Sheet-sized dies are indexed.** Patterns that fit the sheet (`frame`, `monogram`) are aligned to the sheet's top edge when it is gripped. With `length = press.turnLength`, one crank turn makes exactly one framed ticket.
- The blank part of the sheet waits on the infeed tray behind the rollers. Only what has passed the nip carries the pattern or the content.
- All sounds (pawl, gear purr, paper pressing, grip, release, take) are synthesized; there are no audio assets. Light haptic ticks on Android while you crank by touch.

## Rollers

| `roller` | |
|---|---|
| `vine` (default) | floral vine with five-petal flowers, leaves and curls |
| `paws` | kitten paw prints and small hearts |
| `stars` | crescent moons and stars |
| `bows` | ribbon bows |
| `frame` | vintage ticket border: double rule, notched corners, ornaments (sheet-sized) |
| `leaves` | botanical sprigs |
| `monogram` | a laurel wreath around a letter from `letter` (any character, CJK too; sheet-sized) |
| `plain` | smooth roller, for printing host content only |

Custom roller:

~~~js
press.pattern = {
  label: "Hearts",
  tile: 40,                     // tile width in sheet units (1 unit = 2 sheet px), or "sheet"
  draw(ctx, w, h) {             // h = one roller circumference; white = raised
    ctx.fillStyle = "#fff";
    for (let y = 10; y < h; y += h / 4) ctx.fillRect(w / 2 - 4, y, 8, 8);
  },
};
~~~

`patternPreview(name, { paper, width, height, letter })` resolves to a data URL of the pattern pressed into paper, useful for pickers (the demo uses it).

## Impression

| `impression` | |
|---|---|
| `emboss` (default) | raised relief with light and shadow, no ink |
| `deboss` | the pattern pressed in |
| `ink` | the pattern printed in the `ink` colour (and the roller looks inked) |
| `none` | the roller only carries the sheet; content comes from the host |

## Sheets

~~~js
press.load({
  width: 200,            // sheet px, up to 280
  length: 440,           // sheet px
  paper: "cream",        // cream · white · kraft · watercolor (deckled edges) · blue · pink · or any CSS colour
  content: "<div class='ticket'>…</div>",  // HTML string, Node, <template>, or a function returning one
  lead: 34,              // how far before the nip it starts (sheet units); 0 = gripped at once
  id, data,              // anything you want back on events
});
~~~

Sheet content is laid out at its real size in CSS px (200 × 440 by default). The component draws it at half scale inside the machine, so text stays crisp and minimum-font-size settings don't affect it.

Declarative sheets, styled by the host:

~~~html
<trinket-press roller="frame" impression="ink" autoload="ticket" refill>
  <style data-sheet-style>
    .ticket { padding: 40px 26px; text-align: center; font-family: Georgia, serif; }
  </style>
  <template data-sheet="ticket" data-length="327" data-paper="cream">
    <div class="ticket">ADMIT ONE</div>
  </template>
</trinket-press>
~~~

`<style data-sheet-style>` children are copied into the shadow root. Because they also sit in the page, the same rules style the copies handed back by `take()`.

## Public API

### Attributes

| Attribute | Meaning |
|---|---|
| `theme` | `cream` · `coral` · `navy`; omit for vintage green |
| `roller` | see Rollers |
| `letter` | monogram letter (default `A`) |
| `impression` | `emboss` · `deboss` · `ink` · `none` |
| `ink` | `black` · `red` · `blue` · `brown` · `green` · `gold` or any CSS colour |
| `paper` | default paper for sheets without one |
| `label`, `sublabel` | the brass maker's plate (default `TRINKET` / `PAPER WORKS`) |
| `autoload` | load a sheet on connect (`autoload="name"` picks a `<template data-sheet>`) |
| `refill` | load the same kind of sheet again after one is taken |
| `locked` | the crank can't be turned |
| `haptics="off"` | no vibration ticks on touch |
| `sfx="off"`, `muted`, `volume` | sound |

### Properties & methods

`state` (`empty` · `loading` · `gripped` · `released` · `out`), `progress` (0–1), `turns`, `turnLength`, `sheet`, `busy`, `pattern`, `labels`

`whenReady()`, `load(spec | name)`, `crank(turns, { speed })`, `feedAll({ speed })`, `take()`, `clear()`

Promises always settle:

| Call | Resolves with | …or, when interrupted |
|---|---|---|
| `load()` | the sheet, once the rollers grip it | `null` if `load()` / `clear()` replaces it first |
| `crank()` | `true` on reaching the target | `false` if another `crank()`, a hand on the wheel, the keys, `locked` or removal from the page stops it |
| `feedAll()` | the sheet, once it rests on the table | `null` if the sheet is cleared or replaced, or its crank is stopped (clearing or replacing the sheet also stops the crank `feedAll()` started) |
| `take()` | `{ sheet, node }` | `null` if there is nothing to take |

`load()` runs synchronously once the element is ready, so `load(); clear();` happens in call order.

### Lifecycle

Moving the element around the DOM (detached and re-attached in the same task) carries on where it was. Detached for longer, it pauses: the motor stops (its `crank()` resolves `false`), a hand on the crank is released and sound is closed. A loading or sliding sheet waits and continues when the element is attached again. Calling API methods or detaching the element from inside event handlers is safe: there is only ever one animation loop, and none while detached.

### Events

`ready`, `load`, `grip`, `feed` (`{ progress, fed, length }`, every frame while it moves), `tick` (`{ count, turns }`, each ratchet tooth), `pawl`, `complete` (the sheet has left the rollers), `out` (it is resting on the table), `take` (`{ sheet, node }`).

### Styling hooks

`--trinket-press-body`, `--trinket-press-brass`, `--trinket-press-steel`, `--trinket-press-iron`, `--trinket-press-wood`, `--trinket-press-ink`, `--trinket-press-shadow`, `--trinket-press-width` (default 620px). Part: `stage`.

### Localization

~~~js
press.labels = { crank: "手摇柄：拖动飞轮转一圈，或按住右方向键", sheet: "压好的纸：点击取走" };
~~~

## Tests

`node demos/crank-press/tests/core-smoke.mjs` covers the mechanics. Open `demos/crank-press/tests/lifecycle.html` from a local server for the element's lifecycle and promise checks (detach / re-attach, moves during a frame, superseded `load()` / `crank()` / `feedAll()`).

## Structure

~~~text
press-core.js       crank angle, ratchet, flywheel, motor, sheet lifecycle (no DOM)
press-art.js        orthographic camera, machine geometry, sheet path, lathe silhouettes, flat artwork
press-patterns.js   roller patterns (height maps) → roller die and paper impression textures; papers
sound.js            synthesized mechanics
style.js            shadow-DOM styles, finishes
press-element.js    <trinket-press>: build, crank input, sheet layers, render loop, API
~~~

The machine is drawn with the same JavaScript orthographic camera as Turntable and Typewriter: flat faces are 2D affine CSS matrices, turned parts are SVG lathe silhouettes and side frames are stacked profile layers. The pattern roller is a ring of thin facets whose background scrolls with the crank under one smooth light pass. The sheet follows a fixed path (nip → guide plate → drape → table). Each segment is a plane showing a copy of the sheet, offset by how far it has been fed. There is no CSS 3D and no WebGL.

## Ideas this base is meant for

- **Ticket machine:** `roller="frame" impression="ink"`, `length = press.turnLength`, numbered content from a function, `refill`.
- **Note printer:** `roller="plain" impression="none"`, a narrow `width`, a message as content.
- **Embosser / gift card:** `roller="monogram" letter="L"` on watercolour paper, then put `take()`'s node into a gift-box scene.

## Notes

- Works with mouse, touch (the wheel area doesn't scroll the page) and keyboard.
- Browsers only play sound after a user gesture; the first drag or key unlocks it.
- Sheet content is static: it is copied onto each visible segment, so keep scripts and live widgets out of it.
- The long tail of a sheet lies on the table in front of the machine. Very long sheets extend past the element's box (overflow is visible); give the host container room or `overflow: hidden`.
