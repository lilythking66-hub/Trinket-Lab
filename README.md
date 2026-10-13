# Trinket Lab 🧸

**A collection of playful, reusable interactive objects for the web.**

Trinket Lab is a home for small digital objects that feel like things: cameras that eject photos, printers that feed paper, books that open and turn, gacha machines, gift boxes, radios, and other tactile interactions.

The goal is not to build one giant UI framework. Each trinket should stay small, understandable, skinnable, and reusable across different products.

## Principles

- **Object first.** A trinket should feel like a coherent interactive object, not a pile of disconnected effects.
- **Reusable by default.** Product-specific logic stays outside the core component.
- **Triggers are adapters.** QR scanning, buttons, external events, NFC, or other triggers should call a component; they should not be baked into it.
- **Skin without rewrites.** Visual skins and content recipes should be replaceable without changing the interaction engine.
- **Shared motion, separate products.** Related trinkets can share engines while keeping distinct public components.
- **Stay lightweight.** Add tooling only when the repository actually needs it.

## First family: Instant Photo

The first Trinket Lab family is built around a shared photo engine.

~~~text
Trigger / Content Source
        │
        ├───────────────┐
        ▼               ▼
  Instant Photo    Instant Camera
(external image)     (camera/selfie)
        │               │
        └───────┬───────┘
                ▼
          Photo Engine
 flash → eject → develop → take/save
~~~

### components/photo-engine

Shared interaction mechanics: photo card, ejection motion, developing effect, film rendering, and output lifecycle.

### components/instant-photo

Takes an image or prepared photo recipe from the outside and performs the instant-photo interaction. This is the version intended for experiences such as the Shuanglang stamp/collection project.

### components/instant-camera

Adds live camera/selfie capture, then feeds the captured frame into the same photo engine.

### triggers/qr

An optional QR adapter. It can resolve a code into a photo recipe and call Instant Photo, but **Instant Photo does not know or care whether QR exists**.

## Neutral Skin V1

The first visual master is a neutral, minimal 2.5D instant camera with two interchangeable front panels: one for external-photo output and one for camera/selfie capture. The skin is a reference implementation, not part of the functional contract.

![Neutral Camera V1 reference](docs/reference/neutral-camera-v1-reference.jpg)

See [Instant Photo V1](docs/INSTANT_PHOTO_V1.md) for behavior and acceptance criteria, and [Skin Contract](docs/SKIN_CONTRACT.md) for the asset boundary.

## Repository shape

~~~text
Trinket-Lab/
├── components/
│   ├── photo-engine/
│   ├── instant-photo/
│   └── instant-camera/
├── triggers/
│   └── qr/
├── demos/
│   └── instant-photo-family/
└── docs/
    └── ARCHITECTURE.md
~~~

This is intentionally a lightweight foundation rather than a full monorepo setup. Build tooling can be introduced once multiple working trinkets genuinely need shared packaging/versioning.

## Future trinkets

Likely future residents include printers, books and bookshelves, gacha machines, gift boxes, radios, photo booths, and other interactive props.

## Status

Early foundation. The first implementation target is the Instant Photo family.
