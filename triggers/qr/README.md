# QR Trigger

Optional trigger adapter for Trinket Lab components.

~~~text
scan → resolve payload → build photo recipe → call Instant Photo
~~~

The QR implementation must remain removable. Instant Photo and Photo Engine never import it. The demo loads it with a dynamic `import()` and simply hides the QR links if the folder is gone.

## Two ways a code reaches the page

**1. The phone's own camera app (recommended).** Print a QR code whose content is a URL such as `https://example.com/spot?spot=lake`. The page reads the parameter and prints, so no in-page scanner and no camera permission are needed.

~~~js
import { triggerFromUrl } from "./triggers/qr/qr-trigger.js";

triggerFromUrl({
  param: "spot",
  target: document.querySelector("instant-photo"),
  resolve: async (spotId) => buildRecipeFor(spotId), // product code; return null to ignore
});
~~~

The parameter is removed from the address bar afterwards, so a reload doesn't print again. Pass `keepParam: true` to keep it.

**2. An in-page scanner.** Use this when the page already has a camera stream.

~~~js
import { scanQR, createQrTrigger } from "./triggers/qr/qr-trigger.js";

const text = await scanQR(videoElement, { signal: abortController.signal });
await createQrTrigger({ resolve, target }).handle(text);
~~~

`scanQR` uses the browser's `BarcodeDetector` when available (Chrome/Android). Otherwise it loads jsQR from jsDelivr on first use.

Payload validation, spot IDs and unlock rules belong to the product's `resolve` function, not here.
