# Camera Kit

Camera plumbing shared by Instant Camera and the optional selfie lens of Instant Photo. The Photo Engine does not depend on it.

| File | What it does |
|---|---|
| `camera-source.js` | `CameraSource`: one `getUserMedia` stream with states (`off · starting · live · denied · unavailable · busy · insecure · error`), front/back switching, mirroring that follows the actual camera, pause while the page is hidden, and `captureSquare({ size, fisheye })` |
| `fisheye.js` | `FisheyeView`: a WebGL fisheye lens (barrel distortion, vignette, slight color fringing) for live drawing; `renderFisheyeCanvas()` for captures |

~~~js
import { CameraSource } from "./camera-source.js";
const cam = new CameraSource({ facing: "user" });
cam.addEventListener("statechange", (e) => console.log(e.detail.state));
await cam.start();                                   // asks for permission
const blob = await cam.captureSquare({ fisheye: 0.65 });
~~~

## Lifecycle

- `cam.stop()` stops the stream; the instance can be started again.
- `cam.destroy()` stops the stream, removes the page `visibilitychange` listener and releases the `<video>`. A destroyed instance can't be restarted: create a new one. The components call it when they leave the page.
- `view.dispose()` deletes the GL texture, buffer and program and loses the context. Browsers allow only about 16 live WebGL contexts per page.
- If the stream ends on its own (another app or tab takes the camera, it is unplugged, or permission is revoked), `CameraSource` cancels any pending start, stops the remaining tracks, detaches the `<video>`, sets `error` (`AbortError`) and goes to `off`. It does not reopen by itself.

The camera only works on HTTPS or localhost (browser rule for camera access).
