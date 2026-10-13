// <instant-camera> — viewfinder camera. The screen faces you, the lens faces the world.
//
//   <instant-camera caption="Hello" date="auto"></instant-camera>      ← back camera
//   <instant-camera facing="user"></instant-camera>                     ← start on the front camera
//
// Owns: camera permission, live preview, mirroring, shutter capture, and a usable
// fallback when the camera can't be used (pick a photo instead).
// Ejection / developing are NOT implemented here — the captured frame is handed
// to the shared Photo Engine through print().

import { TrinketCameraElement } from "../photo-engine/camera-element.js";
import { el } from "../photo-engine/util.js";
import { CameraSource } from "../camera-kit/camera-source.js";

const DEFAULT_MESSAGES = {
  off: { text: "Tap to open camera", actions: [] },
  starting: { text: "Opening camera…", actions: [] },
  live: null,
  denied: { text: "Camera permission denied", hint: "Allow camera access in your browser settings, or choose a photo instead.", actions: ["retry", "pick"] },
  unavailable: { text: "No camera available", actions: ["pick"] },
  busy: { text: "Camera is in use", actions: ["retry", "pick"] },
  insecure: { text: "Camera requires HTTPS", hint: "Camera access requires HTTPS or localhost.", actions: ["pick"] },
  error: { text: "Could not open camera", actions: ["retry", "pick"] },
};
const DEFAULT_ACTION_LABELS = { start: "Open camera", retry: "Retry", pick: "Choose photo" };

export class InstantCamera extends TrinketCameraElement {
  static variant = "camera";
  static get observedAttributes() {
    return [...super.observedAttributes, "facing"];
  }

  constructor() {
    super();
    this.cameraState = "off";
    this._urls = [];
  }

  /** Requested camera. The viewfinder shoots the world in front of you: back camera by default. */
  get facing() { return this.getAttribute("facing") === "user" ? "user" : "environment"; }
  set facing(v) { this.setAttribute("facing", v); }
  /** Whether the picture is mirrored (front cameras / laptop webcams: yes). */
  get mirror() { return this._cam ? this._cam.mirror : this.facing === "user"; }

  onEngineReady() {
    const eng = this.engine;
    this._freeze = el("img", "", { alt: "", draggable: "false" });
    this._freeze.hidden = true;
    eng.previewSlot.append(this._freeze);

    // tapping the dark screen turns the camera on
    const tap = el("button", "te-screen-tap", { type: "button", "aria-label": this.labels?.openCamera || "Open camera" });
    for (const k of ["left", "top", "width", "height"]) tap.style[k] = eng.screenUi.style[k];
    tap.addEventListener("click", () => {
      if (["off", "error", "busy"].includes(this.cameraState)) this.startCamera();
    });
    eng.screenUi.before(tap);
    this._tap = tap;

    this._file = el("input", "", { type: "file", accept: "image/*", hidden: true });
    this._file.addEventListener("change", () => {
      const f = this._file.files?.[0];
      this._file.value = "";
      if (f) this._printBlob(f, { source: "file" });
    });
    this.shadowRoot.append(this._file);

    this._setCameraState("off");
    if (this.hasAttribute("autostart")) this.startCamera();
  }

  /** The camera is created on first use and released when the element leaves the page. */
  _ensureCamera() {
    if (this._cam) return this._cam;
    const eng = this.engine;
    const cam = new CameraSource({ facing: this.facing, mirror: this.getAttribute("mirror") || "auto" });
    cam.addEventListener("devicechange", (e) => {
      this.dispatchEvent(new CustomEvent("cameradevices", { detail: { cameras: e.detail.cameras, canSwitch: cam.canSwitch }, bubbles: true, composed: true }));
    });
    cam.addEventListener("statechange", (e) => {
      if (e.detail.state === "live") eng.previewSlot.classList.toggle("mirror", cam.mirror);
      this._setCameraState(e.detail.state, e.detail.error);
    });
    eng.previewSlot.prepend(cam.video);
    this._cam = cam;
    this._video = cam.video;
    return cam;
  }

