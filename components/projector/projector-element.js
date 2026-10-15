import { createProjectorCore, wrap } from "./projector-core.js";
import { createFilmPath } from "./film-path.js";
import {
  CAMERA, CINEMA_CAMERA, MODEL, LENS_EXIT, createCamera, cylinderSvg, BRASS_SIDE, DARK_SIDE,
  lensSvg, knurlSvg, reelFrontSvg, reelPackSvg, reelEdgeSvg, hubCapSvg, canLidSvg, TIN_SIDE, woodGrainUrl, esc,
} from "./projector-art.js";
import {
  createFrame, createFrames, createClip, sortFiles, releaseFrame, releaseClip,
  isImageFile, isVideoFile, canPlayH264, loadImage, IMAGE_ACCEPT, VIDEO_ACCEPT,
} from "./reel-maker.js";
import { createProjectorSound } from "./sound.js";
import { PROJECTOR_CSS } from "./style.js";

export {
  createFrame, createFrames, createClip, sortFiles, releaseFrame, releaseClip,
  isImageFile, isVideoFile, canPlayH264, loadImage, IMAGE_ACCEPT, VIDEO_ACCEPT,
  createProjectorCore, createFilmPath,
};

const DEFAULT_LABELS = {
  power: "Power",
  play: "Play / pause",
  prev: "Previous",
  next: "Next",
  focus: "Focus ring — drag, scroll or use the arrow keys",
  reel: "Load photos",
  film: "Film strip — drag to browse",
  screen: "Projection screen",
  drop: "Drop photos or an MP4 video here",
  photo: "Photo {i} of {n}",
  can: "Film can — drag it into the projector, or press to load it",
  lid: "Film bay hatch",
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
const r2 = (n) => Math.round(n * 100) / 100;
const reducedMotion = () => !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export class TrinketProjector extends HTMLElement {
  static get observedAttributes() {
    return ["mode", "label", "model", "speed", "interval", "volume", "muted", "sfx", "grain"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PROJECTOR_CSS;
    this.shadowRoot.append(style);

    this._labels = { ...DEFAULT_LABELS };
    this._frames = [];
    this._clip = null;
    this._core = createProjectorCore({ mode: this.getAttribute("mode") === "cinema" ? "cinema" : "filmstrip" });
    this._sound = createProjectorSound();
    this._raf = 0;
    this._last = 0;
    this._W = 0;
    this._H = 0;
    this._modeT = this._core.snapshot().mode === "cinema" ? 1 : 0;
    this._disp = 0;
    this._pack = 0;
    this._focusTurn = 0;
    this._shot = 0;
    this._shown = null;
    this._screenRect = null;
    this._flicker = 1;
    this._weave = { x: 0, y: 0, vx: 0, vy: 0 };
    this._grainAt = 0;
    this._dust = [];
    this._bitmaps = new Map();
    this._lidState = { open: false, angle: 0, anim: null };
    this._rollTable = null;
    this._rollInside = null;
    this._dragDepth = 0;
    this._lastIdx = -1;

    let resolve;
    this._ready = new Promise((res) => { resolve = res; });
    this._resolveReady = resolve;
    this._core.subscribe((type, detail) => this._onCore(type, detail));
  }

  /* ------------------------------------------------------------ lifecycle */

  connectedCallback() {
    clearTimeout(this._teardown);
    if (!this._built) {
      this._built = true;
      this._build();
      this._applyAttributes();
      this.setAttribute("state", this._core.state);
      this._resolveReady(this);
      queueMicrotask(() => this._emit("ready"));
    }
    this._resize = new ResizeObserver(() => this._measure());
    this._resize.observe(this._stage);
    this._measure();
    this._bindDrop(true);
    this._wake();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._resize?.disconnect();
    this._bindDrop(false);
    this._video?.pause();
    this._sound.motor(0);
    this._sound.fan(false);
    // no more frames: finish anything a caller may be awaiting (insertRoll, openLid…)
    this._settleLid(true);
    for (const el of [this._canTable, this._canInside, this._flying]) {
      for (const a of el?.getAnimations?.() || []) { try { a.finish(); } catch { a.cancel(); } }
    }
    clearTimeout(this._slideTimer);
    this._slidePending = false;
    // moved elsewhere in the page reconnects in the same task; if it doesn't,
    // it is gone for good: close the AudioContext (a new one is made on reconnect)
    clearTimeout(this._teardown);
    this._teardown = setTimeout(() => { if (!this.isConnected) this._sound.destroy(); }, 0);
  }

  attributeChangedCallback(name, oldValue, value) {
    if (!this._built || oldValue === value) return;
    if (name === "mode") this._core.setMode(value === "cinema" ? "cinema" : "filmstrip");
    else if (name === "label" || name === "model") this._applyPlate();
    this._applyAttributes();
    this._wake();
  }

  _applyAttributes() {
    this._core.setSpeed(this.hasAttribute("speed") ? Number(this.getAttribute("speed")) : 1);
    this._core.setInterval(this.hasAttribute("interval") ? Number(this.getAttribute("interval")) : 4);
    const vol = this.hasAttribute("volume") ? clamp(Number(this.getAttribute("volume")), 0, 1) : 0.8;
    this._sound.volume = vol;
    this._sound.muted = this.hasAttribute("muted");
    this._sound.enabled = this.getAttribute("sfx") !== "off";
    if (this._video) {
      this._video.volume = vol;
      this._video.muted = this.hasAttribute("muted");
    }
    this._grain = this.hasAttribute("grain") ? clamp(Number(this.getAttribute("grain")) || 0, 0, 1) : 0.5;
  }

  /* ----------------------------------------------------------- public API */

  whenReady() { return this._ready; }

  get state() { return this._core.state; }
  get mode() { return this._core.snapshot().mode; }
  set mode(m) { this.setAttribute("mode", m === "cinema" ? "cinema" : "filmstrip"); }
  get source() { return this._core.snapshot().source; }
  set source(v) { this._core.setSource(v); this._wake(); }
  get power() { return this._core.snapshot().power; }
  set power(on) { this._core.setPower(on); this._wake(); }
  get playing() { return this._core.running; }
  get index() { return this._core.index; }
  get frames() { return [...this._frames]; }
  get frame() { return this._frames[this._core.index] || null; }
  get clip() { return this._clip; }
  get videoElement() { return this._video; }
  get focus() { return this._core.focus; }
  set focus(v) { this._core.setFocus(v); this._renderFocus(); this._wake(); }
  get speed() { return this._core.snapshot().speed; }
  set speed(v) { this.setAttribute("speed", String(v)); }
  get interval() { return this._core.snapshot().interval; }
  set interval(v) { this.setAttribute("interval", String(v)); }

  get labels() { return { ...this._labels }; }
  set labels(value) {
    this._labels = { ...DEFAULT_LABELS, ...(value || {}) };
    if (this._built) this._applyLabels();
  }

  /**
   * Make a reel from photos: Files, URLs, { src, … } objects or frames from
   * createFrames(). Replaces the current reel unless { append: true }.
   */
  async loadPhotos(list, { append = false, autoplay = this.hasAttribute("autoplay"), fromRoll = false } = {}) {
    await this._ready;
    const input = [...(list || [])];
    const frames = [];
    for (const item of input) {
      if (item && item.id && item.src && item.thumb && item.aspect) { frames.push(item); continue; }
      if (item instanceof Blob && !isImageFile(item)) continue;
      try { frames.push(await createFrame(item)); } catch (error) { this._emit("error", { error, reason: "image" }); }
    }
    if (!frames.length) {
      if (input.length) this._emit("blocked", { reason: "not-image" });
      return [];
    }
    const wasEmpty = !this._frames.length;
    const keepIndex = this._core.index;
    if (!append) for (const fr of this._frames) if (!frames.includes(fr)) releaseFrame(fr);
    this._frames = append ? this._frames.concat(frames) : frames;
    this._core.setCount(this._frames.length, { keep: append });
    if (append) this._core.goTo(keepIndex, { instant: true });
    this._resetFilmFrames();
    this._shown = null;
    if (wasEmpty || !append) { this._mountReels(); this._unrollFilm(); }
    if (!fromRoll) this._syncInsideCan();
    this._emit("load", { frames: [...this._frames] });
    this._announce();
    if (autoplay) this.play();
    this._wake();
    return frames;
  }

  /** Remove all photos. */
  clearPhotos() {
    for (const fr of this._frames) releaseFrame(fr);
    this._frames = [];
    this._core.setCount(0);
    this._resetFilmFrames();
    this._shown = null;
    this._emit("load", { frames: [] });
    this._wake();
  }

  /** Load a local video (File, URL or { src, title }). Plays in Cinema only. */
  async loadVideo(input, { show = false, autoplay = false, fromRoll = false } = {}) {
    await this._ready;
    if (!input) return this.clearVideo();
    if (input instanceof Blob && !isVideoFile(input)) { this._emit("blocked", { reason: "not-video" }); return null; }
    const clip = input.src && input.id ? input : createClip(input);
    if (this._clip && this._clip !== clip) releaseClip(this._clip);
    this._clip = clip;
    this._videoReady = false;
    const v = this._video;
    v.pause();
    v.src = clip.src;
    v.load();
    this._core.setVideo(true);
    this._core.setSource("video");
    this._mountReels();
    if (!fromRoll) this._syncInsideCan();
    this._emit("video", { clip });
    if (show) this.mode = "cinema";
    if (autoplay) this.play();
    this._wake();
    return clip;
  }

  clearVideo() {
    if (this._clip) releaseClip(this._clip);
    this._clip = null;
    this._video.pause();
    this._video.removeAttribute("src");
    this._video.load();
    this._core.setVideo(false);
    this._wake();
  }

  /** Read files into frames + clip without loading them (fires "import"). */
  async importFiles(files) {
    const result = await sortFiles(files);
    if (result.frames.length || result.clip) this._emit("import", result);
    return result;
  }

  /** Open the file picker. kind: "photos" | "video". */
  openPicker(kind = "photos") {
    const input = kind === "video" ? this._videoInput : this._photoInput;
    input.value = "";
    input.click();
  }

  /* ---------------------------------------------------------- film cans */

  get lidOpen() { return this._lidState.open; }
  get roll() { return this._rollTable; }
  get loadedRoll() { return this._rollInside; }

  /**
   * Put a film can on the table: { frames, clip } where frames may be Files,
   * URLs or frames from createFrames(). The viewer drags it into the projector
   * (or clicks it); insertRoll() does the same from code.
   */
  async addRoll({ frames = [], clip = null, label } = {}) {
    await this._ready;
    const list = [];
    for (const item of frames || []) {
      if (item && item.id && item.src && item.thumb && item.aspect) { list.push(item); continue; }
      if (item instanceof Blob && !isImageFile(item)) continue;
      try { list.push(await createFrame(item)); } catch (error) { this._emit("error", { error, reason: "image" }); }
    }
    const c = clip ? (clip.src && clip.id ? clip : createClip(clip)) : null;
    if (!list.length && !c) { this._emit("blocked", { reason: "not-media" }); return null; }
    if (this._rollTable) this._dropTableCan(true);
    const roll = { id: "roll-" + Date.now().toString(36), frames: list, clip: c, label: label || rollLabel(list, c) };
    this._rollTable = roll;
    this._buildCan(roll, "table", { arrive: true });
    this._emit("roll", { roll });
    this._wake();
    return roll;
  }

  /** Open the hatch, drop the waiting can into the bay, close it and load the film. */
  async insertRoll(roll = this._rollTable) {
    await this._ready;
    if (!roll) { this._emit("blocked", { reason: "no-roll" }); return false; }
    if (this._inserting) return false;
    this._inserting = true;
    this._sound.unlock();
    try {
      if (this._core.running) this._core.pause();
      if (!this._lidState.open) await this.openLid();
      if (this._rollInside) await this._ejectInsideCan();
      if (roll !== this._rollTable) { this._dropTableCan(); this._rollTable = roll; this._buildCan(roll, "table"); }
      await this._flyCanToBay(roll);
      this._rollInside = roll;
      this._rollTable = null;
      await wait(140);
      await this.closeLid();
      await this._applyRoll(roll);
      this._emit("insert", { roll });
      if (this.hasAttribute("autoplay")) this.play();
    } finally {
      this._inserting = false;
    }
    return true;
  }

  openLid() { return this._moveLid(true); }
  closeLid() { return this._moveLid(false); }

  async _applyRoll(roll) {
    if (roll.frames.length) await this.loadPhotos(roll.frames, { fromRoll: true, autoplay: false });
    else this.clearPhotos();
    if (roll.clip) await this.loadVideo(roll.clip, { fromRoll: true });
    else if (this._clip) this.clearVideo();
    if (!roll.frames.length && roll.clip) this._core.setSource("video");
  }

  /** Files from the picker / a drop become a can on the table (or go straight in with insert="auto"). */
  async _offer(result) {
    const roll = await this.addRoll(result);
    if (roll && this.getAttribute("insert") === "auto") this.insertRoll(roll);
  }

  /** A can for content loaded directly with loadPhotos()/loadVideo(): it just sits in the bay. */
  _syncInsideCan() {
    const roll = { id: "roll-direct", frames: this._frames, clip: this._clip, label: rollLabel(this._frames, this._clip) };
    this._rollInside = roll;
    this._buildCan(roll, "bay");
  }

  _moveLid(open) {
    const L = this._lidState;
    // already heading there: share the motion in progress
    if (L.open === open) return L.anim ? L.anim.done : Promise.resolve();
    // reversing mid-swing: whoever waited for the old motion is released now
    this._settleLid(false);
    L.open = open;
    this.toggleAttribute("data-lid-open", open);
    if (open) this._sound.lidOpen();
    this._emit("lid", { open });
    const to = open ? MODEL.hatch.open : 0;
    // not on the page: no frames will come, so just put it there
    if (!this.isConnected || reducedMotion()) {
      L.angle = to;
      this._placeLid();
      return Promise.resolve();
    }
    let resolve;
    const done = new Promise((r) => { resolve = r; });
    L.anim = { from: L.angle, to, t0: performance.now(), dur: open ? 520 : 340, resolve, done, open };
    this._wake();
    return done;
  }

  /** End the hatch motion now (jump to its target when asked) and release its waiters. */
  _settleLid(jump = true) {
    const L = this._lidState, A = L.anim;
    if (!A) return;
    L.anim = null;
    if (jump) { L.angle = A.to; this._placeLid(); }
    A.resolve();
  }

  _stepLid(now) {
    const L = this._lidState, A = L.anim;
    if (!A) return false;
    const t = clamp((now - A.t0) / A.dur, 0, 1);
    // opening: eases out with a little overshoot; closing: falls, then a tiny bounce
    const e = A.open ? 1 - Math.pow(1 - t, 3) * (1 - 1.6 * t * (1 - t)) : t < 0.82 ? Math.pow(t / 0.82, 2) : 1 - Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.035;
    L.angle = lerp(A.from, A.to, e);
    this._placeLid();
    if (t >= 1) {
      L.angle = A.to;
      L.anim = null;
      this._placeLid();
      if (!A.open) this._sound.lidClose();
      A.resolve();
    }
    return true;
  }

  _placeLid() {
    if (!this._lidTop || !this._P) return;
    const H = MODEL.hatch, P = this._P;
    const a = (this._lidState.angle * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    const hz = H.z + H.thick;
    const rot = ([x, y, z]) => { const dy = y - H.y0, dz = z - hz; return [x, H.y0 + dy * c - dz * sn, hz + dy * sn + dz * c]; };
    const rv = ([x, y, z]) => [x, y * c - z * sn, y * sn + z * c];
    this._lidTop.style.transform = P.plane(rot([H.x0, H.y0, hz]), [1, 0, 0], rv([0, 1, 0]));
    this._lidFront.style.transform = P.plane(rot([H.x0, H.y1, hz]), [1, 0, 0], rv([0, 0, -1]));
    this._lidTop.classList.toggle("inner", !P.facing(rv([0, 0, 1])));
  }

  /** Scene px of a model point (for positioning cans). */
  _scenePt(p) { const q = this._P.proj(p.x, p.y, p.z), o = this._P.proj(0, 0, 0); return { x: q.x - o.x, y: q.y - o.y }; }

  _canMarkup(roll) {
    const C = MODEL.can, P = this._P;
    const side = cylinderSvg(P, { cx: 0, cy: 0, r: C.r, z0: 0, z1: C.h, side: TIN_SIDE });
    const lid = `<div class="pj-plane pj-can-lid" style="width:${C.r * 2}px;height:${C.r * 2}px;transform:${P.plane([-C.r, -C.r, C.h], [1, 0, 0], [0, 1, 0])}">${canLidSvg(C.r, roll.label)}</div>`;
    const shadow = `<div class="pj-plane pj-can-shadow" style="width:${C.r * 2 + 10}px;height:${C.r * 2 + 10}px;transform:${P.plane([-C.r - 3, -C.r - 1, 0], [1, 0, 0], [0, 1, 0])}"></div>`;
    return shadow + side + lid;
  }

  _buildCan(roll, where, { arrive = false } = {}) {
    if (!this._slots) return;
    const prev = where === "table" ? this._canTable : this._canInside;
    prev?.remove();
    const el = document.createElement("div");
    el.className = "pj-can";
    el.dataset.where = where;
    el.innerHTML = this._canMarkup(roll);
    const pos = where === "table" ? MODEL.table : MODEL.bayCan;
    const p = this._scenePt(pos);
    el._pos = p;
    el.style.transform = `translate(${r2(p.x)}px, ${r2(p.y)}px)`;
    this._slots[where].append(el);
    if (where === "table") {
      this._canTable = el;
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.setAttribute("aria-label", this._labels.can);
      this._bindCan(el);
      if (arrive && !reducedMotion()) {
        el.animate([{ transform: `translate(${r2(p.x + 180)}px, ${r2(p.y + 20)}px) rotate(20deg)`, opacity: 0 }, { opacity: 1, offset: 0.4 }, { transform: el.style.transform + " rotate(0deg)", opacity: 1 }],
          { duration: 620, easing: "cubic-bezier(.2,.8,.3,1.05)" });
        setTimeout(() => this._sound.canSlide(), 60);
      }
    } else this._canInside = el;
  }

  /**
   * A roll owns the frames/clip it was given. When it is thrown away without
   * being loaded, free its object URLs — except anything that is on the
   * projector right now.
   */
  _releaseRoll(roll) {
    if (!roll || roll === this._rollInside) return;
    const live = new Set(this._frames);
    for (const fr of roll.frames || []) if (!live.has(fr)) releaseFrame(fr);
    if (roll.clip && roll.clip !== this._clip) releaseClip(roll.clip);
  }

  /** Rebuild both cans for the current camera (after a camera swap). */
  _placeCans() {
    this._canTable = this._canInside = null;
    if (this._rollTable) this._buildCan(this._rollTable, "table");
    if (this._rollInside) this._buildCan(this._rollInside, "bay");
  }

  _dropTableCan(animate = false) {
    const el = this._canTable;
    this._canTable = null;
    this._releaseRoll(this._rollTable);
    this._rollTable = null;
    if (!el) return;
    if (!animate || reducedMotion()) { el.remove(); return; }
    el.animate([{ opacity: 1 }, { opacity: 0, transform: el.style.transform + " translateY(16px)" }], { duration: 260, fill: "forwards" }).finished.then(() => el.remove(), () => el.remove());
  }

  async _ejectInsideCan() {
    const el = this._canInside;
    this._canInside = null;
    this._rollInside = null;
    if (!el) return;
    if (reducedMotion()) { el.remove(); return; }
    const p = el._pos;
    this._sound.mount();
    await el.animate([{ transform: `translate(${r2(p.x)}px, ${r2(p.y)}px)`, opacity: 1 }, { transform: `translate(${r2(p.x + 40)}px, ${r2(p.y - 140)}px) rotate(-14deg)`, opacity: 0 }],
      { duration: 420, easing: "cubic-bezier(.3,.6,.4,1)", fill: "forwards" }).finished.catch(() => {});
    el.remove();
  }

  async _flyCanToBay(roll) {
    let el = this._canTable;
    if (!el) { this._buildCan(roll, "table"); el = this._canTable; }
    const from = el._pos;
    const to = this._scenePt(MODEL.bayCan);
    // lift it above everything for the flight, then settle it in the bay
    this._slots.table.append(el);
    el.classList.add("flying");
    this._flying = el;
    const reduced = reducedMotion();
    const apexY = Math.min(from.y, to.y) - 90;
    const anim = el.animate([
      { transform: `translate(${r2(from.x)}px, ${r2(from.y)}px)` },
      { transform: `translate(${r2(lerp(from.x, to.x, 0.55))}px, ${r2(apexY)}px) rotate(-6deg)`, offset: 0.55, easing: "ease-in" },
      { transform: `translate(${r2(to.x)}px, ${r2(to.y - 26)}px)`, offset: 0.85 },
      { transform: `translate(${r2(to.x)}px, ${r2(to.y)}px)` },
    ], { duration: reduced ? 1 : 760, easing: "cubic-bezier(.3,0,.3,1)", fill: "forwards" });
    await anim.finished.catch(() => {});
    this._flying = null;
    this._sound.canDrop();
    el.remove();
    this._canTable = null;
    this._buildCan(roll, "bay");
  }

  _bindCan(el) {
    let g = null;
    const lay = () => this._layoutNow || { sc: 1, rot: 0 };
    el.addEventListener("pointerdown", (e) => {
      if (e.button > 0 || this._inserting) return;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, base: { ...el._pos } };
    });
    el.addEventListener("pointermove", (e) => {
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 5) return;
      g.moved = true;
      el.classList.add("held");
      // client delta → scene delta (undo the machine's scale and tilt)
      const L = lay(), c = Math.cos(-(L.rot || 0)), sn = Math.sin(-(L.rot || 0));
      const sx = (dx * c - dy * sn) / L.sc, sy = (dx * sn + dy * c) / L.sc;
      el._pos = { x: g.base.x + sx, y: g.base.y + sy };
      el.style.transform = `translate(${r2(el._pos.x)}px, ${r2(el._pos.y)}px) scale(1.06)`;
      this.toggleAttribute("data-can-over", this._overBay(e));
    });
    const end = (e, cancelled) => {
      if (!g || g.id !== e.pointerId) return;
      const d = g;
      g = null;
      el.classList.remove("held");
      const over = this._overBay(e);
      this.removeAttribute("data-can-over");
      if (!d.moved) { if (!cancelled) this.insertRoll(); return; }
      if (over && !cancelled) { this.insertRoll(); return; }
      // not over the machine: slide back to its place on the table
      const home = this._scenePt(MODEL.table);
      el.animate([{ transform: el.style.transform }, { transform: `translate(${r2(home.x)}px, ${r2(home.y)}px)` }], { duration: 320, easing: "cubic-bezier(.3,1.3,.5,1)" });
      el._pos = home;
      el.style.transform = `translate(${r2(home.x)}px, ${r2(home.y)}px)`;
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.insertRoll(); } });
  }

  _overBay(e) {
    const top = this._machine.querySelector(".pj-top");
    if (!top) return false;
    const r = top.getBoundingClientRect(), pad = 36;
    return e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad * 2 && e.clientY < r.bottom + pad;
  }

  play() { this._sound.unlock(); const ok = this._core.play(); this._wake(); return ok; }
  pause() { const ok = this._core.pause(); this._wake(); return ok; }
  toggle() { return this._core.running ? this.pause() : this.play(); }
  next() { return this._step(1); }
  prev() { return this._step(-1); }
  goTo(i, opts) { const ok = this._core.goTo(i, opts); this._wake(); return ok; }

  _step(dir) {
    this._sound.unlock();
    const s = this._core.snapshot();
    if (s.mode === "cinema" && s.source === "video") {
      if (!this._clip) return false;
      const v = this._video;
      if (Number.isFinite(v.duration)) v.currentTime = clamp(v.currentTime + dir * 10, 0, Math.max(0, v.duration - 0.1));
      this._emit("seek", { currentTime: v.currentTime });
      return true;
    }
    const ok = this._core.step(dir);
    this._wake();
    return ok;
  }

  /* ---------------------------------------------------------------- build */

  _build() {
    const stage = document.createElement("div");
    stage.className = "pj-stage";
    stage.setAttribute("part", "stage");
    stage.innerHTML = `
<div class="pj-room" part="room"></div>
<div class="pj-spill"></div>
<div class="pj-screen" part="screen" role="img">
  <div class="pj-jolt"><div class="pj-weave">
    <div class="pj-shot"><img alt="" decoding="async"></div>
    <div class="pj-shot"><img alt="" decoding="async"></div>
    <video class="pj-video" playsinline preload="metadata"></video>
    <div class="pj-blank"></div>
  </div></div>
  <canvas class="pj-grain" width="192" height="120" aria-hidden="true"></canvas>
  <div class="pj-vignette"></div>
  <div class="pj-dark"></div>
  <div class="pj-shutter"></div>
</div>
<svg class="pj-beam" aria-hidden="true">
  <defs>
    <linearGradient id="pjBeam" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--_light-hi)" stop-opacity=".7"/><stop offset=".25" style="stop-color:var(--_light)" stop-opacity=".34"/><stop offset="1" style="stop-color:var(--_light)" stop-opacity=".1"/></linearGradient>
    <linearGradient id="pjBeamCore" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".3" style="stop-color:var(--_light-hi)" stop-opacity=".12"/><stop offset="1" style="stop-color:var(--_light)" stop-opacity="0"/></linearGradient>
  </defs>
  <path class="pj-beam-soft" fill="url(#pjBeam)"/>
  <path class="pj-beam-core" fill="url(#pjBeamCore)"/>
</svg>
<canvas class="pj-dust" aria-hidden="true"></canvas>
<div class="pj-film" part="film" tabindex="0" role="group">
  <svg class="pj-film-svg" aria-hidden="true">
    <defs>
      <linearGradient id="pjFilmFade" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient>
      <mask id="pjFilmMask" maskUnits="userSpaceOnUse"><rect class="pj-mask-rect" fill="url(#pjFilmFade)"/></mask>
    </defs>
    <g mask="url(#pjFilmMask)">
      <path class="pj-film-base"/>
      <path class="pj-film-edge" fill="none"/>
    </g>
    <path class="pj-film-hit"/>
  </svg>
  <canvas class="pj-film-canvas" aria-hidden="true"></canvas>
</div>
<div class="pj-machine" part="machine"></div>
<div class="pj-flare"></div>
<div class="pj-drop" part="drop"><span></span></div>
<input class="pj-file" type="file" multiple accept="${IMAGE_ACCEPT}" tabindex="-1" aria-hidden="true">
<input class="pj-file" type="file" accept="${VIDEO_ACCEPT}" tabindex="-1" aria-hidden="true">
<p class="pj-sr" aria-live="polite"></p>`;
    this.shadowRoot.append(stage);
    this._stage = stage;
    const $ = (s) => stage.querySelector(s);
    this._room = $(".pj-room");
    this._spill = $(".pj-spill");
    this._screen = $(".pj-screen");
    this._jolt = $(".pj-jolt");
    this._weaveEl = $(".pj-weave");
    this._shots = [...stage.querySelectorAll(".pj-shot")];
    this._video = $(".pj-video");
    this._blank = $(".pj-blank");
    this._grainCanvas = $(".pj-grain");
    this._darkEl = $(".pj-dark");
    this._shutter = $(".pj-shutter");
    this._beam = $(".pj-beam");
    this._beamSoft = $(".pj-beam-soft");
    this._beamCore = $(".pj-beam-core");
    this._dustCanvas = $(".pj-dust");
    this._machine = $(".pj-machine");
    this._film = $(".pj-film");
    this._filmSvg = $(".pj-film-svg");
    this._filmBase = $(".pj-film-base");
    this._filmEdge = $(".pj-film-edge");
    this._filmHit = $(".pj-film-hit");
    this._maskRect = $(".pj-mask-rect");
    this._fade = $("#pjFilmFade");
    this._filmCanvas = $(".pj-film-canvas");
    this._flare = $(".pj-flare");
    this._live = $(".pj-sr");
    [this._photoInput, this._videoInput] = stage.querySelectorAll(".pj-file");

    this._geos = { filmstrip: this._geo(CAMERA), cinema: this._geo(CINEMA_CAMERA) };
    this._camMode = this._core.snapshot().mode;
    this._buildMachine(this._geos[this._camMode]);
    this._bindInput();
    this._bindVideo();
    this._applyLabels();
    this._renderFocus();
    this._syncControls();
  }

  /** Camera + bounds for one view of the machine (no DOM). */
  _geo(camera) {
    const P = createCamera(camera);
    const M = MODEL;
    const pts = [];
    const add = (x, y, z) => pts.push(P.proj(x, y, z));
    for (const x of [M.base.x0, M.base.x1]) for (const y of [M.base.y0, M.base.y1]) for (const z of [-M.feet.h, M.body.z1]) add(x, y, z);
    for (const r of M.reels) { add(r.x - r.r, r.y, r.z + r.r); add(r.x + r.r, r.y, r.z + r.r); add(r.x - r.r, r.y, r.z - r.r); }
    for (const t of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI]) add(LENS_EXIT.x, M.lens.y + 40 * Math.cos(t), M.lens.z + 40 * Math.sin(t));
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) add(M.table.x + dx * M.can.r, M.table.y + dy * M.can.r, M.table.z + (dy < 0 ? M.can.h : 0));
    const pad = 14;
    const minX = Math.min(...pts.map((p) => p.x)) - pad, maxX = Math.max(...pts.map((p) => p.x)) + pad;
    const minY = Math.min(...pts.map((p) => p.y)) - pad, maxY = Math.max(...pts.map((p) => p.y)) + pad;
    P.origin.x = -minX;
    P.origin.y = -minY;
    const a = P.proj(1, 0, 0), o = P.proj(0, 0, 0);
    const dl = Math.hypot(a.x - o.x, a.y - o.y);
    return {
      P,
      Wp: Math.ceil(maxX - minX),
      Hp: Math.ceil(maxY - minY),
      lensPx: P.proj(LENS_EXIT.x, LENS_EXIT.y, LENS_EXIT.z),
      lensDir: { x: (a.x - o.x) / dl, y: (a.y - o.y) / dl },
    };
  }

  /** Draw the machine for one camera (Filmstrip: lens to the right; Cinema: from behind). */
  _buildMachine(geo) {
    const P = geo.P, M = MODEL;
    this._P = P;
    this._Wp = geo.Wp;
    this._Hp = geo.Hp;
    this._lensPx = geo.lensPx;
    this._lensDir = geo.lensDir;
    this.style.setProperty("--_grain-img", `url("${woodGrainUrl()}")`);

    const plane = (cls, o, u, v, w, h, inner = "", attrs = "") =>
      `<div class="pj-plane ${cls}" style="width:${w}px;height:${h}px;transform:${P.plane(o, u, v)}" ${attrs}>${inner}</div>`;
    const front = (cls, x, y, z, w, h, inner = "", attrs = "") => plane(cls, [x, y, z], [1, 0, 0], [0, 0, -1], w, h, inner, attrs);
    const seeRight = P.facing([1, 0, 0]);
    const right = (cls, x, y, z, w, h, inner = "", attrs = "") => seeRight ? plane(cls, [x, y, z], [0, -1, 0], [0, 0, -1], w, h, inner, attrs) : "";
    // the back end (−x) when the machine is seen from behind
    const left = (cls, x, y, z, w, h, inner = "", attrs = "") => seeRight ? "" : plane(cls, [x, y, z], [0, 1, 0], [0, 0, -1], w, h, inner, attrs);
    const top = (cls, x, y, z, w, h, inner = "", attrs = "") => plane(cls, [x, y, z], [1, 0, 0], [0, 1, 0], w, h, inner, attrs);
    const cyl = (opts) => cylinderSvg(P, opts);

    const B = M.base, Y = M.body, F = M.feet, Hh = M.hatch;
    const feet = [[B.x0 + F.inset, B.y0 + F.inset], [B.x1 - F.inset, B.y0 + F.inset], [B.x0 + F.inset, B.y1 - F.inset], [B.x1 - F.inset, B.y1 - F.inset]]
      .map(([x, y]) => cyl({ cx: x, cy: y, r: F.r, z0: -F.h, z1: 0, side: DARK_SIDE })).join("");

    const posts = M.reels.map((r) =>
      cyl({ cx: r.x, cy: M.postY, r: 9, z0: Y.z1, z1: Y.z1 + 4, side: DARK_SIDE, top: "#2a2622" }) +
      cyl({ cx: r.x, cy: M.postY, r: 4.2, z0: Y.z1 + 4, z1: r.z, side: BRASS_SIDE })).join("");

    this._packEdges = [];
    const reels = M.reels.map((r) => {
      const edge = reelEdgeSvg(P, r, { gap: M.reelGap, plate: M.reelPlate });
      this._packEdges.push({ fn: edge.packEdge, r: r.r, last: -1 });
      return `
      ${front("pj-reel-back", r.x - r.r, r.y - M.reelGap, r.z + r.r, r.r * 2, r.r * 2)}
      ${edge.markup}
      ${front("pj-reel", r.x - r.r, r.y, r.z + r.r, r.r * 2, r.r * 2,
        `<div class="pj-reel-rot" data-reel="${r.key}"><div class="pj-pack">${reelPackSvg(r.r)}</div>${reelFrontSvg(r.r)}</div><div class="pj-reel-sheen"></div>
         <button class="pj-hit pj-hit-round" data-hit="reel" style="inset:0"></button>`)}
      ${hubCapSvg(P, r)}`;
    }).join("");

    const lens = lensSvg(P);
    // seen from behind, the lens points away and sits behind the body
    const lensMarkup = `<svg class="pj-abs pj-lens" style="width:${this._Wp}px;height:${this._Hp}px" viewBox="0 0 ${this._Wp} ${this._Hp}" aria-hidden="true"><defs>${lens.defs}</defs>${lens.body}</svg>`;
    const ringPart = M.lens.parts.find((p) => p.key === "ring");
    const ringPts = [];
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      for (const x of [ringPart.x0, ringPart.x1]) ringPts.push(P.proj(x, M.lens.y + ringPart.r * Math.cos(t), M.lens.z + ringPart.r * Math.sin(t)));
    }
    const rb = {
      x0: Math.min(...ringPts.map((p) => p.x)), x1: Math.max(...ringPts.map((p) => p.x)),
      y0: Math.min(...ringPts.map((p) => p.y)), y1: Math.max(...ringPts.map((p) => p.y)),
    };

    const slots = Array.from({ length: 6 }, (_, i) => `<i style="top:${6 + i * 8.6}px"></i>`).join("");
    const icon = {
      prev: `<svg viewBox="0 0 16 12"><path d="M7 1 L1 6 L7 11 Z M14 1 L8 6 L14 11 Z"/></svg>`,
      play: `<svg viewBox="0 0 16 12"><path class="pj-i-play" d="M4 1 L13 6 L4 11 Z"/><path class="pj-i-pause" d="M3.5 1.5 h3 v9 h-3 Z M9.5 1.5 h3 v9 h-3 Z"/></svg>`,
      next: `<svg viewBox="0 0 16 12"><path d="M2 1 L8 6 L2 11 Z M9 1 L15 6 L9 11 Z"/></svg>`,
    };
    const panel = `
      <div class="pj-screws"><i style="left:5px;top:5px"></i><i style="right:5px;top:5px"></i><i style="left:5px;bottom:5px"></i><i style="right:5px;bottom:5px"></i></div>
      <div class="pj-grille">${slots}<div class="pj-grille-glow">${slots}</div></div>
      <div class="pj-badge">LAMP · 24V</div>
      <div class="pj-plate" part="nameplate"><span class="pj-brand"></span><span class="pj-model"></span></div>
      <div class="pj-panel">
        <button class="pj-toggle" data-hit="power"><span class="pj-lever"></span></button>
        <span class="pj-led"></span>
        <button class="pj-key" data-hit="prev">${icon.prev}</button>
        <button class="pj-key pj-key-play" data-hit="play">${icon.play}</button>
        <button class="pj-key" data-hit="next">${icon.next}</button>
        <span class="pj-cap" style="left:2px">POWER</span><span class="pj-cap" style="left:44px;width:78px">SLIDE · RUN · SLIDE</span>
      </div>`;


    this._machine.innerHTML = `
<div class="pj-mscene" style="width:${this._Wp}px;height:${this._Hp}px">
  ${top("pj-ground", B.x0 - 14, B.y0 - 8, -F.h, B.x1 - B.x0 + 34, B.y1 - B.y0 + 30)}
  ${top("pj-ground pj-contact", B.x0 - 2, B.y0 + 2, -F.h, B.x1 - B.x0 + 10, B.y1 - B.y0 + 6)}
  ${feet}
  ${top("pj-base pj-base-top", B.x0, B.y0, B.z1, B.x1 - B.x0, B.y1 - B.y0)}
  ${front("pj-base pj-base-front", B.x0, B.y1, B.z1, B.x1 - B.x0, B.z1 - B.z0)}
  ${right("pj-base pj-base-right", B.x1, B.y1, B.z1, B.y1 - B.y0, B.z1 - B.z0)}
  ${left("pj-base pj-base-right", B.x0, B.y0, B.z1, B.y1 - B.y0, B.z1 - B.z0)}
  ${top("pj-lens-shadow", 250, 30, B.z1 + 0.2, 96, 66)}
  ${seeRight ? "" : lensMarkup}
  ${top("pj-body-shadow", Y.x0 - 4, Y.y0 + 6, B.z1 + 0.1, Y.x1 - Y.x0 + 14, Y.y1 - Y.y0 + 6)}
  ${front("pj-body pj-front", Y.x0, Y.y1, Y.z1, Y.x1 - Y.x0, Y.z1 - Y.z0, panel)}
  ${right("pj-body pj-right", Y.x1, Y.y1, Y.z1, Y.y1 - Y.y0, Y.z1 - Y.z0, `<div class="pj-vents">${Array.from({ length: 7 }, (_, i) => `<i style="left:${10 + i * 6}px"></i>`).join("")}</div>`)}
  ${left("pj-body pj-right pj-back-end", Y.x0, Y.y0, Y.z1, Y.y1 - Y.y0, Y.z1 - Y.z0, `<div class="pj-vents">${Array.from({ length: 7 }, (_, i) => `<i style="left:${24 + i * 6}px"></i>`).join("")}</div>`)}
  ${top("pj-body pj-top", Y.x0, Y.y0, Y.z1, Y.x1 - Y.x0, Y.y1 - Y.y0)}
  ${top("pj-bay", Hh.x0, Hh.y0, Hh.z + 0.15, Hh.x1 - Hh.x0, Hh.y1 - Hh.y0)}
  <div class="pj-layer" data-slot="bay"></div>
  ${posts}
  ${reels}
  <div class="pj-lid" data-lid>
    <div class="pj-plane pj-lid-front" style="width:${Hh.x1 - Hh.x0}px;height:${Hh.thick}px"></div>
    <div class="pj-plane pj-lid-top" style="width:${Hh.x1 - Hh.x0}px;height:${Hh.y1 - Hh.y0}px"><div class="pj-lid-ribs"></div><span class="pj-latch"></span>
      <button class="pj-hit" data-hit="lid" style="inset:0;border-radius:4px"></button></div>
  </div>
  ${seeRight ? lensMarkup : ""}
  <div class="pj-hit pj-hit-focus" data-hit="focus" role="slider" tabindex="0" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0"
    style="left:${r2(rb.x0 - 4)}px;top:${r2(rb.y0 - 4)}px;width:${r2(rb.x1 - rb.x0 + 8)}px;height:${r2(rb.y1 - rb.y0 + 8)}px"></div>
  <div class="pj-layer" data-slot="table"></div>
</div>`;
    const $ = (s) => this._machine.querySelector(s);
    this._mscene = $(".pj-mscene");
    this._reelRots = [...this._machine.querySelectorAll(".pj-reel-rot")];
    [...this._machine.querySelectorAll("[data-packedge]")].forEach((el, i) => { if (this._packEdges[i]) this._packEdges[i].el = el; });
    this._knurl = $("[data-knurl]");
    this._lidEl = $("[data-lid]");
    this._lidTop = $(".pj-lid-top");
    this._lidFront = $(".pj-lid-front");
    this._slots = { bay: $('[data-slot="bay"]'), table: $('[data-slot="table"]') };
    // the bay only shows what is inside the opening
    const hole = [[Hh.x0, Hh.y0], [Hh.x1, Hh.y0], [Hh.x1, Hh.y1], [Hh.x0, Hh.y1]].map(([x, y]) => P.proj(x, y, Hh.z));
    this._slots.bay.style.clipPath = `polygon(${hole.map((q) => `${r2(q.x)}px ${r2(q.y)}px`).join(", ")})`;
    this._placeLid();
    this._placeCans();
    this._hits = {};
    for (const b of this._machine.querySelectorAll("[data-hit]")) {
      const key = b.dataset.hit;
      if (key === "reel") (this._hits.reels ||= []).push(b);
      else this._hits[key] = b;
    }
    this._applyPlate();
    if (this._inputBound) { this._bindMachine(); this._applyLabels(); this._syncControls(); }
  }

  /** Swap the machine drawing to another camera with a short crossfade. */
  _swapMachine(mode) {
    this._camMode = mode;
    const old = this._machine;
    const next = document.createElement("div");
    next.className = "pj-machine";
    next.setAttribute("part", "machine");
    old.after(next);
    old.removeAttribute("part");
    old.style.pointerEvents = "none";
    this._machine = next;
    this._buildMachine(this._geos[mode]);
    this._layoutKey = "";

    this._renderFocus();
    const reduced = reducedMotion();
    old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? 1 : 260, fill: "forwards" }).finished.then(() => old.remove(), () => old.remove());
    next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduced ? 1 : 260 });
  }

  _applyPlate() {
    const brand = this._machine.querySelector(".pj-brand");
    const model = this._machine.querySelector(".pj-model");
    if (brand) brand.textContent = this.getAttribute("label") ?? "TRINKET";
    if (model) model.textContent = this.getAttribute("model") ?? "Series 8";
  }

  _applyLabels() {
    const L = this._labels;
    const set = (el, text) => el?.setAttribute("aria-label", text);
    set(this._hits.power, L.power);
    set(this._hits.play, L.play);
    set(this._hits.prev, L.prev);
    set(this._hits.next, L.next);
    set(this._hits.focus, L.focus);
    set(this._hits.lid, L.lid);
    this._canTable?.setAttribute("aria-label", L.can);
    for (const r of this._hits.reels || []) set(r, L.reel);
    set(this._film, L.film);
    set(this._screen, L.screen);
    const drop = this._stage.querySelector(".pj-drop span");
    if (drop) drop.textContent = L.drop;
  }

  /* --------------------------------------------------------------- layout */

  _measure() {
    const r = this._stage.getBoundingClientRect();
    const W = Math.round(r.width), H = Math.round(r.height);
    if (!W || !H || (W === this._W && H === this._H)) return;
    this._W = W;
    this._H = H;
    this._layouts = { filmstrip: this._layoutFor("filmstrip"), cinema: this._layoutFor("cinema") };
    this._buildFilm();
    const dpr = Math.min(1.5, globalThis.devicePixelRatio || 1);
    this._dustCanvas.width = Math.round(W * dpr);
    this._dustCanvas.height = Math.round(H * dpr);
    this._dustScale = dpr;
    const fdpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this._filmCanvas.width = Math.round(W * fdpr);
    this._filmCanvas.height = Math.round(H * fdpr);
    this._filmDpr = fdpr;
    for (const svg of [this._beam, this._filmSvg]) svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this._screenRect = null;
    this._layoutKey = "";
    this._render(0, true);
    this._wake();
  }

  /** Machine-local px → stage px for a layout (translate · rotate · scale). */
  _place(lay, p) {
    const c = Math.cos(lay.rot || 0), sn = Math.sin(lay.rot || 0);
    const x = p.x * lay.sc, y = p.y * lay.sc;
    return { x: lay.tx + x * c - y * sn, y: lay.ty + x * sn + y * c };
  }

  _layoutFor(mode) {
    // Designed for wide screens: narrow stages get the same layout, scaled.
    const W = this._W, H = this._H;
    const g = this._geos[mode], M = MODEL;
    const { Wp, Hp, P } = g;
    const foot = P.proj(M.base.x0, M.base.y1, -M.feet.h);
    if (mode === "filmstrip") {
      // a big machine on the left, its lens at the film's centre line
      const sc = Math.min((W * 0.36) / Wp, (H * 0.9) / Hp);
      const tx = -W * 0.005;
      const ty = clamp(H * 0.55 - sc * g.lensPx.y, H * 0.03 - sc * 0, H * 0.99 - sc * Hp);
      return { sc, tx, ty, rot: 0, box: null };
    }
    // cinema: smaller, bottom-left, tilted up on its rear foot to aim at the screen
    const sc = Math.min((W * 0.27) / Wp, (H * 0.5) / Hp);
    const box = { x: W * 0.36, y: H * 0.06, w: W * 0.6, h: H * 0.72 };
    const target = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    // anchor the drawing's bottom-left corner, so nothing is cut off whatever the view
    const anchor = { x: W * 0.03, y: H * 0.97 };
    foot.x = 0; foot.y = Hp;
    const axis = Math.atan2(g.lensDir.y, g.lensDir.x);
    let lay = { sc, tx: 0, ty: 0, rot: 0, box };
    for (let i = 0; i < 3; i++) {
      const f = this._place({ ...lay, tx: 0, ty: 0 }, foot);
      lay.tx = anchor.x - f.x;
      lay.ty = anchor.y - f.y;
      const L = this._place(lay, g.lensPx);
      const want = Math.atan2(target.y - L.y, target.x - L.x);
      lay.rot = clamp(want - axis, -0.07, 0.03);
    }
    const f = this._place({ ...lay, tx: 0, ty: 0 }, foot);
    lay.tx = anchor.x - f.x;
    lay.ty = anchor.y - f.y;
    return lay;
  }

  /** The fixed film track for the current stage size. */
  _buildFilm() {
    const W = this._W, H = this._H;
    const lay = this._layouts.filmstrip;
    const gF = this._geos.filmstrip;
    const L = this._place(lay, gF.lensPx);
    const D = gF.lensDir;
    const sw = clamp(H * 0.56, 80, W * 0.34);
    const F = sw * 1.13;
    // the film starts inside the body (hidden by it) and leaves level with the lens
    // it leaves the body's side, behind the lens barrel, at the body's own height,
    // and opens up in perspective as it comes forward
    const inside = this._place(lay, gF.P.proj(MODEL.body.x1 - 6, MODEL.lens.y, MODEL.lens.z));
    const bodyH = (MODEL.body.z1 - MODEL.body.z0) * gF.P.sinTilt * lay.sc;
    const y0 = L.y;
    const span = W - L.x;
    const A = H * 0.045;
    const pts = [
      { x: inside.x, y: y0 },
      { x: L.x + span * 0.08, y: y0 },
      { x: L.x + span * 0.45, y: y0 - A },
      { x: L.x + span * 0.85, y: y0 - A * 0.35 },
      { x: W + span * 0.25, y: y0 + A * 0.5 },
      { x: W + span * 0.6, y: y0 + A },
    ];
    const path = createFilmPath(pts);
    // the tail recedes: it narrows and fades as it leaves the stage
    const sAtX = (x) => { for (let q = 0; q < path.total; q += 3) if (path.at(q).x >= x) return q; return path.total; };
    const tail0 = sAtX(W * 0.78), tail1 = sAtX(W * 1.04);
    const k0 = clamp((bodyH * 0.92) / sw, 0.3, 1);
    const open = sw * 1.8;
    const scaleAt = (s) => (k0 + (1 - k0) * smooth(0, open, s)) * (1 - 0.22 * smooth(tail0, tail1, s));
    const ramp = sAtX(L.x);
    const step = 2;
    const sT = [0], uT = [0];
    for (let s = step; s <= path.total + step; s += step) {
      sT.push(s);
      uT.push(uT[uT.length - 1] + step / scaleAt(s - step / 2));
    }
    const sOf = (u) => {
      if (u <= 0) return u * scaleAt(0);
      const last = uT.length - 1;
      if (u >= uT[last]) return sT[last] + (u - uT[last]);
      let lo = 0, hi = last;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (uT[mid] <= u) lo = mid; else hi = mid; }
      return sT[lo] + ((u - uT[lo]) / (uT[hi] - uT[lo])) * (sT[hi] - sT[lo]);
    };
    // where the track leaves the stage
    let exit = path.total;
    for (let s = 0; s < path.total; s += 4) {
      const p = path.at(s);
      if (s > ramp && (p.x > W + sw || p.x < -sw || p.y < -sw)) { exit = s; break; }
    }
    const uExit = uT[Math.min(uT.length - 1, Math.round(exit / step))];
    const uRamp = uT[Math.min(uT.length - 1, Math.round(ramp / step))];
    const u0 = lerp(uRamp, uExit, 0.36);
    // base polygon with a width that grows out of the lens
    const left = [], rightSide = [], hitL = [], hitR = [];
    for (let s = 0; s <= path.total; s += 3) {
      const p = path.at(s), half = (sw * scaleAt(s)) / 2;
      const nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
      left.push([p.x + nx * half, p.y + ny * half]);
      rightSide.push([p.x - nx * half, p.y - ny * half]);
      if (s > sw * 0.9) { hitL.push(left.at(-1)); hitR.push(rightSide.at(-1)); }
    }
    const fmt = (a) => a.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" L");
    const polygon = `M${fmt(left)} L${fmt(rightSide.reverse())} Z`;
    this._filmBase.setAttribute("d", polygon);
    this._filmHit.setAttribute("d", `M${fmt(hitL)} L${fmt(hitR.reverse())} Z`);
    rightSide.reverse();
    const inset = (side, k) => side.map(([x, y], i) => {
      const c = path.at(i * 3);
      return [lerp(c.x, x, k), lerp(c.y, y, k)];
    });
    this._filmEdge.setAttribute("d", `M${fmt(inset(left, 0.93))} M${fmt(inset(rightSide, 0.93))}`);
    this._maskRect.setAttribute("x", "0");
    this._maskRect.setAttribute("y", "0");
    this._maskRect.setAttribute("width", String(W));
    this._maskRect.setAttribute("height", String(H));
    this._fade.setAttribute("x1", r2(W * 0.8));
    this._fade.setAttribute("x2", r2(W * 1.02));
    this._fade.setAttribute("y1", "0");
    this._fade.setAttribute("y2", "0");
    this._tailX = [W * 0.8, W * 1.02];

    this._track = { path, sw, F, scaleAt, sOf, u0, uExit, L, D, rampU: -1e9 };
    this._frameSize = { w: F * 0.885, h: sw * 0.72 };
    this._track.uOf = (s) => (s <= 0 ? s / scaleAt(0) : uT[Math.min(uT.length - 1, Math.round(s / step))]);
    this._filmKey = "";
  }

  /* ---------------------------------------------------------------- input */

  _bindInput() {
    const unlock = () => this._sound.unlock();
    this._stage.addEventListener("pointerdown", unlock, { capture: true });
    this._inputBound = true;
    this._bindMachine();
    this._bindFilm();
    this._bindFiles();
  }

  _bindMachine() {
    const h = this._hits;
    h.power.addEventListener("click", () => {
      const on = !this.power;
      this._sound.toggle(on);
      this._core.setPower(on);
      this._wake();
    });
    h.play.addEventListener("click", () => { this._sound.key(); this.toggle(); });
    h.prev.addEventListener("click", () => { this._sound.key(); this.prev(); });
    h.next.addEventListener("click", () => { this._sound.key(); this.next(); });
    for (const r of h.reels) r.addEventListener("click", () => {
      const ev = this._emit("pick", { kind: "photos" }, true);
      if (!ev.defaultPrevented) this.openPicker("photos");
    });
    this._bindFocusRing(h.focus);
    h.lid?.addEventListener("click", () => { if (!this._inserting) this._lidState.open ? this.closeLid() : this.openLid(); });
  }

  _bindFiles() {
    this._photoInput.addEventListener("change", async () => {
      const files = [...this._photoInput.files];
      if (!files.length) return;
      const result = await sortFiles(files);
      const ev = this._emit("import", { ...result, source: "picker" }, true);
      if (!ev.defaultPrevented) this._offer(result);
    });
    this._videoInput.addEventListener("change", async () => {
      const file = this._videoInput.files[0];
      if (!file) return;
      const clip = createClip(file);
      const ev = this._emit("import", { frames: [], clip, source: "picker" }, true);
      if (!ev.defaultPrevented) this._offer({ frames: [], clip });
    });
  }

  _bindFocusRing(el) {
    let drag = null;
    let lastTick = this.focus;
    const setFocus = (v) => {
      this._core.setFocus(v);
      if (Math.abs(this.focus - lastTick) > 0.06) { lastTick = this.focus; this._sound.tick(); }
      this._renderFocus();
      this._emit("focuschange", { focus: this.focus });
      this._wake();
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, f: this.focus };
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const k = 1 / Math.max(60, 90 * (this._layoutNow?.sc || 1));
      setFocus(drag.f + (e.clientX - drag.x - (e.clientY - drag.y)) * k);
    });
    const end = (e) => { if (drag?.id === e.pointerId) drag = null; };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("wheel", (e) => { e.preventDefault(); setFocus(this.focus - Math.sign(e.deltaY || e.deltaX) * 0.05); }, { passive: false });
    el.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 0.15 : 0.05;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") { setFocus(this.focus + step); e.preventDefault(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { setFocus(this.focus - step); e.preventDefault(); }
      else if (e.key === "Home") { setFocus(0); e.preventDefault(); }
    });
  }

  _bindFilm() {
    const film = this._film;
    let g = null;
    const toStage = (e) => { const r = this._stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    film.addEventListener("pointerdown", (e) => {
      if (e.button > 0 || !this._track || this.mode !== "filmstrip") return;
      const onFilm = e.target === this._filmHit;
      if (!onFilm) return;
      e.preventDefault();
      film.setPointerCapture?.(e.pointerId);
      const p = toStage(e);
      g = { id: e.pointerId, x: p.x, y: p.y, s: this._track.path.nearest(p.x, p.y).s, moved: false, samples: [], x0: p.x, y0: p.y };
    });
    film.addEventListener("pointermove", (e) => {
      if (!g || g.id !== e.pointerId) return;
      const p = toStage(e);
      if (!g.moved) {
        if (Math.hypot(p.x - g.x, p.y - g.y) < 5) return;
        g.moved = true;
        this._core.grab();
        this.toggleAttribute("data-dragging", true);
      }
      const t = this._track;
      const at = t.path.at(g.s);
      const ds = (p.x - g.x) * Math.cos(at.angle) + (p.y - g.y) * Math.sin(at.angle);
      const du = ds / t.scaleAt(clamp(g.s, 0, t.path.total));
      g.s = clamp(g.s + ds, 0, t.path.total);
      g.x = p.x; g.y = p.y;
      const prev = this._core.snapshot().offset;
      const next = prev + du / t.F;
      const now = performance.now();
      g.samples.push({ t: now, o: next });
      while (g.samples.length > 2 && now - g.samples[0].t > 120) g.samples.shift();
      if (Math.floor(prev) !== Math.floor(next)) this._sound.sprocket();
      this._core.drag(next);
      this._wake();
    });
    const end = (e, cancelled = false) => {
      if (!g || g.id !== e.pointerId) return;
      const d = g;
      g = null;
      this.removeAttribute("data-dragging");
      if (d.moved) {
        const a = d.samples[0], b = d.samples.at(-1);
        const vel = a && b && b.t > a.t ? ((b.o - a.o) / (b.t - a.t)) * 1000 : 0;
        this._core.release(vel);
      } else if (!cancelled && this._frames.length) {
        const t = this._track;
        const u = t.uOf(t.path.nearest(d.x0, d.y0).s);
        const k = Math.round(this._core.snapshot().offset - (u - t.u0) / t.F);
        const i = wrap(k, this._frames.length);
        this._core.goTo(i);
        this._emit("select", { index: i, frame: this._frames[i] });
      }
      this._wake();
    };
    film.addEventListener("pointerup", (e) => end(e));
    film.addEventListener("pointercancel", (e) => end(e, true));
    film.addEventListener("wheel", (e) => {
      if (this.mode !== "filmstrip" || !this._frames.length || !this._track) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      this._core.nudge((d * (e.deltaMode === 1 ? 16 : 1)) / (this._track.F * 1.6));
      this._wake();
    }, { passive: false });
    film.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { this.next(); e.preventDefault(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { this.prev(); e.preventDefault(); }
      else if (e.key === " " || e.key === "Enter") { this.toggle(); e.preventDefault(); }
      else if (e.key === "Home") { this.goTo(0); e.preventDefault(); }
    });
  }

  _bindDrop(on) {
    const fn = on ? "addEventListener" : "removeEventListener";
    if (on && !this._dropHandlers) {
      const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
      const off = () => this.getAttribute("drop") === "off";
      this._dropHandlers = {
        dragenter: (e) => { if (off() || !hasFiles(e)) return; e.preventDefault(); this._dragDepth++; this.dataset.dropping = ""; },
        dragover: (e) => { if (off() || !hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; },
        dragleave: () => { if (--this._dragDepth <= 0) { this._dragDepth = 0; delete this.dataset.dropping; } },
        drop: async (e) => {
          if (off() || !hasFiles(e)) return;
          e.preventDefault();
          this._dragDepth = 0;
          delete this.dataset.dropping;
          const result = await sortFiles(e.dataTransfer.files);
          if (!result.frames.length && !result.clip) { this._emit("blocked", { reason: "not-media" }); return; }
          const ev = this._emit("import", { ...result, source: "drop" }, true);
          if (ev.defaultPrevented) return;
          this._offer(result);
        },
      };
    }
    if (this._dropHandlers) for (const [type, h] of Object.entries(this._dropHandlers)) this[fn](type, h);
  }

  _bindVideo() {
    const v = this._video;
    v.addEventListener("loadedmetadata", () => {
      this._videoReady = true;
      if (this._clip) { this._clip.duration = v.duration; this._clip.aspect = v.videoWidth / v.videoHeight || 16 / 9; }
      this._emit("durationchange", { duration: v.duration });
      this._wake();
    });
    v.addEventListener("ended", () => { this._core.videoEnded(); this._wake(); });
    v.addEventListener("error", () => {
      if (!this._clip) return;
      const support = canPlayH264();
      const clip = this._clip;
      this._emit("error", { reason: "video", h264: support, error: v.error, clip });
      this._emit("blocked", { reason: "codec" });
      // can't be decoded here: take it off the projector, back to the photos
      if (this._clip === clip) this.clearVideo();
    });
    v.addEventListener("timeupdate", () => {
      if (this._core.snapshot().source !== "video") return;
      this._emit("timeupdate", { currentTime: v.currentTime, duration: v.duration, progress: v.duration ? v.currentTime / v.duration : 0 });
    });
    for (const t of ["play", "pause", "ratechange"]) v.addEventListener(t, () => this._wake());
  }

  /* ----------------------------------------------------------- core events */

  _onCore(type, detail) {
    switch (type) {
      case "power":
        this.toggleAttribute("data-power", detail.on);
        this._sound.fan(detail.on);
        this._syncControls();
        this._emit("power", { on: detail.on });
        break;
      case "play":
        this._emit("play", { mode: this.mode, source: this.source });
        this._syncControls();
        break;
      case "pause":
        this._emit("pause", { reason: detail.reason || "user" });
        this._syncControls();
        break;
      case "mode":
        if (this.getAttribute("mode") !== detail.mode) this.setAttribute("mode", detail.mode);
        this._shown = null;
        this._emit("modechange", { mode: detail.mode, index: this.index });
        break;
      case "source":
        this.dataset.source = detail.source;
        this._shown = null;
        this._emit("sourcechange", { source: detail.source });
        break;
      case "slide":
        if (this._modeT > 0.5) this._slideChange(detail.dir);
        break;
      case "index":
        this._emit("change", { index: detail.index, frame: this._frames[detail.index] });
        this._announce();
        break;
      case "state":
        this.setAttribute("state", detail.state);
        this._emit("statechange", detail);
        this._syncControls();
        break;
      case "blocked":
        this._emit("blocked", detail);
        break;
    }
    this._wake();
  }

  _syncControls() {
    const s = this._core.snapshot();
    this.toggleAttribute("data-playing", s.running);
    this._hits.power?.setAttribute("aria-pressed", String(s.power));
    this._hits.play?.setAttribute("aria-pressed", String(s.running));
  }

  _announce() {
    const n = this._frames.length;
    if (!n || !this._live) return;
    const fr = this.frame;
    const text = this._labels.photo.replace("{i}", this.index + 1).replace("{n}", n);
    this._live.textContent = fr?.title ? `${text} — ${fr.title}` : text;
  }

  /* ------------------------------------------------------------ choreography */

  /** The film runs out of the lens across the stage. */
  _unrollFilm() {
    if (reducedMotion() || !this._track) return;
    const L = this._track.L;
    this._film.animate([{ clipPath: `polygon(0 0, ${r2(L.x)}px 0, ${r2(L.x)}px 100%, 0 100%)` }, { clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" }],
      { duration: 1100, easing: "cubic-bezier(.4,0,.2,1)" });
  }

  _mountReels() {
    const reduced = reducedMotion();
    this._packFrom = this._pack;
    this._packAt = performance.now();
    this._packDur = reduced ? 1 : 700;
    for (const [i, el] of this._reelRots.entries()) {
      el.animate([{ transform: `translateY(-14px) rotate(${i ? 40 : -30}deg)`, opacity: 0.4 }, { transform: "translateY(0) rotate(0)", opacity: 1 }],
        { duration: reduced ? 1 : 520, delay: i * 90, easing: "cubic-bezier(.3,1.4,.5,1)", composite: "add" });
    }
    if (!reduced) setTimeout(() => this._sound.mount(), 260);
  }

  _slideChange(dir) {
    this._sound.slide(dir);
    if (reducedMotion()) { this._swapShot(true); return; }
    this._slidePending = true;
    clearTimeout(this._slideTimer);
    this._slideTimer = setTimeout(() => { this._slidePending = false; this._swapShot(true); }, 110);
    this._shutter.getAnimations().forEach((a) => a.cancel());
    this._shutter.animate([{ opacity: 0 }, { opacity: 0.95, offset: 0.25 }, { opacity: 0.95, offset: 0.45 }, { opacity: 0 }], { duration: 360, easing: "ease-in-out" });
    this._jolt.animate([
      { transform: "translateY(0)" },
      { transform: `translateY(${dir * 3.5}%)`, offset: 0.35 },
      { transform: `translateY(${-dir * 0.8}%)`, offset: 0.62 },
      { transform: "translateY(0)" },
    ], { duration: 520, easing: "ease-out" });
  }

  /** Put the current photo on the screen (double-buffered). */
  async _swapShot(cut = false) {
    const fr = this.frame;
    const key = fr ? fr.id : null;
    if (key === this._shown) return;
    this._shown = key;
    if (!fr) { for (const s of this._shots) s.classList.remove("on"); return; }
    const next = this._shots[1 - this._shot];
    const img = next.firstElementChild;
    img.src = fr.src;
    try { await img.decode(); } catch { /* still try to show it */ }
    if (this._shown !== key) return;
    next.classList.toggle("cut", cut);
    this._shots[this._shot].classList.toggle("cut", cut);
    next.classList.add("on");
    this._shots[this._shot].classList.remove("on");
    this._shot = 1 - this._shot;
    this._wake();
  }

  _renderFocus() {
    const f = this._core.focus;
    if (this._knurl) this._knurl.innerHTML = knurlSvg(this._P, f * 160);
    this._hits?.focus?.setAttribute("aria-valuenow", String(Math.round(f * 100)));
    const blur = Math.abs(f) ** 1.2 * 9;
    this._screen?.style.setProperty("--_blur", r2(blur) + "px");
  }

  /* ----------------------------------------------------------------- loop */

  _wake() {
    if (this._raf || !this.isConnected) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  _tick(now) {
    this._raf = 0;
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    const snap = this._core.tick(dt);

    // mode blend
    const goal = snap.mode === "cinema" ? 1 : 0;
    const dur = reducedMotion() ? 0.01 : 0.95;
    if (this._modeT !== goal) {
      this._modeT = goal > this._modeT ? Math.min(goal, this._modeT + dt / dur) : Math.max(goal, this._modeT - dt / dur);
    }

    // video follows the projector
    this._syncVideo(snap);

    // display offset: continuous in filmstrip, sprung in cinema
    if (snap.mode === "filmstrip" || Math.abs(this._disp - snap.offset) > 20) this._disp = snap.offset;
    else {
      const d = snap.offset - this._disp;
      this._disp += d * ease(dt, 0.09);
      if (Math.abs(d) < 0.002) this._disp = snap.offset;
    }

    // film pack size follows how much of the reel has run
    const hasFilm = this._frames.length > 0 || !!this._clip;
    let packGoal = hasFilm ? 1 : 0;
    if (this._packAt) {
      const t = clamp((now - this._packAt) / this._packDur, 0, 1);
      this._pack = lerp(this._packFrom, packGoal, 1 - (1 - t) ** 3);
      if (t >= 1) this._packAt = 0;
    } else this._pack = packGoal;

    // lamp flicker (only visible on the screen / flare)
    if (snap.lamp > 0 && !reducedMotion()) {
      const n = Math.sin(now * 0.031) * 0.012 + Math.sin(now * 0.071 + 1.3) * 0.01 + (Math.random() - 0.5) * 0.03;
      this._flicker = clamp(1 + n - (Math.random() < 0.006 ? 0.08 : 0), 0.85, 1.04);
    } else this._flicker = 1;

    const lidMoving = this._stepLid(now);
    this._render(dt, false, snap, now);

    // sound
    let motor = 0, rate = 1;
    if (snap.power) {
      if (snap.mode === "filmstrip") { motor = clamp(Math.abs(snap.vel) / (snap.filmRate * 0.9), 0, 1.2); rate = 0.65 + Math.min(1.4, Math.abs(snap.vel) / snap.filmRate) * 0.45; }
      else if (snap.source === "video" && snap.video.playing) { motor = 0.85; rate = 1.1; }
      else if (snap.running) { motor = 0.55; rate = 0.8; }
    }
    this._sound.motor(motor, rate);

    const cinemaLit = this._modeT > 0.01 && snap.lamp > 0.01;
    const busy = lidMoving || !this._core.idle() || this._modeT !== goal || cinemaLit || this._packAt || this._screenMoving
      || Math.abs(this._disp - snap.offset) > 0.0005 || (this._video && !this._video.paused);
    if (busy) this._wake();
  }

  _syncVideo(snap) {
    const v = this._video;
    if (!this._clip) { this._core.setVideoState({ playing: false }); return; }
    const want = snap.mode === "cinema" && this._modeT > 0.6 && snap.source === "video" && snap.running && snap.lamp > 0.25;
    if (want && v.paused && !this._videoPending) {
      this._videoPending = true;
      v.play().then(() => { this._videoPending = false; }).catch((err) => {
        this._videoPending = false;
        if (err?.name === "NotAllowedError") {
          // allowed without sound: try muted, tell the host
          if (!v.muted) { v.muted = true; this._emit("blocked", { reason: "autoplay" }); }
        } else if (err?.name !== "AbortError") this._core.pause();
      });
    } else if (!want && !v.paused) v.pause();
    this._core.setVideoState({ playing: !v.paused, rate: v.playbackRate, progress: v.duration ? v.currentTime / v.duration : 0 });
  }

  _render(dt, force = false, snap = this._core.snapshot(), now = performance.now()) {
    if (!this._W || !this._layouts) return;
    const W = this._W, H = this._H;
    const t = easeInOut(this._modeT);
    const A = this._layouts.filmstrip, B = this._layouts.cinema;
    const want = this._modeT >= 0.5 ? "cinema" : "filmstrip";
    if (want !== this._camMode) this._swapMachine(want);
    // each camera has its own layout; blend positions of the shared anchor (the base's front foot)
    const lay = this._blendLayout(A, B, t);
    this._layoutNow = lay;
    const lk = `${r2(lay.sc * 1000)}|${r2(lay.tx)}|${r2(lay.ty)}|${r2(lay.rot * 1000)}`;
    if (force || lk !== this._layoutKey) {
      this._layoutKey = lk;
      this._machine.style.transform = `translate(${r2(lay.tx)}px, ${r2(lay.ty)}px) rotate(${(lay.rot * 180 / Math.PI).toFixed(3)}deg) scale(${lay.sc.toFixed(4)})`;
    }
    const lens = this._place(lay, this._lensPx);
    const lamp = snap.lamp;

    // host-level light variable (grille, LED, lens glass)
    const lv = Math.round(lamp * 100) / 100;
    if (lv !== this._lampVar) { this._lampVar = lv; this.style.setProperty("--_lamp", String(lv)); }

    // reels
    const reelOrder = [1, 0.76];
    const vp = snap.source === "video" && this._clip ? snap.video.progress : (this._frames.length ? (((snap.offset % this._frames.length) + this._frames.length) % this._frames.length) / this._frames.length : 0);
    this._reelRots.forEach((el, i) => {
      const ang = (-snap.reelAngle * reelOrder[i]) % 360;
      el.style.transform = `rotate(${ang.toFixed(2)}deg)`;
      const fill = i === 0 ? Math.sqrt(0.15 + 0.85 * vp) : Math.sqrt(1 - 0.85 * vp);
      const pack = 0.24 + (this._pack * (0.3 + 0.7 * fill)) * 0.76;
      el.style.setProperty("--pack", pack.toFixed(3));
      // the wound film seen between the flanges
      const pe = this._packEdges?.[i];
      if (pe?.el) {
        const R = pe.r * 0.94 * pack;
        if (Math.abs(R - pe.last) > 0.25) { pe.last = R; pe.el.setAttribute("d", this._pack > 0.02 ? pe.fn(R) : ""); }
      }
    });


    // filmstrip
    const filmVis = clamp(1 - this._modeT * 2.6, 0, 1) * (this._frames.length ? 1 : 0);
    this._film.style.opacity = String(filmVis);
    this._film.style.visibility = filmVis > 0 ? "visible" : "hidden";
    this._film.toggleAttribute("inert", filmVis < 0.5);
    if (filmVis > 0) this._renderFilm(snap, force);

    // cinema
    this._renderCinema(dt, snap, lens, lay, now);

    // flare at the lens
    const flare = lamp * (0.55 + 0.45 * t) * this._flicker;
    const size = 150 * lay.sc;
    this._flare.style.transform = `translate(${r2(lens.x - size / 2)}px, ${r2(lens.y - size / 2)}px)`;
    this._flare.style.width = this._flare.style.height = r2(size) + "px";
    this._flare.style.opacity = flare.toFixed(3);
  }

  _blendLayout(A, B, t) {
    const gA = this._geos.filmstrip, gB = this._geos.cinema, M = MODEL;
    const footOf = (g) => g.P.proj(M.base.x0, M.base.y1, -M.feet.h);
    const pa = this._place(A, footOf(gA)), pb = this._place(B, footOf(gB));
    const cur = this._geos[this._camMode];
    // size: blend the drawn width so the swap doesn't jump
    const wA = A.sc * gA.Wp, wB = B.sc * gB.Wp;
    const lay = { sc: lerp(wA, wB, t) / cur.Wp, rot: lerp(A.rot, B.rot, t), tx: 0, ty: 0 };
    const f = this._place(lay, footOf(cur));
    lay.tx = lerp(pa.x, pb.x, t) - f.x;
    lay.ty = lerp(pa.y, pb.y, t) - f.y;
    return lay;
  }

  _resetFilmFrames() {
    // drop cached film images of frames that left the reel
    const keep = new Set(this._frames.map((f) => f.id));
    for (const key of this._bitmaps.keys()) if (!keep.has(key.split("|")[0])) this._bitmaps.delete(key);
    this._filmKey = "";
  }

  /** The photo as it sits on the film: cropped to the frame, toned, cached. */
  _filmImage(fr) {
    // bake at the size the frame is actually drawn (bucketed), from the
    // thumbnail or, when that is too small, the original
    const need = Math.ceil((this._frameSize.h * (this._filmDpr || 1) * 1.1) / 120) * 120;
    const H = clamp(need, 240, 1080);
    const key = fr.id + "|" + H;
    const hit = this._bitmaps.get(key);
    if (hit) return hit === "loading" ? this._bitmaps.get(fr.id + "|last") || null : hit;
    this._bitmaps.set(key, "loading");
    const thumbH = fr.thumb && fr.thumb !== fr.src && fr.width ? Math.min(fr.height, fr.height * (640 / Math.max(fr.width, fr.height))) : Infinity;
    const src = thumbH >= H * 0.9 ? fr.thumb || fr.src : fr.src;
    loadImage(src).then((img) => {
      if (this._bitmaps.get(key) !== "loading") return;
      const aspect = this._frameSize.w / this._frameSize.h;
      const W = Math.round(H * aspect);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const k = Math.max(W / iw, H / ih);
      ctx.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
      // a light print tone: a touch warm, edges slightly darker
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "rgb(255, 241, 222)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.75);
      g.addColorStop(0, "rgba(40,20,5,0)");
      g.addColorStop(1, "rgba(40,20,5,.24)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      this._bitmaps.set(key, c);
      this._bitmaps.set(fr.id + "|last", c);
      this._filmKey = "";
      this._wake();
    }).catch(() => {});
    return this._bitmaps.get(fr.id + "|last") || null;
  }

  _renderFilm(snap, force) {
    const T = this._track;
    if (!T) return;
    const n = this._frames.length;
    const off = snap.offset;
    const key = n + "|" + off.toFixed(4);
    if (!force && key === this._filmKey) return;
    this._filmKey = key;
    const { F, sw, u0, uExit, sOf, scaleAt, path } = T;
    const { w: pw, h: ph } = this._frameSize;
    const c = this._filmCanvas, ctx = c.getContext("2d");
    const dpr = this._filmDpr || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const [fx0, fx1] = this._tailX || [this._W * 0.8, this._W];
    const fade = () => 1;

    const kMin = Math.floor(off - (uExit + F - u0) / F);
    const kMax = Math.ceil(off + (u0 + F) / F);

    // perforations: eight per frame on each edge, lit from behind
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#f4e6cc";
    const per = 8, pitch = F / per;
    for (let k = kMin; k <= kMax; k++) {
      const uc = u0 + (off - k) * F;
      for (let j = 0; j < per; j++) {
        const uh = uc + (j - (per - 1) / 2) * pitch;
        if (uh < 0 || uh > uExit + F) continue;
        const s = sOf(uh), p = path.at(s), sc = scaleAt(s);
        const a = fade(uh, p.x);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a * 0.9;
        const nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
        const hl = pitch * 0.3 * sc, hw = sw * 0.032 * sc, o = sw * 0.432 * sc;
        // where the film opens up, the edges splay: line the holes up with the edge
        const spread = (sw * 0.432 * (scaleAt(s + 2) - scaleAt(Math.max(0, s - 2)))) / 4;
        for (const side of [-1, 1]) {
          let tx = Math.cos(p.angle) + nx * spread * side, ty = Math.sin(p.angle) + ny * spread * side;
          const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
          const cx = p.x + nx * o * side, cy = p.y + ny * o * side;
          ctx.beginPath();
          ctx.moveTo(cx - tx * hl - nx * hw, cy - ty * hl - ny * hw);
          ctx.lineTo(cx + tx * hl - nx * hw, cy + ty * hl - ny * hw);
          ctx.lineTo(cx + tx * hl + nx * hw, cy + ty * hl + ny * hw);
          ctx.lineTo(cx - tx * hl + nx * hw, cy - ty * hl + ny * hw);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // photos, bent along the track in thin slices
    const ramp = T.rampU;
    for (let k = kMin; n && k <= kMax; k++) {
      const uc = u0 + (off - k) * F;
      if (uc < -F * 0.5 || uc > uExit + F) continue;
      // where the film is still opening up, thinner slices keep the edges smooth
      const slices = uc - pw / 2 < ramp ? 72 : 20;
      const img = this._filmImage(this._frames[wrap(k, n)]);
      if (!img) continue;
      const iw = img.width, ih = img.height, sliceW = iw / slices;
      const flip = Math.cos(path.at(sOf(uc)).angle) < -0.08;
      for (let i = 0; i < slices; i++) {
        const ua = uc - pw / 2 + (pw * i) / slices, ub = ua + pw / slices;
                if (ub <= 0) continue;
        const sa = sOf(Math.max(0, ua)), sb = sOf(ub);
        const pa = path.at(sa), pb = path.at(sb), pm = path.at((sa + sb) / 2);
        const a = fade((ua + ub) / 2, pm.x);
        if (a <= 0.01) continue;
        const hh = ph * scaleAt(Math.max(0, (sa + sb) / 2));
        const nx = -Math.sin(pm.angle), ny = Math.cos(pm.angle);
        ctx.globalAlpha = a;
        // each slice runs on over its neighbour so the wedges on the outside
        // of a bend never open up; the neighbour shows the same pixels there
        // overlap from the shorter slice into the taller one, never the other way
        const shrinking = scaleAt(sb) < scaleAt(sa) - 1e-6;
        const over = shrinking ? (i > 0 ? sliceW * 0.75 : 0) : (i < slices - 1 ? sliceW * 0.75 : 0);
        if (!flip) {
          ctx.setTransform(dpr * (pb.x - pa.x) / sliceW, dpr * (pb.y - pa.y) / sliceW, dpr * nx * hh / ih, dpr * ny * hh / ih,
            dpr * (pa.x - nx * hh / 2), dpr * (pa.y - ny * hh / 2));
          if (shrinking) ctx.drawImage(img, i * sliceW - over, 0, sliceW + over, ih, -over, 0, sliceW + over, ih);
          else ctx.drawImage(img, i * sliceW, 0, sliceW + over, ih, 0, 0, sliceW + over, ih);
        } else {
          // running backwards: turn the picture so it stays upright
          ctx.setTransform(dpr * (pa.x - pb.x) / sliceW, dpr * (pa.y - pb.y) / sliceW, -dpr * nx * hh / ih, -dpr * ny * hh / ih,
            dpr * (pb.x + nx * hh / 2), dpr * (pb.y + ny * hh / 2));
          ctx.drawImage(img, iw - (i + 1) * sliceW - over, 0, sliceW + over, ih, -over, 0, sliceW + over, ih);
        }
      }
    }
    ctx.globalAlpha = 1;
    // the tail recedes into the page: erase it gradually, all at once
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(fx0, 0, fx1, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.92)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = g;
    ctx.fillRect(fx0, 0, this._W - fx0 + 4, this._H);
    ctx.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  _renderCinema(dt, snap, lens, lay, now) {
    const W = this._W, H = this._H;
    const vis = clamp((this._modeT - 0.3) / 0.7, 0, 1);
    this._room.style.opacity = (easeInOut(this._modeT) * 0.96).toFixed(3);

    // what is on screen
    const isVideo = snap.source === "video" && !!this._clip;
    const fr = this.frame;
    let aspect = 4 / 3;
    if (isVideo) aspect = this._clip.aspect || 16 / 9;
    else if (fr) aspect = fr.aspect || 4 / 3;
    if (vis > 0 && !isVideo && !this._slidePending) this._swapShot(false);
    this._screen.dataset.show = isVideo ? "video" : fr ? "photo" : "blank";

    // projected rectangle, eased towards its target
    const box = this._layouts.cinema.box;
    const tw = Math.min(box.w, box.h * aspect), th = tw / aspect;
    const target = { x: box.x + (box.w - tw) / 2, y: box.y + (box.h - th) / 2, w: tw, h: th };
    if (!this._screenRect) this._screenRect = { ...target };
    const R = this._screenRect;
    const k = dt ? ease(dt, 0.14) : 1;
    let moving = false;
    for (const key of ["x", "y", "w", "h"]) {
      const d = target[key] - R[key];
      if (Math.abs(d) > 0.3) { R[key] += d * k; moving = true; } else R[key] = target[key];
    }
    this._screenMoving = moving;
    const rk = `${r2(R.x)}|${r2(R.y)}|${r2(R.w)}|${r2(R.h)}`;
    if (rk !== this._rectKey) {
      this._rectKey = rk;
      for (const el of [this._screen]) {
        el.style.transform = `translate(${r2(R.x)}px, ${r2(R.y)}px)`;
        el.style.width = r2(R.w) + "px";
        el.style.height = r2(R.h) + "px";
      }
      const pad = Math.max(R.w, R.h) * 0.12;
      this._spill.style.transform = `translate(${r2(R.x - pad)}px, ${r2(R.y - pad)}px)`;
      this._spill.style.width = r2(R.w + pad * 2) + "px";
      this._spill.style.height = r2(R.h + pad * 2) + "px";
    }

    const light = snap.lamp * this._flicker;
    const shown = vis * (snap.lamp > 0.001 ? 1 : 0);
    this._screen.style.opacity = vis.toFixed(3);
    this._screen.style.visibility = vis > 0 ? "visible" : "hidden";
    this._darkEl.style.opacity = (1 - light * 0.98).toFixed(3);
    this._spill.style.opacity = (vis * light * 0.55).toFixed(3);

    // beam: lens → the four corners
    if (shown > 0) {
      const C = [lens, { x: R.x, y: R.y }, { x: R.x + R.w, y: R.y }, { x: R.x + R.w, y: R.y + R.h }, { x: R.x, y: R.y + R.h }];
      const hullPts = convexHull(C);
      const d = "M" + hullPts.map((p) => `${r2(p.x)} ${r2(p.y)}`).join(" L") + " Z";
      const core = convexHull([lens, { x: R.x + R.w * 0.2, y: R.y + R.h * 0.2 }, { x: R.x + R.w * 0.8, y: R.y + R.h * 0.2 }, { x: R.x + R.w * 0.8, y: R.y + R.h * 0.8 }, { x: R.x + R.w * 0.2, y: R.y + R.h * 0.8 }]);
      this._beamSoft.setAttribute("d", d);
      this._beamCore.setAttribute("d", "M" + core.map((p) => `${r2(p.x)} ${r2(p.y)}`).join(" L") + " Z");
      const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
      for (const id of ["pjBeam", "pjBeamCore"]) {
        const g = this._beam.querySelector("#" + id);
        g.setAttribute("x1", r2(lens.x)); g.setAttribute("y1", r2(lens.y));
        g.setAttribute("x2", r2(cx)); g.setAttribute("y2", r2(cy));
      }
      this._beam.style.opacity = (shown * light * 0.9).toFixed(3);
      this._beam.style.visibility = "visible";
      this._drawDust(dt, lens, R, shown * light, now);
      this._drawGrain(now, shown * light);
      this._doWeave(dt);
    } else {
      this._beam.style.visibility = "hidden";
      if (this._dustDrawn) { this._dustCanvas.getContext("2d").clearRect(0, 0, this._dustCanvas.width, this._dustCanvas.height); this._dustDrawn = false; }
    }
  }

  _doWeave(dt) {
    if (reducedMotion() || !dt) return;
    const w = this._weave;
    w.vx += ((Math.random() - 0.5) * 30 - w.x * 18 - w.vx * 4) * dt;
    w.vy += ((Math.random() - 0.5) * 40 - w.y * 18 - w.vy * 4) * dt;
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    this._weaveEl.style.transform = `translate(${(w.x * 0.12).toFixed(3)}%, ${(w.y * 0.16).toFixed(3)}%)`;
  }

  _drawGrain(now, level) {
    const amount = this._grain;
    this._grainCanvas.style.opacity = (amount * 0.7 * Math.min(1, level * 1.2)).toFixed(3);
    if (!amount || now - this._grainAt < 70 || (reducedMotion() && this._grainAt)) return;
    this._grainAt = now;
    const c = this._grainCanvas;
    // about one grain per 2 screen pixels
    const R = this._screenRect;
    const gw = Math.round(clamp(R.w / 2, 80, 420)), gh = Math.round(clamp(R.h / 2, 60, 300));
    if (c.width !== gw || c.height !== gh) { c.width = gw; c.height = gh; this._grainImg = null; }
    const ctx = c.getContext("2d");
    const img = this._grainImg || (this._grainImg = ctx.createImageData(gw, gh));
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 128 + ((Math.random() + Math.random() - 1) * 70) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // an occasional hair / scratch
    if (Math.random() < 0.16) {
      ctx.strokeStyle = Math.random() < 0.5 ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.7)";
      ctx.lineWidth = 0.7;
      const x = Math.random() * gw;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (Math.random() - 0.5) * 8, gh); ctx.stroke();
    }
    if (Math.random() < 0.08) {
      ctx.fillStyle = "rgba(20,10,5,.55)";
      ctx.beginPath(); ctx.arc(Math.random() * gw, Math.random() * gh, 0.8 + Math.random() * 1.8, 0, 7); ctx.fill();
    }
  }

  _drawDust(dt, lens, R, level, now) {
    const c = this._dustCanvas, ctx = c.getContext("2d");
    const k = this._dustScale || 1;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, this._W, this._H);
    this._dustDrawn = true;
    if (level < 0.02) return;
    const N = reducedMotion() ? 24 : 70;
    while (this._dust.length < N) {
      this._dust.push({ a: Math.random() * 0.95 + 0.04, b: Math.random() * 2 - 1, c: Math.random() * 2 - 1, va: (Math.random() - 0.5) * 0.01, vb: (Math.random() - 0.5) * 0.05, vc: (Math.random() - 0.5) * 0.05 - 0.02, r: Math.random() * 1.3 + 0.35, ph: Math.random() * 6.3 });
    }
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    ctx.globalCompositeOperation = "lighter";
    for (const p of this._dust) {
      if (!reducedMotion()) {
        p.a += p.va * dt; p.b += p.vb * dt; p.c += p.vc * dt;
        p.vb += (Math.random() - 0.5) * 0.02 * dt * 60 * 0.05;
        if (p.a < 0.04 || p.a > 0.99 || Math.abs(p.b) > 1 || Math.abs(p.c) > 1) {
          p.a = Math.random() * 0.95 + 0.04; p.b = Math.random() * 2 - 1; p.c = Math.random() * 2 - 1;
        }
      }
      const qx = cx + p.b * R.w * 0.5, qy = cy + p.c * R.h * 0.5;
      const x = lens.x + (qx - lens.x) * p.a, y = lens.y + (qy - lens.y) * p.a;
      const tw = 0.5 + 0.5 * Math.sin(now * 0.002 + p.ph);
      const alpha = level * (0.25 + 0.6 * tw) * (1 - p.a * 0.55);
      ctx.fillStyle = `rgba(255, 236, 200, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, p.r * (0.6 + p.a * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  _emit(type, detail = {}, cancelable = false) {
    const ev = new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable });
    this.dispatchEvent(ev);
    return ev;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function rollLabel(frames, clip) {
  const n = frames?.length || 0;
  const d = new Date();
  const date = `${String(d.getDate()).padStart(2, "0")}·${String(d.getMonth() + 1).padStart(2, "0")}·${String(d.getFullYear()).slice(2)}`;
  if (n && clip) return { line1: `${n} FR + MP4`, line2: date };
  if (clip) return { line1: "MOTION PICTURE", line2: (clip.title || "MP4").slice(0, 22) };
  return { line1: `${n} FRAME${n === 1 ? "" : "S"}`, line2: date };
}

function convexHull(points) {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

if (!customElements.get("trinket-projector")) customElements.define("trinket-projector", TrinketProjector);
