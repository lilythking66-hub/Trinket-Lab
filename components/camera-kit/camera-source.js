// CameraSource — one live camera stream with permission states.
// Shared by <instant-camera> and the optional selfie lens of <instant-photo>.
// Knows nothing about the Photo Engine.

export const CAMERA_STATES = ["off", "starting", "live", "denied", "unavailable", "busy", "insecure", "error"];

export class CameraSource extends EventTarget {
  /** @param {{ facing?: "user"|"environment", mirror?: "auto"|"on"|"off" }} [opts] */
  constructor(opts = {}) {
    super();
    this.facing = opts.facing === "environment" ? "environment" : "user";
    this.mirrorMode = opts.mirror || "auto";
    this.state = "off";
    this.error = null;
    this.actualFacing = null;
    this._stream = null;
    this._token = 0;
    this._resume = false;

    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("muted", "");
    v.setAttribute("aria-hidden", "true");
    this.video = v;

    this._onVisibility = () => {
      if (this._destroyed) return;
      if (document.hidden) {
        if (this.state === "live") { this._resume = true; this.stop(); }
      } else if (this._resume) {
        this._resume = false;
        this.start();
      }
    };
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  get live() { return this.state === "live"; }

  /**
   * Mirror the picture like a mirror? Front cameras: yes. Back cameras: no.
   * Laptop webcams usually don't report a facing mode — they face the user, so mirror.
   */
  get mirror() {
    if (this.mirrorMode === "on") return true;
    if (this.mirrorMode === "off") return false;
    if (this.actualFacing === "environment") return false;
    if (this.actualFacing === "user") return true;
    return true;
  }

  async start() {
    if (this._destroyed) return this.state;
    const token = ++this._token;
    this._stopTracks();
    if (!window.isSecureContext) return this._set("insecure");
    if (!navigator.mediaDevices?.getUserMedia) return this._set("unavailable");
    this._set("starting");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: this.facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
      });
    } catch (err) {
      if (token !== this._token) return this.state;
      const n = err?.name || "";
      this.error = err;
      return this._set(
        n === "NotAllowedError" || n === "SecurityError" ? "denied"
        : n === "NotFoundError" || n === "OverconstrainedError" || n === "NotSupportedError" ? "unavailable"
        : n === "NotReadableError" || n === "AbortError" ? "busy"
        : "error"
      );
    }
    if (token !== this._token || this._destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      return this.state;
    }
    this._stream = stream;
    const track = stream.getVideoTracks()[0];
    this.actualFacing = track?.getSettings?.().facingMode || null;
    // another app / tab / element can take the camera away (Safari allows one capture
    // per device): treat that as "off" so the UI offers to turn it back on, not a black screen
    if (track) track.addEventListener("ended", () => this._onStreamEnded(stream), { once: true });
    this._countCameras();
    const v = this.video;
    v.srcObject = stream;
    try { await v.play(); } catch {}
    if (!v.videoWidth) {
      await new Promise((r) => {
        const done = () => { v.removeEventListener("loadedmetadata", done); r(); };
        v.addEventListener("loadedmetadata", done);
        setTimeout(done, 2500);
      });
    }
    if (token !== this._token) return this.state;
    if (!v.videoWidth) {
      // got a stream but no picture: release the camera (and its indicator light)
      // before reporting the failure
      this.error = new DOMException("The camera produced no video frames", "NotReadableError");
      this._stopTracks();
      return this._set("error");
    }
    this.error = null;
    return this._set("live");
  }

  /** Number of cameras on this device (known after permission is granted; null before). */
  get cameraCount() { return this._cameraCount ?? null; }

  /** True when there is more than one camera to switch between. */
  get canSwitch() { return (this._cameraCount ?? 0) > 1; }

  async _countCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const n = devices.filter((d) => d.kind === "videoinput").length;
      if (n !== this._cameraCount) {
        this._cameraCount = n;
        this.dispatchEvent(new CustomEvent("devicechange", { detail: { cameras: n } }));
      }
    } catch {}
  }

  stop() {
    this._token++;
    this._stopTracks();
    this._set("off");
  }

  /** Switch between front and back camera; restarts if live. */
  async switchFacing() {
    this.facing = this.facing === "user" ? "environment" : "user";
    return this.start();
  }

  /**
   * Current frame as a square JPEG. With `fisheye` > 0 the frame goes through the
   * same fisheye lens used for the live view.
   */
  async captureSquare({ size = 1200, quality = 0.92, fisheye = 0 } = {}) {
    const v = this.video;
    if (!this.live || !v.videoWidth) throw new Error("Camera is not live");
    const out = Math.min(size, Math.min(v.videoWidth, v.videoHeight));
    let canvas;
    if (fisheye > 0) {
      const { renderFisheyeCanvas } = await import("./fisheye.js");
      canvas = renderFisheyeCanvas(v, { size: out, strength: fisheye, mirror: this.mirror });
    }
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = canvas.height = out;
      const g = canvas.getContext("2d");
      const s = Math.min(v.videoWidth, v.videoHeight);
      if (this.mirror) { g.translate(out, 0); g.scale(-1, 1); }
      g.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, out, out);
    }
    return new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("capture failed"))), "image/jpeg", quality)
    );
  }

  /**
   * Release everything: the stream, the page listener and the <video>.
   * The instance can't be started again afterwards — create a new one.
   */
  destroy() {
    if (this._destroyed) return;
    this._resume = false;
    this.stop();
    this._destroyed = true;
    document.removeEventListener("visibilitychange", this._onVisibility);
    const v = this.video;
    v.pause();
    v.removeAttribute("src");
    v.srcObject = null;
    v.load();
    v.remove();
  }

  get destroyed() { return !!this._destroyed; }

  // The camera was taken away underneath us (another app/tab/element, unplugged,
  // permission revoked, OS interruption). Release the rest of the stream and go "off"
  // so the UI offers to turn it back on instead of showing a frozen/black picture.
  _onStreamEnded(stream) {
    if (this._stream !== stream) return; // an old stream we already replaced/stopped
    this._token++;          // cancel any start() in flight
    this._resume = false;   // don't auto-reopen a camera someone else now owns
    this.error = new DOMException("The camera stream ended unexpectedly", "AbortError");
    this._stopTracks();
    this._set("off");
  }

  _stopTracks() {
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    this.video.pause();
    this.video.srcObject = null;
    this.actualFacing = null;
  }

  _set(state) {
    const prev = this.state;
    this.state = state;
    if (prev !== state) {
      this.dispatchEvent(new CustomEvent("statechange", { detail: { state, prev, error: this.error } }));
    }
    return state;
  }
}
