// QR trigger — optional adapter.  scan → resolve payload → PhotoRecipe → target.print()
//
// Instant Photo never imports this file. Delete the folder and everything else works.
//
// Two ways a QR code reaches a page:
//  1. The phone's own camera app scans a code that is a URL (…/demo?spot=lake).
//     → triggerFromUrl() reads the parameter and prints. No in-page scanner needed.
//  2. An in-page scanner reads the code from a <video>. → scanQR()

/**
 * Wire a resolver to a print target.
 * @param {{ resolve: (payload: string) => (object|null|Promise<object|null>), target: { print: Function } }} cfg
 */
export function createQrTrigger({ resolve, target }) {
  return {
    /** Handle one decoded payload. Resolves { payload, recipe, printed }. */
    async handle(payload) {
      const recipe = await resolve(String(payload).trim());
      if (!recipe) return { payload, recipe: null, printed: false };
      const printed = await target.print(recipe);
      return { payload, recipe, printed };
    },
  };
}

/** Read a payload from the page URL (?spot=…). Returns null if absent. */
export function readPayloadFromUrl(param = "spot", href = location.href) {
  return new URL(href).searchParams.get(param);
}

/**
 * If the page was opened from a QR URL, print its recipe.
 * Removes the parameter afterwards (so reloading doesn't print again) unless keepParam.
 */
export async function triggerFromUrl({ param = "spot", resolve, target, keepParam = false }) {
  const payload = readPayloadFromUrl(param);
  if (!payload) return null;
  if (!keepParam) {
    const url = new URL(location.href);
    url.searchParams.delete(param);
    history.replaceState(history.state, "", url);
  }
  await target.whenReady?.();
  return createQrTrigger({ resolve, target }).handle(payload);
}

/**
 * Scan a QR code from a playing <video>. Uses the native BarcodeDetector when the
 * browser has it, otherwise loads jsQR on demand.
 * @param {HTMLVideoElement} video
 * @param {{ signal?: AbortSignal, interval?: number }} [opts]
 * @returns {Promise<string>} the decoded text
 */
export async function scanQR(video, { signal, interval = 180 } = {}) {
  const detect = await createDetector();
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d", { willReadFrequently: true });
  return new Promise((resolve, reject) => {
    let timer;
    const stop = () => clearTimeout(timer);
    signal?.addEventListener("abort", () => { stop(); reject(new DOMException("Scan aborted", "AbortError")); }, { once: true });
    const tick = async () => {
      if (signal?.aborted) return;
      try {
        if (video.readyState >= 2 && video.videoWidth) {
          const text = await detect(video, canvas, g);
          if (text) return resolve(text);
        }
      } catch (e) {
        return reject(e);
      }
      timer = setTimeout(tick, interval);
    };
    tick();
  });
}

let jsQRPromise = null;
async function createDetector() {
  if ("BarcodeDetector" in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats?.();
      if (!formats || formats.includes("qr_code")) {
        const bd = new window.BarcodeDetector({ formats: ["qr_code"] });
        return async (video) => (await bd.detect(video))[0]?.rawValue || null;
      }
    } catch {}
  }
  jsQRPromise ??= import("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm").then((m) => m.default || m);
  const jsQR = await jsQRPromise;
  return async (video, canvas, g) => {
    const w = Math.min(640, video.videoWidth);
    const h = Math.round((video.videoHeight / video.videoWidth) * w);
    canvas.width = w; canvas.height = h;
    g.drawImage(video, 0, 0, w, h);
    const res = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
    return res?.data || null;
  };
}
