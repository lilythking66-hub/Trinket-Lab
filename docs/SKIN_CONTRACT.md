# Instant Photo Skin Contract

## Principle

**Skin controls appearance. Function controls behavior.**

A skin may change materials, colors, decorations, proportions within supported bounds, and panel artwork. It must not contain product logic, QR logic, camera permission logic, collection rules, or animation state management.

The first reference skin is **Neutral Camera V1**, a simple cream 2.5D camera designed as the repository master.

Reference:

![Neutral Camera V1](reference/neutral-camera-v1-reference.jpg)

## Shared structure

The two camera variants should look like members of the same product family and reuse as much of the physical body as practical.

~~~text
neutral-camera-v1/
├── shared/
│   ├── body-back
│   ├── body-front-base
│   ├── top-face
│   ├── side-face
│   ├── slot-mask
│   ├── slot-shadow
│   ├── shutter-normal
│   ├── shutter-pressed
│   ├── flash-off
│   ├── flash-on
│   ├── body-shadow
│   └── photo-mask / photo-slot geometry
│
├── instant-photo/
│   ├── front-panel
│   ├── lens-back
│   ├── lens-front
│   └── optional-status-light
│
└── instant-camera/
    ├── front-panel
    ├── screen-frame
    ├── screen-glass / overlay
    └── live-preview-slot
~~~

Exact file format and naming may evolve once the first implementation is cut into production assets. The conceptual layer boundary should remain stable.

## Why two front panels

### Instant Photo panel

This variant does not need a live viewfinder. The front can prioritize a recognizable lens, flash, status detail, and a visually complete camera face.

Its source image comes from outside the camera component.

### Instant Camera panel

This variant reserves a large screen/live-preview region for the real camera feed. The surrounding body still uses the same shared physical shell, slot, shutter, and flash language.

## Dynamic versus static layers

### Static skin assets

Usually supplied by a skin:

- shell/body surfaces
- decorative front panel
- lens art
- screen frame
- button art
- flash housing
- shadows/highlights that belong to the object

### Dynamic engine layers

Owned or controlled by the component/engine:

- live camera preview
- photo content
- photo metadata/caption rendering
- flash state visibility
- shutter pressed state
- photo position during ejection
- developing overlay/effect
- ready/taken interaction state

A skin can supply visual assets for dynamic states, but it must not own their state machine.

## 2.5D rendering rule

V1 is intentionally **layered 2.5D**, not true 3D.

Depth comes from:

- top/side faces
- slot masking and shadow
- lens/button elevation
- front/back layer ordering
- restrained rotation/translation
- photo overlap and occlusion

This keeps the component lightweight, mobile-friendly, and easy to reskin.

True 3D should only be considered if a future trinket requires free camera rotation, back-panel interaction, film loading, or other spatial behaviors that cannot be represented cleanly by layers.

## Skin acceptance

A new camera skin is acceptable when:

1. both Instant Photo and Instant Camera variants can be produced from the same shared shell family;
2. the output slot uses the same engine geometry and does not require custom animation logic;
3. the shutter can visually represent normal and pressed states;
4. the flash can visually represent off and on states;
5. the Instant Camera panel exposes a clean live-preview slot;
6. the Instant Photo panel works with no camera feed at all;
7. changing the skin does not require changes to Photo Engine state transitions;
8. removing decorative assets still leaves a functional interaction.

## Neutral Camera V1 visual direction

The repository master should remain deliberately neutral:

- warm cream / off-white body
- soft charcoal details
- restrained warm accent button
- rounded, friendly industrial shape
- minimal decoration
- soft, believable 2.5D depth
- no project-specific branding or regional motifs

Product skins such as Shuanglang, wedding, gift-box, retro, or character-themed versions should inherit the contract rather than modify the engine.
