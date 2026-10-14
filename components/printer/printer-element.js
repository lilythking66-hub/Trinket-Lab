import { createPrinter, getFrame } from "./printer-core.js";
import { PRINTER_CSS } from "./style.js";

export const DEFAULT_PRINTER_SKIN_URL = new URL(
  "../../skins/porcelain-printer-v1/web/manifest.json",
  import.meta.url
).href;

const pct = (value, total) => ((value / total) * 100) + "%";
const numberAttr = (element, name, fallback) => {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export class TrinketPrinter extends HTMLElement {
  static get observedAttributes() {
    return ["paper-width", "paper-height", "speed"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PRINTER_CSS;
    this.shadowRoot.append(style);
    this.labels = {};
    this._raf = 0;
    this._unsubscribe = null;
    this._controller = null;
    this._skin = null;
    this._lastState = "loading";
    let resolve, reject;
    this._ready = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this._ready.catch(() => {});
    this._resolveReady = resolve;
    this._rejectReady = reject;
  }

  connectedCallback() {
    if (this._started) {
      if (this.state === "feeding" || this.state === "settling") {
        this._stopLoop();
        this._raf = requestAnimationFrame(this._loop);
      }
      return;
    }
    this._started = true;
    this._init().catch((error) => {
      this._rejectReady(error);
      this.dispatchEvent(new CustomEvent("error", { detail: { error }, bubbles: true, composed: true }));
      console.error("[trinket-printer]", error);
    });
  }

  disconnectedCallback() {
    // Keep the controller/subscription alive across ordinary DOM moves.
    // Only stop the browser clock while detached; connectedCallback resumes it.
    this._stopLoop();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this._skin || !this._controller) return;
    if (this.state === "feeding" || this.state === "settling") {
      this._pendingConfigure = true;
      return;
    }
    this._pendingConfigure = false;
    this._configure();
  }

  async _init() {
    const skinUrl = new URL(this.getAttribute("skin") || DEFAULT_PRINTER_SKIN_URL, document.baseURI);
    const response = await fetch(skinUrl);
    if (!response.ok) throw new Error("Could not load printer skin: " + response.status);
    this._skinUrl = skinUrl;
    this._skin = await response.json();
    this._build();
    this._configure();
    const images = [...this.shadowRoot.querySelectorAll("img")];
    await Promise.all(images.map((image) => image.decode?.().catch(() => {}) ?? Promise.resolve()));
    this._resolveReady(this);
    this.dispatchEvent(new CustomEvent("ready", { bubbles: true, composed: true }));
  }

  _build() {
    const stage = document.createElement("div");
    stage.className = "tp-stage";

    const back = document.createElement("img");
    back.className = "tp-machine tp-back";
    back.alt = "";
    back.draggable = false;
    back.src = new URL(this._skin.assets.back, this._skinUrl).href;

    const viewport = document.createElement("div");
    viewport.className = "tp-paper-viewport";
    const paper = document.createElement("div");
    paper.className = "tp-paper";
    const slot = document.createElement("slot");
    slot.name = "paper";
    paper.append(slot);
    viewport.append(paper);

    const shadowCrop = document.createElement("div");
    shadowCrop.className = "tp-shadow-crop";
    const shadow = document.createElement("img");
    shadow.className = "tp-slot-shadow";
    shadow.alt = "";
    shadow.draggable = false;
    shadow.src = new URL(this._skin.assets.slotShadow, this._skinUrl).href;
    shadowCrop.append(shadow);

    const front = document.createElement("img");
    front.className = "tp-machine tp-front";
    front.alt = "";
    front.draggable = false;
    front.src = new URL(this._skin.assets.front, this._skinUrl).href;

    const button = document.createElement("button");
    button.className = "tp-button";
    button.type = "button";
    button.setAttribute("aria-label", this.labels.print || "Print");
    button.addEventListener("click", () => this.print());

    stage.append(back, viewport, shadowCrop, front, button);
    this.shadowRoot.append(stage);
    Object.assign(this, {
      _stage: stage, _back: back, _viewport: viewport, _paper: paper,
      _shadowCrop: shadowCrop, _shadow: shadow, _front: front, _button: button,
    });
  }

  _config() {
    const skin = this._skin;
    return {
      skin: {
        canvasWidth: skin.canvas.width,
        canvasHeight: skin.canvas.height,
        slotX: skin.slot.x,
        slotY: skin.slot.y,
        slotWidth: skin.slot.width,
        defaultPaperWidth: skin.paper.defaultWidth,
        gripDepth: skin.paper.gripDepth,
      },
      paper: {
        width: numberAttr(this, "paper-width", skin.paper.defaultWidth),
        height: numberAttr(this, "paper-height", skin.paper.defaultHeight),
      },
      motion: {
        speed: numberAttr(this, "speed", skin.motion.speed),
        startDelayMs: skin.motion.startDelayMs,
        startupRatio: skin.motion.startupRatio,
        settleStartRatio: skin.motion.settleStartRatio,
      },
    };
  }

  _configure() {
    const config = this._config();
    // Validate/build the replacement before touching the current controller.
    // Invalid paper geometry should fail without leaving a working printer half-detached.
    const controller = createPrinter(config);
    this._stopLoop();
    this._unsubscribe?.();
    this._configValue = config;
    this._layout(config);
    this._controller = controller;
    this._unsubscribe = this._controller.subscribe((frame, event) => {
      this._paint(frame);
      this._emit(frame, event);
    });
    const initial = this._controller.getState();
    this._paint(initial);
    this._setState(initial.state);
  }

  _layout(config) {
    const { skin, paper } = config;
    const margin = 76;
    const outputHeight = Math.max(skin.canvasHeight, skin.slotY + paper.height - skin.gripDepth + margin);
    const viewportHeight = outputHeight - skin.slotY;
    const layerHeight = (skin.canvasHeight / outputHeight) * 100;
    const paperLeft = skin.slotX - paper.width / 2;
    const shadowHeight = 14;

    this.style.aspectRatio = skin.canvasWidth + " / " + outputHeight;
    this._stage.style.aspectRatio = skin.canvasWidth + " / " + outputHeight;
    this._back.style.height = layerHeight + "%";
    this._front.style.height = layerHeight + "%";

    this._viewport.style.top = pct(skin.slotY, outputHeight);
    this._viewport.style.height = pct(viewportHeight, outputHeight);
    this._paper.style.left = pct(paperLeft, skin.canvasWidth);
    this._paper.style.width = pct(paper.width, skin.canvasWidth);
    this._paper.style.height = pct(paper.height, viewportHeight);

    this._shadowCrop.style.left = pct(paperLeft, skin.canvasWidth);
    this._shadowCrop.style.top = pct(skin.slotY, outputHeight);
    this._shadowCrop.style.width = pct(paper.width, skin.canvasWidth);
    this._shadowCrop.style.height = pct(shadowHeight, outputHeight);
    this._shadow.style.width = ((skin.canvasWidth / paper.width) * 100) + "%";
    this._shadow.style.height = ((skin.canvasHeight / shadowHeight) * 100) + "%";
    this._shadow.style.left = ((-paperLeft / paper.width) * 100) + "%";
    this._shadow.style.top = ((-skin.slotY / shadowHeight) * 100) + "%";

    const button = this._skin.button;
    this._button.style.left = pct(button.x - button.radius, skin.canvasWidth);
    this._button.style.top = pct(button.y - button.radius, outputHeight);
    this._button.style.width = pct(button.radius * 2, skin.canvasWidth);
    this._button.style.height = pct(button.radius * 2, outputHeight);
  }

  _paint(frame) {
    const paperHeight = this._configValue.paper.height;
    const offset = frame.y - this._configValue.skin.slotY;
    this._paper.style.transform = "translateY(" + ((offset / paperHeight) * 100) + "%)";
    this._paper.style.boxShadow = "0 15px 26px rgba(73, 61, 41, " + frame.paperShadowOpacity + ")";
    this._shadowCrop.style.opacity = String(frame.slotShadowOpacity);
    this._stage.dataset.progress = frame.progress.toFixed(6);
    this.setAttribute("progress", frame.progress.toFixed(4));
    this._setState(frame.state);
  }

  _setState(state) {
    if (this._lastState === state) return;
    const previous = this._lastState;
    this._lastState = state;
    this.setAttribute("state", state);
    if (previous !== "loading") {
      this.dispatchEvent(new CustomEvent("statechange", {
        detail: { state, previous },
        bubbles: true,
        composed: true,
      }));
    }
  }

  _emit(frame, event) {
    if (event === "frame") {
      this.dispatchEvent(new CustomEvent("frame", { detail: { frame }, bubbles: true, composed: true }));
      return;
    }
    this.dispatchEvent(new CustomEvent(event, {
      detail: { frame },
      bubbles: true,
      composed: true,
    }));
  }

  _stopLoop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _loop = (now) => {
    const frame = this._controller?.tick(now);
    if (frame && (frame.state === "feeding" || frame.state === "settling")) {
      this._raf = requestAnimationFrame(this._loop);
    }
  };

  whenReady() {
    return this._ready;
  }

  get state() {
    return this._controller?.getState().state ?? "loading";
  }

  get progress() {
    return this._controller?.getState().progress ?? 0;
  }

  async print() {
    await this._ready;
    if (this._pendingConfigure) {
      this._pendingConfigure = false;
      this._configure();
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const started = this._controller.start(performance.now(), reduced);
    if (started && this.state !== "finished") {
      this._stopLoop();
      this._raf = requestAnimationFrame(this._loop);
    }
    return started;
  }

  reset() {
    this._stopLoop();
    if (this._pendingConfigure) {
      this._pendingConfigure = false;
      this._configure();
      return;
    }
    this._controller?.reset();
  }

  cancel() {
    this._stopLoop();
    return this._controller?.cancel() ?? false;
  }

  seek(fraction) {
    if (!this._controller) return;
    this._stopLoop();
    this._controller.reset();
    const progress = Math.max(0, Math.min(1, Number(fraction) || 0));
    const config = this._configValue;
    const travel = config.paper.height - config.skin.gripDepth;
    const frame = {
      ...getFrame(0, config),
      state: "idle",
      progress,
      y: config.skin.slotY - config.paper.height + travel * progress,
      slotShadowOpacity: Math.min(1, (progress * travel) / 12),
      paperShadowOpacity: progress === 0 ? 0 : 0.08 + 0.07 * progress,
    };
    this._paint(frame);
  }

  setPaperSize(width, height) {
    this.setAttribute("paper-width", String(width));
    this.setAttribute("paper-height", String(height));
  }
}

if (!customElements.get("trinket-printer")) {
  customElements.define("trinket-printer", TrinketPrinter);
}