  /** Stop and free the stream, the page listener and the <video>. */
  _releaseCamera() {
    const cam = this._cam;
    this._cam = null;
    this._video = null;
    if (cam) cam.destroy(); // fires statechange → "off"
    clearTimeout(this._freezeT);
    if (this._freeze) {
      if (this._freeze.src.startsWith("blob:")) URL.revokeObjectURL(this._freeze.src);
      this._freeze.hidden = true;
      this._freeze.removeAttribute("src");
    }
    if (this.cameraState !== "off" && this.engine) this._setCameraState("off");
  }

  attributeChangedCallback(name, old, val) {
    super.attributeChangedCallback?.(name, old, val);
    if (name === "facing" && old !== val && this._cam) {
      this._cam.facing = this.facing;
      if (this.cameraState === "live" || this.cameraState === "starting") this._cam.start();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._releaseCamera();
  }

  // ---------------------------------------------------------------- camera

  /** Ask for the camera and show the live preview. Resolves to the new camera state. */
  async startCamera() {
    await this.whenReady();
    if (!this.isConnected) return "off";
    const cam = this._ensureCamera();
    cam.facing = this.facing;
    return cam.start();
  }

  /** Turn the camera off (screen goes dark). */
  stopCamera() {
    this._cam?.stop();
  }

  /** Toggle back / front camera. */
  async switchCamera() {
    await this.whenReady();
    // setting the attribute restarts a live camera (attributeChangedCallback)
    const wasLive = this.cameraState === "live" || this.cameraState === "starting";
    this.facing = this.facing === "user" ? "environment" : "user";
    if (!wasLive) return this.startCamera();
    return this.cameraState;
  }

  /** More than one camera on this device? (null until the camera has been opened once) */
  get canSwitch() { return this._cam ? (this._cam.cameraCount === null ? null : this._cam.canSwitch) : null; }

  /** Grab the current frame as a square JPEG Blob (what the film window shows). */
  captureFrame() {
    if (!this._cam) return Promise.reject(new Error("Camera is not live"));
    return this._cam.captureSquare();
  }

  /** Open the photo picker (fallback when the camera can't be used). */
  pickPhoto() { this._file?.click(); }

  // ---------------------------------------------------------------- shutter

  async _onShutter() {
    if (!this.engine) return false;
    if (this.engine.busy && this.engine.state !== "ready") return false;
    if (this.cameraState !== "live") {
      if (["off", "error", "busy"].includes(this.cameraState)) this.startCamera();
      return false;
    }
    let blob;
    try { blob = await this.captureFrame(); } catch (error) {
      this._emitError(error);
      return false;
    }
    this._showFreeze(blob);
    return this._printBlob(blob, { source: "camera" });
  }

  _showFreeze(blob) {
    const f = this._freeze;
    const url = URL.createObjectURL(blob);
    f.src = url;
    f.hidden = false;
    clearTimeout(this._freezeT);
    this._freezeT = setTimeout(() => { f.hidden = true; URL.revokeObjectURL(url); }, 650);
  }

  // ---------------------------------------------------------------- ui

  _setCameraState(state, error) {
    const prev = this.cameraState;
    this.cameraState = state;
    this.setAttribute("camera-state", state);
    const eng = this.engine;
    if (eng) {
      eng.stage.classList.toggle("live", state === "live");
      if (this._tap) this._tap.hidden = !["off", "error", "busy"].includes(state);
      const ui = eng.screenUi;
      ui.replaceChildren();
      const base = DEFAULT_MESSAGES[state];
      const m = base ? { ...base, ...(this.messages?.[state] || {}) } : null;
      if (m) {
        ui.append(el("div", "te-msg", { text: m.text, title: m.hint || null }));
        if (m.hint) ui.setAttribute("aria-description", m.hint);
        else ui.removeAttribute("aria-description");
        if (m.actions.length) {
          const row = el("div", "te-row");
          m.actions.forEach((a, i) => {
            const b = el("button", i === 0 ? "" : "te-ghost", { type: "button", text: this.messages?.actions?.[a] || DEFAULT_ACTION_LABELS[a] });
            b.addEventListener("click", (e) => {
              e.stopPropagation();
              if (a === "pick") this.pickPhoto();
              else this.startCamera();
            });
            row.append(b);
          });
          ui.append(row);
        }
      }
    }
    if (prev !== state) {
      this.dispatchEvent(new CustomEvent("camerastate", { detail: { state, prev, error }, bubbles: true, composed: true }));
    }
    return state;
  }
}

if (!customElements.get("instant-camera")) customElements.define("instant-camera", InstantCamera);
