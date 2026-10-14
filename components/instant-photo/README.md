# Instant Photo

The camera faces you.

- **Core job: prepared content → instant photo.** Call `print({ image, caption, … })` from code, a button, a gift flow or a QR trigger, or let the shutter print `el.recipe` / the `src` attribute. No camera is involved, and the camera code isn't even loaded. This is the path used by location/collection experiences such as the Shuanglang stamp project.
- **Optional: selfie lens** (add the `selfie` attribute). Tap the lens or the shutter: the front camera turns on and you see yourself *inside the lens*, through a fisheye. Press the shutter to take the shot. The print uses the same fisheye, so it matches what was in the lens.

[![Instant Photo demo](../../docs/demo-images/instant-photo-demo.jpg)](https://lilythking66-hub.github.io/Trinket-Lab/demos/instant-photo-family/)

[Open the live demo →](https://lilythking66-hub.github.io/Trinket-Lab/demos/instant-photo-family/)

## Use

~~~html
<script type="module" src="components/instant-photo/instant-photo.js"></script>

<instant-photo src="photos/lake.jpg" caption="Good day :)"></instant-photo>   <!-- print only -->
<instant-photo selfie caption="Hi!" date="auto"></instant-photo>              <!-- + selfie lens -->
~~~

~~~js
const cam = document.querySelector("instant-photo");

await cam.print({
  image: "photos/lake.jpg",   // URL, blob: URL, data: URL — or pass a Blob/File directly
  caption: "Good day :)",
  date: "2026.10.13",
  stamp: "stamps/spot-07.png", // optional mark at the corner of the photo
  frame: "frames/xmas.png",    // optional replacement paper (card-sized)
  title: "Lake",               // used as alt text
  metadata: { spotId: 7 },     // passed back untouched in events
});
// → true once the photo is developed (state "ready"), false if busy or failed

cam.addEventListener("taken", async (e) => {
  const png = await e.detail.toBlob();   // the finished card, for an album / download
});
~~~

## Shutter behavior

1. If the selfie camera is live, the shutter takes a selfie.
2. Otherwise a cancelable `shutterpress` event is dispatched (`detail.recipe`). If it isn't cancelled and the element has content (`el.recipe = {...}` or the `src` / `caption` / `date` / `stamp` attributes), that content is printed.
3. Otherwise, with `selfie` enabled, the selfie camera turns on and the next press takes the picture. Without it, the button just gives a small press.

## Selfie lens (optional)

- Methods: `startCamera()`, `stopCamera()`, `switchCamera()`.
- `cameraState` property, reflected as a `camera-state` attribute, with a `camerastate` event (`{ state, prev, error }`). States: `off · starting · live · denied · unavailable · busy · insecure · error`.
- This variant has no screen, so camera problems are reported only through these events. The host decides what to tell people; the demo shows a hint line. Printing prepared content keeps working whatever the camera state.
- The fisheye is a WebGL shader in `components/camera-kit/fisheye.js`. Without WebGL the lens shows the plain feed and photos are printed without the fisheye.
- The camera turns off when the page is hidden and back on when it returns.
- Removing the element from the page releases everything: the camera stream, its `<video>`, the render loop and the WebGL context. Putting it back recreates them on demand. Removing the `selfie` attribute does the same.
- If the stream ends unexpectedly (another app or tab takes the camera, the camera is unplugged, or permission is revoked), the camera goes to `off` and releases the stream. It is not reopened automatically.

## Attributes

| Attribute | Meaning |
|---|---|
| `selfie` | Enable the selfie lens (off by default; `selfie="off"` also means off) |
| `fisheye` | Strength `0`–`1` (default `0.65`); `off` = plain lens |
| `mirror` | `auto` (default: front camera mirrored) / `on` / `off` |
| `caption`, `date` | Printed on selfies (and on `src` content); `date="auto"` uses today's date |
| `src`, `stamp` | Prepared content printed by the shutter when the camera is off |
| `skin` | URL of a skin `manifest.json` (default: Neutral Camera V1) |
| `sound` | Enable synthesized shutter / motor / paper cues |
| `haptics="off"` | Disable vibration (Android) |
| `no-screen-flash` | Disable the full-page white flash |
| `develop-duration`, `eject-duration` | Timing in ms |
| `state` | *(reflected, read-only)* current engine state |

## Methods

`print(recipe)`, `take()`, `reset()`, `exportCard(type?, scale?)`, `pressShutter()`, `whenReady()`, `startCamera()`, `stopCamera()`, `switchCamera()`. Properties: `state`, `cameraState`, `recipe`, `selfie`.

## UI copy overrides

The shared `labels` property can override accessible control labels before the element becomes ready:

~~~js
const photo = document.querySelector("instant-photo");
photo.labels = {
  shutter: "Snap",
  take: "Keep photo",
  openSelfie: "Open mirror",
  closeSelfie: "Close mirror",
};
~~~

## Sizing

The element is `display: block; width: 100%` and keeps the skin's aspect ratio. Its maximum width is `--trinket-width` (default `360px`). The lower part of the box is reserved for the photo hanging out of the slot.
