# Gacha

A reusable 2.5D tabletop capsule machine: **insert a coin (optional) → grab and turn the knob → a capsule drops into the tray → take it out → pull the halves apart → the prize appears.**

The machine is the reusable part. What comes out of it is always host content.

[Open the live demo →](https://lilythking66-hub.github.io/Trinket-Lab/demos/gacha/)

[![Gacha demo](../../docs/demo-images/gacha-demo.jpg)](https://lilythking66-hub.github.io/Trinket-Lab/demos/gacha/)

## Use

~~~html
<script type="module" src="./components/gacha/gacha-element.js"></script>

<trinket-gacha theme="mint" price="100">
  <template data-prize="plant" data-color="#62c0a0" data-thumb="🪴" data-weight="3">
    <article class="my-prize">A desk plant</article>
  </template>
  <template data-prize="key" data-color="#f19bb2" data-thumb="🗝️" data-weight="1" data-stock="5">
    <article class="my-prize rare">A tiny key</article>
  </template>
</trinket-gacha>
~~~

Or entirely from JavaScript:

~~~js
const gacha = document.querySelector("trinket-gacha");

gacha.prizes = [
  { id: "film", color: "#e2574c", thumb: "🎞️", weight: 3, content: "<h2>A roll of film</h2>" },
  { id: "card", color: "#4f86c6", thumb: "./img/card-thumb.png", stock: 10, content: someElement },
  { id: "sun",  color: "#f2c14e", title: "Sunny sticker", description: "No content → default card" },
];

gacha.addEventListener("reveal", (e) => console.log("got", e.detail.prize.id));
~~~

The prize content is cloned into the element's light DOM (`slot="prize"`), so **your page's CSS styles it** — the component never ships prize styling.

## Prize shape

| Field | Meaning |
|---|---|
| `id` | stable id (string) |
| `color` | capsule colour — any CSS colour |
| `thumb` | optional thing visible through the clear half: an emoji/short text, or an image URL |
| `weight` | relative draw chance, default 1; 0 = never drawn |
| `stock` | optional finite stock; omitted = unlimited |
| `content` | HTML string, a DOM node, or a `<template>` |
| `render(prize, holder)` | optional function that builds the content |
| `title`, `description`, `image` | used by the built-in card when no content is given |
| anything else | passed through untouched in event details |

Declarative `<template data-prize>` children map `data-weight`, `data-stock`, `data-color`, `data-thumb`, `data-title` the same way. Setting `gacha.prizes` overrides templates; `gacha.prizes = null` goes back to them.

### Who decides the result

By default the core makes a weighted draw among prizes with stock. Hosts can take over:

~~~js
gacha.resolvePrize = async ({ prizes, history }) => {
  const res = await fetch("/api/draw", { method: "POST" });
  return (await res.json()).prizeId;   // an id, a prize object, or null → default draw
};

gacha.turn({ prize: "key" });          // force one specific result
gacha.renderPrize = (prize, holder) => myFramework.mount(holder, prize); // framework rendering
~~~

## Public API

### Attributes

| Attribute | Meaning |
|---|---|
| `theme` | `butter` · `mint` · `navy`; omit for classic red |
| `require-coin` | knob is locked until a coin is inserted |
| `coin-input="none"` | the coin slot can't be tapped; credits only come from `insertCoin()` (e.g. after payment) |
| `price` / `label` | text on the price tag / name plate |
| `capsules` | how many capsules are shown in the globe (default 24, capped by remaining stock) |
| `turns` | full knob turns needed per capsule (default 1, four detents per turn) |
| `reveal="inline"` | present the capsule inside the element instead of a full-screen overlay |
| `prize-frame="none"` | no default card around your prize content |
| `muted` | no synthesized sounds |
| `seed` | deterministic randomness (demos/tests) |
| `state` | reflected: `locked · idle · turning · dispensing · waiting · presenting · revealed · empty` |

### Properties & methods

`prizes`, `resolvePrize`, `renderPrize`, `labels`, `state`, `credits`, `prize`, `history`, `remaining`

`whenReady()`, `insertCoin(n)`, `turn({ prize? })`, `take()`, `open()`, `collect()`, `reset()`, `refill()`

### Events

`ready`, `statechange`, `coin`, `turnstart`, `detent`, `dispense`, `land`, `take`, `reveal` (`detail.element` is your mounted content), `collect`, `empty`, `blocked` (`reason: locked | busy | empty`), `reset`, `error`.

### Styling hooks

CSS custom properties: `--trinket-gacha-accent`, `--trinket-gacha-body`, `--trinket-gacha-metal`, `--trinket-gacha-glass`, `--trinket-gacha-shadow`, `--trinket-gacha-card`, `--trinket-gacha-ink`, `--trinket-gacha-width`, `--trinket-gacha-open-size`, `--trinket-gacha-backdrop`, `--trinket-gacha-overlay-z`. All shading is derived from these with `color-mix()`, so one accent colour is enough for a new colourway.

Parts: `stage`, `machine`, `knob`, `overlay`, `backdrop`, `capsule`, `prize`, `caption`, `actions`, `keep`. Extra buttons can go in `slot="actions"` next to Keep.

### Localization

~~~js
gacha.labels = {
  keep: "Keep it",
  hintOpen: "Pull the capsule apart",
  hintTake: "Tap the capsule to take it",
  hintLocked: "Insert a coin first",
};
~~~

## Structure

~~~text
gacha-core.js       state machine, weighted draw, stock, knob ratchet (no DOM)
capsule-physics.js  capsule pile in the globe (Verlet, no DOM)
capsule-art.js      capsule drawing for canvas + SVG (split halves)
machine-art.js      procedural vector skin in one 400 × 700 view
sound.js            synthesized tick / clack / thunk / clink / pop
style.js            shadow-DOM styles + theme presets
gacha-element.js    <trinket-gacha>: wiring, interaction, animation
~~~

Layer order in the machine: back glass + floor → capsule canvas → glass, lid, collar, body → knob (rotor + static gloss) → tray capsule → transparent flap → hit areas.

Unlike the photo and printer families, this skin is procedural vector art rather than raster layers, so colourways are pure CSS. A raster skin can later replace `machine-art.js` as long as it keeps the `GEOM` anchors (globe, floor, exit, knob, coin slot, tray).

## Notes

- Works with mouse, touch and keyboard (Enter turns; →/↓ advance one detent; Escape keeps the revealed prize). Tapping the knob turns it automatically.
- Honours `prefers-reduced-motion`.
- The full-screen overlay uses `position: fixed`; if an ancestor has a `transform`/`filter`/`contain`, use `reveal="inline"`.
- The physics loop sleeps when the pile is at rest.
