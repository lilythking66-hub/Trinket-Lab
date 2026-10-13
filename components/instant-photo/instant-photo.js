// <instant-photo> — prepared-content instant camera with an optional selfie lens.
//
// Core job: prepared content → instant photo.
//    el.print({ image, caption, … }) from code / QR / a button, or the `recipe`
//    property / `src` attribute printed by the shutter. Needs no camera at all.
//
// Optional (`selfie` attribute): a selfie lens. Tap the lens or the shutter → the
//    front camera turns on and you see yourself inside the lens through a fisheye.
//    The camera code is only loaded when `selfie` is set.
//
//   <instant-photo src="lake.jpg" caption="Good day :)"></instant-photo>     // print only
//   <instant-photo selfie caption="Hi" date="auto"></instant-photo>          // + selfie lens

import { TrinketCameraElement } from "../photo-engine/camera-element.js";
import { el } from "../photo-engine/util.js";

// camera code is loaded on demand, only for elements that enable `selfie`
const loadCameraKit = () =>
  Promise.all([import("../camera-kit/camera-source.js"), import("../camera-kit/fisheye.js")]).then(
    ([a, b]) => ({ CameraSource: a.CameraSource, FisheyeView: b.FisheyeView })
  );

export class InstantPhoto extends TrinketCameraElement {
  static variant = "photo";
  static get observedAttributes() {
    return [...super.observedAttributes, "selfie", "fisheye"];
  }

  constructor() {
    super();
    /** @type {object|null} PhotoRecipe printed by the shutter when the selfie camera is off */
    this.recipe = null;
    this.cameraState = "off";
    this._raf = 0;
  }

  /** Selfie lens enabled? Off unless the `selfie` attribute is present (and not "off"). */
  get selfie() {
    return this.hasAttribute("selfie") && this.getAttribute("selfie") !== "off";
  }
  set selfie(v) { this.toggleAttribute("selfie", !!v); }

  /** Fisheye strength 0..1 (default 0.65). `fisheye="off"` or "0" = plain lens. */
  get fisheye() {
    const a = this.getAttribute("fisheye");
    if (a === null || a === "") return 0.65;
    if (a === "off") return 0;
    const v = parseFloat(a);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.65;
  }

  onEngineReady() {
    const eng = this.engine;
    if (!eng.lensSlot) return; // skin without a lens-glass slot: print-only
    const L = eng.skin.layout;
    const g = L.lensGlass;
    const hr = g.r * 1.55;
    const hit = el("button", "te-lens-hit", { type: "button", "aria-label": this.labels?.openSelfie || "Open selfie preview" });
    const A = eng.skin.stage;
    Object.assign(hit.style, {
      left: `${((g.x - hr) / A.w) * 100}%`, top: `${((g.y - hr) / A.h) * 100}%`,
      width: `${((hr * 2) / A.w) * 100}%`, height: `${((hr * 2) / A.h) * 100}%`,
    });
    hit.hidden = !this.selfie;
    hit.addEventListener("click", () => {
      if (this.cameraState === "live" || this.cameraState === "starting") this.stopCamera();
      else this.startCamera();
    });
    eng.shutterButton.before(hit);
    this._lensHit = hit;
  }

  attributeChangedCallback(name, old, val) {
    super.attributeChangedCallback?.(name, old, val);
    if (name === "selfie") {
      if (this._lensHit) this._lensHit.hidden = !this.selfie;
      if (!this.selfie) this._releaseCamera();
    }
  }

  // Removed from the page: release the camera, the <video>, the render loop and the
  // WebGL context. Everything is created again on demand if the element comes back.
  disconnectedCallback() {
    super.disconnectedCallback();
    this._releaseCamera();
  }

  // ---------------------------------------------------------------- selfie camera

  async _ensureCamera() {
    if (this._cam) return this._cam;
    this._camP ??= loadCameraKit().then((kit) => {
      this._kit = kit;
      const cam = new kit.CameraSource({ facing: "user", mirror: this.getAttribute("mirror") || "auto" });
      cam.addEventListener("statechange", (e) => this._onCameraState(e.detail));
      cam.addEventListener("devicechange", (e) => {
        this.dispatchEvent(new CustomEvent("cameradevices", { detail: { cameras: e.detail.cameras, canSwitch: cam.canSwitch }, bubbles: true, composed: true }));
      });
      // removed from the page (or selfie switched off) while the camera code was
      // loading: nobody will release this one later, so don't keep it
      if (!this.isConnected || !this.selfie) {
        cam.destroy();
        return null;
      }
      this._cam = cam;
      return cam;
    }).finally(() => { this._camP = null; });
    return this._camP;
  }

