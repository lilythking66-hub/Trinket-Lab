// Shared base for <instant-photo> and <instant-camera>.
// Builds the engine inside a shadow root, maps attributes to options and
// re-dispatches engine events from the element (bubbling, composed).

import { PhotoEngine, normalizeRecipe } from "./photo-engine.js";
import { loadSkin, DEFAULT_SKIN_URL } from "./skin.js";
import { ENGINE_CSS } from "./style.js";

const FORWARDED = ["statechange", "ready", "taken", "error"];

export class TrinketCameraElement extends HTMLElement {
  static variant = "photo";
  static get observedAttributes() {
    return ["sound", "haptics", "no-screen-flash", "develop-duration", "eject-duration"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = ENGINE_CSS + (this.constructor.extraCSS || "");
    this.shadowRoot.append(style);
    this.engine = null;
    let resolve, reject;
    this._whenReady = new Promise((res, rej) => { resolve = res; reject = rej; });
    this._whenReady.catch(() => {});
    this._resolveReady = resolve;
    this._rejectReady = reject;
  }

  connectedCallback() {
    if (this._started) return;
    this._started = true;
    this._init().catch((error) => {
      this._rejectReady(error);
      this.dispatchEvent(new CustomEvent("error", { detail: { error }, bubbles: true, composed: true }));
      console.error("[trinket]", error);
    });
  }

  async _init() {
    const skin = await loadSkin(this.getAttribute("skin") || DEFAULT_SKIN_URL);
    const A = skin.stage;
    this.style.aspectRatio = `${A.w} / ${A.h}`;
    this.engine = new PhotoEngine(this.shadowRoot, skin, {
      variant: this.constructor.variant,
      ...this._options(),
      labels: this._labels(),
      onShutter: () => this._onShutter(),
    });
    for (const type of FORWARDED) {
      this.engine.addEventListener(type, (e) => {
        if (type === "statechange") this.setAttribute("state", e.detail.state);
        this.dispatchEvent(new CustomEvent(type, { detail: e.detail, bubbles: true, composed: true }));
      });
    }
    await this.engine.ready;
    this.setAttribute("state", "idle");
    this.onEngineReady?.();
    this._resolveReady(this);
  }

  attributeChangedCallback() {
    if (this.engine) Object.assign(this.engine.options, this._options());
    if (this.engine) Object.assign(this.engine.timing, this._options().timing);
  }

  _options() {
    const num = (n) => {
      const v = parseFloat(this.getAttribute(n));
      return Number.isFinite(v) ? v : undefined;
    };
    const timing = {};
    if (num("develop-duration") !== undefined) timing.develop = num("develop-duration");
    if (num("eject-duration") !== undefined) timing.eject = num("eject-duration");
    return {
      sound: this.hasAttribute("sound"),
      haptics: this.getAttribute("haptics") !== "off",
      screenFlash: !this.hasAttribute("no-screen-flash"),
      timing,
    };
  }

  _labels() {
    return { shutter: "Shutter", take: "Take photo", ...(this.labels || {}) };
  }

  // ---------------------------------------------------------------- public API

  /** Resolves when the skin is loaded and the camera is visible. */
  whenReady() { return this._whenReady; }

  /** Current engine state ("idle", "shutter", … "taken"). */
  get state() { return this.engine?.state ?? "loading"; }

  /** Print a PhotoRecipe / image URL / Blob. Resolves true when the photo is ready. */
  async print(recipe) {
    await this._whenReady;
    return this.engine.print(normalizeRecipe(recipe));
  }

  /** Take the ready photo (same as tapping it). */
  async take() {
    await this._whenReady;
    return this.engine.take();
  }

  /** Abort and return to idle. */
  reset() { this.engine?.reset(); }

  /** Blob of the ready photo card (paper + image + caption). */
  exportCard(type, scale) { return this.engine.exportCard(type, scale); }

  /** Press the shutter from code — behaves like a click on the camera's button. */
  pressShutter() { return this._onShutter(); }

  _onShutter() {}

  /** Print a captured/picked Blob with the element's caption/date attributes. */
  _printBlob(blob, metadata = {}) {
    const url = URL.createObjectURL(blob);
    (this._urls ??= []).push(url);
    while (this._urls.length > 3) URL.revokeObjectURL(this._urls.shift());
    const date = this.getAttribute("date");
    return this.print({
      image: url,
      caption: this.getAttribute("caption") || undefined,
      date: date === "auto" ? today() : date || undefined,
      metadata: { ...metadata, blob },
    });
  }

  _emitError(error) {
    this.dispatchEvent(new CustomEvent("error", { detail: { error }, bubbles: true, composed: true }));
  }

  disconnectedCallback() {
    // keep the engine alive across moves in the DOM; only abort motion
    this.engine?.reset();
  }
}

export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}
