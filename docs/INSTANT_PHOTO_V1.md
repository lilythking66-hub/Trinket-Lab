# Instant Photo Family — V1

## Goal

Build one reusable instant-photo interaction engine with two entry components:

- **Instant Photo** — accepts external/prepared images such as scenic photos, generated compositions, gift photos, or campaign content.
- **Instant Camera** — captures a live camera/selfie frame, then hands that image to the same engine.

Neither component owns product-specific campaign state.

## Shared Photo Engine

Both entry components must use the same engine for the physical illusion and lifecycle.

### State flow

~~~text
idle
  ↓
shutter
  ↓
flash
  ↓
ejecting
  ↓
developing
  ↓
ready
  ↓
taken
~~~

### State responsibilities

- **idle** — camera is ready and no photo is moving.
- **shutter** — short press/capture response; optional tiny body recoil.
- **flash** — flash state turns on briefly; the component may play a flash/shutter cue.
- **ejecting** — photo moves from behind the slot mask into view.
- **developing** — image transitions from blank/low-information to the final image.
- **ready** — fully developed photo can be taken, dragged, saved, dismissed, or handed back to the host product.
- **taken** — output interaction is complete and the engine can reset to idle.

A V1 implementation may combine shutter and flash timing internally, but the states should remain conceptually distinct so skins and future effects can react to them.

## Instant Photo

Input is a prepared photo recipe.

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

The component must work when triggered directly by code or a normal button. QR is never required.

Example product flow:

~~~text
scan QR
  → product resolves spot ID
  → product builds PhotoRecipe
  → Instant Photo.print(recipe)
  → shared Photo Engine
~~~

The same component must also work as:

~~~text
button / gift / script / campaign event
  → Instant Photo.print(recipe)
  → shared Photo Engine
~~~

## Instant Camera

V1 camera responsibilities:

- request and report camera permission
- show live preview
- support selfie-friendly mirroring
- capture a shutter frame
- pass the captured image to the shared Photo Engine

The camera component must not maintain a separate ejection or developing implementation.

## Optional triggers

Triggers are adapters outside the components. V1 may include:

- manual/button
- external program call
- QR

Future triggers may include NFC, location, beacon, or other host-product events.

Removing the QR adapter must not change or break Instant Photo or Photo Engine.

## V1 interaction acceptance

The family is considered functionally usable when all of the following are true:

1. A prepared image can be passed to Instant Photo without QR.
2. Triggering a print runs the visible sequence: shutter/flash → eject → develop → ready.
3. The photo begins behind the output-slot mask and appears to physically leave the camera.
4. Development is visibly progressive rather than instantly swapping to the final image.
5. The ready photo can be taken/dismissed and the component returns to a usable idle state.
6. Re-triggering during an active print does not create overlapping broken states.
7. Instant Camera can capture a live frame and feed it into the exact same ejection/develop flow.
8. Camera permission failure has a usable fallback/error state and does not break the rest of the family.
9. The neutral skin can be replaced without editing Photo Engine behavior code.
10. Removing QR code support leaves the external-image flow fully functional.

## V1 quality target

The priority is **tactile feel over feature count**.

The first pass should focus on:

- convincing masking at the slot
- natural ejection easing
- restrained camera recoil
- short flash timing
- pleasant development timing
- clean reset after the photo is taken

Not required for V1:

- true 3D camera geometry
- film inventory
- battery simulation
- camera-back interactions
- location-aware logic
- collection/album state
- backend campaign rules
- advanced filters or editing tools
