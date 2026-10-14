# Instant Photo Skin Contract

## Principle

**Skin controls appearance. Function controls behavior.**

A skin may change materials, colors, decorations, proportions within supported bounds, and panel artwork. It must not contain product logic, QR logic, camera permission logic, collection rules, or animation state management.

The repository includes a reference runtime skin so the component can be used and tested out of the box. This document defines the public asset contract only; internal master boards and art-direction sheets are not part of the repository contract.

---

## 1. Canonical view

All layers of one skin are drawn from **one single view**. Layers from different views cannot be stacked.

- Every layer in a skin must use the same artboard, camera angle, and coordinate system.
- The photo ejects **straight down** out of the slot, with no tilt baked into the artwork. Any tilt during ready/taken is applied by the engine as a transform.
- Decorative shapes, materials, colors, and control placement belong to the skin implementation, not to this contract.
- Back-side interaction is out of scope for V1.

---

## 2. Layer stack

Bottom → top. `[engine]` = rendered by code, no art file. `[variant]` = differs between Instant Photo and Instant Camera.

| z | Layer | Group | Notes |
|---|---|---|---|
| 00 | `body-shadow` | shared | Ground contact shadow. Stays still when the body recoils. |
| 10 | `body-shell` | shared | Shell: top face + top buttons, rounded side edges, bottom ledge. Front-panel area may be plain cream. **No slot drawn here.** |
| 20 | `slot-cavity` | shared | Dark slit interior of the output slot, with inner shadow. Sits **behind** the photo. |
| 30 | photo | `[engine]` | Film card + image. Clipped by the engine to the area below `slotLine`. |
| 40 | `slot-lip` | shared | Upper lip of the slot: highlight edge + a soft semi-transparent shadow falling downward onto the photo. Sits **in front of** the photo and hides the clip seam. |
| 50 | `front-panel` | `[variant]` | **Clean plate.** Flash, shutter, lens and screen areas are left plain/recessed, not painted (see §4). |
| 55 | live preview / `screen-off` | `[variant]` camera | Video is `[engine]`; `screen-off` is the art shown when the camera is off / denied / unavailable. |
| 56 | `screen-glass` | `[variant]` camera | Transparent reflection/gloss overlay above the video. |
| 57 | `screen-frame` | `[variant]` camera | Dark bezel; its inner edge overlaps the preview by a few px to hide video edges. |
| 60 | `lens` | `[variant]` photo | Main lens barrel + glass, one piece. |
| 61 | `lens-glint` | `[variant]` photo | Optional. Transparent highlight on the glass. |
| 62 | `front-dots` | `[variant]` | Small dark sensor / selfie-camera dots. May be baked into `front-panel` if static. |
| 63 | `status-light-off` / `-on` | `[variant]` | Optional. |
| 70 | `flash-housing` | shared | Frame/bezel of the flash window. |
| 71 | `flash-lamp-off` / `flash-lamp-on` | shared | Inner lamp only; must fit exactly inside the housing. |
| 75 | `shutter-normal` / `shutter-pressed` | shared | Pressed = slightly sunk, darker rim, smaller shadow. Same canvas position. |
| 90 | `flash-glow` | shared | Light bloom; extends **outside** the housing, transparent, used with additive/screen blend. |
| 99 | full-screen flash | `[engine]` | White flash overlay. No art. |

**Grouping rule:** layers 10–90 (including the photo while still in the slot) form one `body` group, so recoil moves the camera and the half-ejected photo together. `body-shadow` sits outside the group.

---

## 3. Film assets

Used by Photo Engine. Same skin folder.

| Asset | Notes |
|---|---|
| `film-paper` | Card with border and a subtle paper texture. The image window is filled with the **undeveloped tone** (pale milky grey). |
| `film-shadow` | Soft drop shadow, separate so the engine can change it during ejecting/ready/taken. |
| `film-gloss` | Optional. Transparent sheen over the window. |
| `film-develop-texture` | Optional. Grain/noise tile the engine can fade out during developing. |

Film proportions are defined by the skin's runtime geometry/layout data rather than by static presentation artwork.

Not drawn as art:

- **Photo image**: placed into `photoWindow` by the engine.
- **Caption / date / stamp** (e.g. "Good day :)"): rendered as text by the engine. The skin may name a handwriting font in `layout.json`.
- **Developing transition**: engine.

**Size constraint:** film card width must be **slightly smaller than the slot opening** (≈ 4–8% narrower), so the card visibly fits through the slot.

---

## 4. Front panels

Both panels share the same outline, flash position and shutter position. Only the centre content differs.

### Instant Photo panel

- Plain cream plate with a recessed ring where `lens` sits, an empty pocket for the flash, and a flat spot for the shutter.
- One small charcoal dot upper right (viewfinder/sensor). May be baked in.
- Works with no camera feed at all.

### Instant Camera panel

- Plain cream plate with a rectangular cut-out for the screen. `screen-frame` covers its edge.
- Two small dots upper area (selfie camera + sensor). May be baked in.
- `screen-off`: dark charcoal glass with only a faint reflection. No icons or text. Error/permission messages are DOM.
- Screen UI icons (camera icon, switch icon, etc.) are DOM, not art.

**Clean plate rule:** a panel must never contain painted flash, shutter, lens or screen content. Otherwise state layers double up (two shutters, a lit flash on top of an unlit one).

---

## 5. Dynamic vs static

### Static skin assets (supplied by the skin)

Shell, panels, lens, screen frame/glass, flash and shutter art for each state, slot cavity/lip, shadows, film paper.

### Dynamic engine layers (owned by the component/engine)