  /** Turn on the selfie camera; the live picture appears inside the lens. */
  async startCamera() {
    await this.whenReady();
    if (!this.selfie || !this.engine.lensSlot || !this.isConnected) return "off";
    const cam = await this._ensureCamera();
    if (!cam || !this.selfie || !this.isConnected) return "off"; // changed while loading
    return cam.start();
  }

  stopCamera() {
    this._cam?.stop();
  }

  /** Switch front/back camera (front is the default for this one). */
  async switchCamera() {
    await this.whenReady();
    if (!this.selfie) return "off";
    const cam = await this._ensureCamera();
    return cam ? cam.switchFacing() : "off";
  }

  /** Stop and free the camera, its <video>, the lens loop and the WebGL context. */
  _releaseCamera() {
    this._stopLensLoop();
    const cam = this._cam;
    this._cam = null;
    if (cam) cam.destroy(); // fires statechange → "off" while we still listen
    this._view?.dispose();
    this._view = null;
    this._lensCanvas?.remove();
    this._lensCanvas = null;
    if (this.cameraState !== "off") this._onCameraState({ state: "off", prev: this.cameraState });
  }

  _onCameraState({ state, prev, error }) {
    this.cameraState = state;
    this.setAttribute("camera-state", state);
    const st = this.engine?.stage;
    if (st) {
      st.classList.toggle("lens-live", state === "live");
      st.classList.toggle("lens-starting", state === "starting");
    }
    if (this._lensHit) this._lensHit.setAttribute("aria-label", state === "live" ? (this.labels?.closeSelfie || "Close selfie preview") : (this.labels?.openSelfie || "Open selfie preview"));
    if (state === "live") this._startLensLoop();
    else this._stopLensLoop();
    this.dispatchEvent(new CustomEvent("camerastate", { detail: { state, prev, error }, bubbles: true, composed: true }));
  }

  _startLensLoop() {
    const slot = this.engine.lensSlot;
    if (!this._cam) return;
    if (!this._lensCanvas) {
      this._lensCanvas = el("canvas");
      slot.append(this._lensCanvas);
      this._view = new this._kit.FisheyeView(this._lensCanvas);
      if (!this._view.ok) {
        // no WebGL: show the plain video, zoomed a little like a lens
        this._lensCanvas.remove();
        const v = this._cam.video;
        v.style.transform = "scale(1.35)";
        slot.append(v);
      }
    }
    const v = this._cam.video;
    if (!this._view?.ok) {
      v.style.transform = `scale(1.35)${this._cam.mirror ? " scaleX(-1)" : ""}`;
      return;
    }
    const frame = () => {
      if (this.cameraState !== "live" || !this._view) return;
      const c = this._lensCanvas;
      const px = Math.min(512, Math.round(slot.clientWidth * (window.devicePixelRatio || 1)));
      if (px && c.width !== px) { c.width = px; c.height = px; }
      this._view.draw(v, { strength: this.fisheye, mirror: this._cam.mirror, vignette: 0.6 });
      this._raf = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(frame) : requestAnimationFrame(frame);
    };
    this._stopLensLoop();
    frame();
  }

  _stopLensLoop() {
    const v = this._cam?.video;
    if (this._raf) {
      try { v?.cancelVideoFrameCallback?.(this._raf); } catch {}
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }

  // ---------------------------------------------------------------- shutter

  _currentRecipe() {
    if (this.recipe) return this.recipe;
    const src = this.getAttribute("src");
    if (!src) return null;
    return {
      image: src,
      caption: this.getAttribute("caption") || undefined,
      date: this.getAttribute("date") || undefined,
      stamp: this.getAttribute("stamp") || undefined,
    };
  }

  async _onShutter() {
    const eng = this.engine;
    if (!eng || (eng.busy && eng.state !== "ready")) return false;

    // selfie camera is on → take a picture through the lens
    if (this.cameraState === "live" && this._cam) {
      let blob;
      try {
        blob = await this._cam.captureSquare({ fisheye: this.fisheye });
      } catch (error) {
        this._emitError(error);
        return false;
      }
      return this._printBlob(blob, { source: "selfie", fisheye: this.fisheye });
    }

    const recipe = this._currentRecipe();
    const ev = new CustomEvent("shutterpress", { detail: { recipe }, bubbles: true, composed: true, cancelable: true });
    if (!this.dispatchEvent(ev)) return false;
    if (recipe) return this.print(recipe);
    if (this.selfie && eng.lensSlot) {
      this.startCamera();
      return false;
    }
    this._nudge();
    return false;
  }

  // nothing to print: a tiny press-and-release so the button still feels alive
  _nudge() {
    const st = this.engine.stage;
    st.classList.add("pressed");
    setTimeout(() => st.classList.remove("pressed"), 120);
  }
}

if (!customElements.get("instant-photo")) customElements.define("instant-photo", InstantPhoto);
