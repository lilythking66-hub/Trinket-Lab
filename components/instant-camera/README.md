# Instant Camera

The screen faces you and the lens faces the world. The screen is a viewfinder, so by default it prefers the **back camera** to shoot what's in front of you. `switchCamera()` toggles front/back when the device supports it.

This component owns the live preview and shutter capture; camera access itself comes from the shared `components/camera-kit/camera-source.js`. The captured frame is handed to the shared Photo Engine, so ejection and developing are exactly the same as in Instant Photo.

## Use

~~~html
<script type="module" src="components/instant-camera/instant-camera.js"></script>

<instant-camera caption="Hello!" date="auto"></instant-camera>
~~~

- Tapping the dark screen, or the shutter, turns the camera on. The browser asks for permission at that point.
- Once the preview is live, the shutter captures a square frame (what the film window shows) and prints it.
- Mirroring follows the camera actually in use. The front camera and laptop webcams are mirrored (like a mirror); the back camera is not. The print matches what was on the screen.
- Devices with only one camera (most laptops) simply use it, whatever `facing` asks for.

## Camera states

`cameraState` property, reflected as a `camera-state` attribute, with a `camerastate` event (`{ state, prev, error }`):

| State | Screen shows |
|---|---|
| `off` | `Tap to open camera` |
| `starting` | `Opening camera…` |
| `live` | the preview |
| `denied` | `Camera permission denied` + Retry / Choose photo |
| `unavailable` | `No camera available` + Choose photo |
| `busy` | `Camera is in use` + Retry / Choose photo |
| `insecure` | `Camera requires HTTPS` + Choose photo |
| `error` | `Could not open camera` + Retry / Choose photo |

`Choose photo` opens the photo picker and prints the chosen image through the same engine. That is the fallback when the camera can't be used, and it never affects Instant Photo.

The camera stops when the page is hidden, and restarts when the page becomes visible again if it was live before. Removing the element releases the stream and its `<video>`; putting it back creates a new camera on the next start. If the stream ends on its own (taken by another app, unplugged, or permission revoked), all remaining tracks are released and the screen returns to `Tap to open camera` without auto-reopening.

## Attributes

The shared ones from [Instant Photo](../instant-photo/README.md#attributes) (`skin`, `sound`, `haptics`, `no-screen-flash`, timings, `state`), plus:

| Attribute | Meaning |
|---|---|
| `facing` | `environment` (default) or `user` |
| `mirror` | `auto` (default) / `on` / `off` |
| `autostart` | Request the camera as soon as the element is ready |
| `caption`, `date` | Printed on each capture; `date="auto"` uses today's date |

## Methods

`startCamera()`, `stopCamera()`, `switchCamera()`, `captureFrame()` (→ JPEG Blob), `pickPhoto()`, plus everything from Instant Photo: `print()`, `take()`, `reset()`, `exportCard()`, `whenReady()`.

## UI copy overrides

Set `labels` and/or `messages` on the element before it becomes ready to localize host-facing copy without changing the component:

~~~js
const camera = document.querySelector("instant-camera");
camera.labels = { shutter: "Snap", take: "Keep", openCamera: "Start" };
camera.messages = {
  denied: { text: "Camera access is blocked" },
  actions: { retry: "Try again", pick: "Choose image" },
};
~~~

## Requirements

`getUserMedia` only works on **HTTPS or localhost**. On plain `http://` over a LAN (for example, a phone opening your laptop's IP) the camera reports `insecure`, and the photo picker still works.