- live camera preview
- photo content and its position during ejection
- caption/metadata text
- developing effect
- which flash/shutter state is visible
- photo clip at the slot line, photo shadow changes
- full-screen flash
- ready/taken interaction state

A skin supplies art for dynamic states but never owns their state machine.

### State → asset map

| Engine state | Visible skin changes |
|---|---|
| idle | `shutter-normal`, `flash-lamp-off` |
| shutter | `shutter-pressed`, body recoil (engine transform) |
| flash | `flash-lamp-on` + `flash-glow`, full-screen flash `[engine]` |
| ejecting | photo slides down from behind `slot-lip`; window shows the undeveloped tone |
| developing | image fades in over the undeveloped tone `[engine]` |
| ready | photo fully out, draggable |
| taken | photo leaves; back to idle |
| camera unavailable | `screen-off` + DOM message |

---

## 6. Export spec

- **One shared artboard** for every camera layer of a skin. Each layer is exported at **full artboard size** on a transparent background, already in position. No manual offsets.
- The artboard leaves enough empty space **below** the body to hold a fully ejected photo plus its shadow.
- Export **@2x and @3x**, **PNG** (WebP generated later). Raster is expected: the look is soft-rendered.
- Glow and shadow layers keep their soft falloff with no hard crop at the edges.
- Film assets (`film-*`) use their own artboard at card size, also @2x/@3x. Exception: `film-shadow` uses a padded artboard so its blur is not cropped; its offset relative to the card is given in `layout.json` → `film.shadow`. `film-develop-texture` is a single seamless 256px tile.
- Lighting: soft key light from upper left, matching the reference. Consistent across all layers.
- Palette (from the reference): warm white `#F4F2EE`, cream `#E6E1D9`, charcoal `#5B5B5B`, warm accent `#E8A08C`. Exact values may be tuned in the art pass.

### layout.json

Delivered next to the art. Coordinates are in artboard px @1x.

~~~json
{
  "artboard": { "w": 0, "h": 0 },
  "slotLine":   { "x1": 0, "x2": 0, "y": 0 },
  "photoStart": { "x": 0, "y": 0 },
  "photoReady": { "x": 0, "y": 0 },
  "flashCenter":   { "x": 0, "y": 0 },
  "shutterCenter": { "x": 0, "y": 0, "r": 0 },
  "lensCenter":    { "x": 0, "y": 0, "r": 0 },
  "lensGlass":     { "x": 0, "y": 0, "r": 0 },
  "screenRect":    { "x": 0, "y": 0, "w": 0, "h": 0, "radius": 0 },
  "film": {
    "card":        { "w": 0, "h": 0 },
    "photoWindow": { "x": 0, "y": 0, "w": 0, "h": 0 },
    "captionArea": { "x": 0, "y": 0, "w": 0, "h": 0 },
    "captionFont": ""
  }
}
~~~

`slotLine` is the y of the slot lip edge. The engine clips the photo above this line.

`lensGlass` is the circle of the Instant Photo lens glass. The engine puts a live-lens slot there, above `lens` and below `lens-glint`; the optional selfie camera draws into it. Leave it out for a skin whose lens should never show a live picture.

---

## 7. File tree

~~~text
skins/neutral-camera-v1/
├── layout.json
├── shared/
│   ├── body-shadow.png
│   ├── body-shell.png
│   ├── slot-cavity.png
│   ├── slot-lip.png
│   ├── flash-housing.png
│   ├── flash-lamp-off.png
│   ├── flash-lamp-on.png
│   ├── flash-glow.png
│   ├── shutter-normal.png
│   └── shutter-pressed.png
├── instant-photo/
│   ├── front-panel.png
│   ├── lens.png
│   ├── lens-glint.png            (optional)
│   └── status-light-off/on.png   (optional)
├── instant-camera/
│   ├── front-panel.png
│   ├── screen-off.png
│   ├── screen-glass.png
│   └── screen-frame.png
└── film/
    ├── film-paper.png
    ├── film-shadow.png
    ├── film-gloss.png            (optional)
    └── film-develop-texture.png  (optional)
~~~

Files are suffixed `@2x` / `@3x` on export.

---

## 8. 2.5D rendering rule

V1 is intentionally **layered 2.5D**, not true 3D.

Depth comes from:

- the top-face band and rounded edges baked into `body-shell`
- slot cavity / lip occlusion around the photo
- lens/button elevation and their shadows
- layer ordering
- restrained recoil and translation applied by the engine

True 3D should only be considered if a future trinket requires free camera rotation, back-panel interaction, film loading, or other spatial behaviors that layers cannot represent cleanly.

---

## 9. Skin acceptance

A new camera skin is acceptable when:

1. both variants are produced from the same shared shell family, with only `front-panel` and its variant parts differing;
2. all layers share one canonical view and one artboard, and stack correctly with no manual offsets;
3. the photo appears from behind `slot-lip` with no visible clip seam;
4. the film card is narrower than the slot opening;
5. the shutter shows normal and pressed states and the flash shows off and on states, with no duplicates baked into the panel;
6. the Instant Camera panel exposes a clean preview slot and has a `screen-off` state;
7. the Instant Photo panel works with no camera feed;
8. changing the skin requires no changes to Photo Engine state transitions, only new art plus `layout.json`;
9. removing decorative/optional assets still leaves a functional interaction.

---

## 10. Visual direction boundary

Visual direction is deliberately outside the public contract. A skin may use any coherent art direction as long as it satisfies the geometry, layer, state, and interaction requirements above.

Product skins inherit this contract rather than modify the engine.
