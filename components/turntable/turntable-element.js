import { createTurntable, DECK, stylusRadius } from "./turntable-core.js";
import {
  CAMERA, PLINTH, GROUND_Z, Z, PARTS,
  createProjector, cylinderSvg, METAL_SIDE, BLACK_METAL_SIDE,
  topDetailsSvg, armSvg, cartridgeSvgInner, woodGrainUrl, esc,
} from "./deck-art.js";
import { renderRecord, renderSleeve, loadImage } from "./record-art.js";
import { createRecord, createRecords, releaseRecord, analyzeEnvelope, isAudioFile, AUDIO_ACCEPT } from "./record-maker.js";
import { readAudioMetadata } from "./metadata.js";
import { createDeckAudio } from "./audio-engine.js";
import { TURNTABLE_CSS } from "./style.js";

export { createRecord, createRecords, releaseRecord, analyzeEnvelope, isAudioFile, AUDIO_ACCEPT, readAudioMetadata, renderRecord, renderSleeve, loadImage };

const DEFAULT_LABELS = {
  arm: "Tonearm",
  record: "Record — tap to play or pause",
  platter: "Empty platter",
  power: "Power",
  speed: "Speed 33 / 45",
  cue: "Cue lever",
  lid: "Dust cover",
  drop: "Drop music here to press a record",
};

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

export class TrinketTurntable extends HTMLElement {
  static get observedAttributes() {
    return ["label", "lid", "speed", "crackle", "tone", "muted", "sfx", "auto-return", "volume"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = TURNTABLE_CSS;
    this.shadowRoot.append(style);

    this._labels = { ...DEFAULT_LABELS };
    this._core = createTurntable({ deck: DECK });
    this._audio = createDeckAudio();
    this._raf = 0;
    this._last = 0;
    this._waiters = [];
    this._anims = 0;
    this._lastState = "empty";
    this._lastTime = 0;
    this._surfZ = 0;
    this._lidAngle = null;
    this._lidVel = 0;
    this._loadToken = 0;
    this._dragDepth = 0;
    this._seekGuard = null;

    let resolve;
    this._ready = new Promise((res) => { resolve = res; });
    this._resolveReady = resolve;

    this._owned = new WeakSet(); // records this element created itself (from a File / plain object)
    this._core.subscribe((event, snap, detail) => this._onCore(event, snap, detail));
    this._audio.on((type, detail) => this._onAudio(type, detail));
  }

  /* ------------------------------------------------------------ lifecycle */

  connectedCallback() {
    if (!this._built) {
      this._built = true;
      this._build();
      this._applyAttributes();
      this._resolveReady(this);
      queueMicrotask(() => this._emit("ready"));
    }
    clearTimeout(this._releaseTimer);
    if (this._audioReleased) {
      // re-attached after removal: reopen the audio for the record still on the platter
      this._audioReleased = false;
      const r = this.record;
      if (r) {
        this._audio.load(r.src);
        this._audio.seekProgress(this._core.snapshot().progress);
      }
    }
    this._resize = new ResizeObserver(() => this._measure());
    this._resize.observe(this._stage);
    this._measure();
    this._bindDrop(true);
    this._render(true);
    this._wake();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._resize?.disconnect();
    this._bindDrop(false);
    this._audio.setActive(false);
    // Moving the element in the DOM disconnects and reconnects in the same task;
    // only a real removal closes the AudioContext.
    clearTimeout(this._releaseTimer);
    this._releaseTimer = setTimeout(() => {
      if (this.isConnected) return;
      this._audio.destroy();
      this._audioReleased = true;
    }, 0);
  }

  /**
   * Free everything: closes the AudioContext and releases records this
   * element created itself. The element can still be used afterwards.
   */
  destroy() {
    this._loadToken++;
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    clearTimeout(this._releaseTimer);
    this._audio.destroy();
    this._audioReleased = false;
    const r = this.record;
    if (r) {
      this._core.setRecord(null);
      this._releaseOwned(r);
    }
    if (this._built) {
      this._recordGroup.setAttribute("data-empty", "");
      this._vinyl.replaceChildren();
    }
  }

  _releaseOwned(record) {
    if (record && this._owned.has(record)) {
      this._owned.delete(record);
      releaseRecord(record);
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this._built || oldValue === newValue) return;
    if (name === "label") {
      this._nameplate.textContent = newValue ?? "TRINKET";
      this._top.querySelector("svg").outerHTML = topDetailsSvg(DECK, { label: newValue ?? "TRINKET" });
    } else if (name === "lid" && (oldValue === null || oldValue === "none" || newValue === null || newValue === "none")) {
      // presence changes the scene bounds: rebuild
      this._rebuild();
    }
    this._applyAttributes();
    this._wake();
  }

  _applyAttributes() {
    this._core.setSpeed(this.getAttribute("speed") === "45" ? 45 : 33);
    this._core.autoReturn = this.getAttribute("auto-return") !== "off";
    this._audio.crackle = this.hasAttribute("crackle") ? Number(this.getAttribute("crackle")) : 0.35;
    this._audio.warmth = this.getAttribute("tone") !== "clean";
    this._audio.muted = this.hasAttribute("muted");
    this._audio.sfx = this.getAttribute("sfx") !== "off";
    if (this.hasAttribute("volume")) this._audio.volume = Number(this.getAttribute("volume"));
  }

  /* ----------------------------------------------------------- public API */

  whenReady() { return this._ready; }

  get state() { return this._core.state; }
  get record() { return this._core.snapshot().record; }
  get power() { return this._core.snapshot().power; }
  set power(on) { this._core.setPower(on); this._wake(); }
  get speed() { return this._core.snapshot().speed; }
  set speed(v) { this.setAttribute("speed", Number(v) === 45 ? "45" : "33"); }
  get volume() { return this._audio.volume; }
  set volume(v) { this.setAttribute("volume", String(clamp(Number(v) || 0, 0, 1))); }
  get currentTime() { return this._audio.currentTime; }
  get duration() { return this._audio.duration || this.record?.duration || 0; }
  get progress() { return this._core.snapshot().progress; }
  get playing() { return this.state === "playing"; }
  get audioElement() { return this._audio.element; }

  get lid() { return this.getAttribute("lid") || "none"; }
  set lid(v) { if (v === "none" || v == null) this.removeAttribute("lid"); else this.setAttribute("lid", v === "closed" ? "closed" : "open"); }

  get labels() { return { ...this._labels }; }
  set labels(value) {
    this._labels = { ...DEFAULT_LABELS, ...(value || {}) };
    if (this._built) this._applyLabels();
  }

  /**
   * Put a record on the platter. Accepts a File/Blob, a record from
   * createRecord(), or a plain { src, title, artist, cover } object.
   */
  async load(input, { autoplay = this.hasAttribute("autoplay") } = {}) {
    await this._ready;
    if (!input) return this.unload();
    const token = ++this._loadToken;
    let record;
    try {
      if (input instanceof Blob || !input.id) {
        record = await createRecord(input);
        this._owned.add(record);
      } else record = input;
    } catch (error) {
      this._emit("error", { error });
      return null;
    }
    if (token !== this._loadToken) { this._releaseOwned(record); return null; }
    await this._clearPlatter(token);
    if (token !== this._loadToken) { this._releaseOwned(record); return null; }

    this._core.setRecord(record);
    this._resumeAt = null;
    this._audio.load(record.src);
    this._recordGroup.removeAttribute("data-empty");
    this._vinyl.replaceChildren();
    this._renderRecordArt(record);
    await this._animateRecord("in");
    if (token !== this._loadToken) return record;
    if (autoplay) this.play();
    return record;
  }

  /** Lift the record off the platter. */
  async unload() {
    await this._ready;
    const token = ++this._loadToken;
    await this._clearPlatter(token);
  }

  async play() {
    await this._ready;
    this._audio.unlock();
    const snap = this._core.snapshot();
    if (!snap.record) {
      this._emit("blocked", { reason: "empty" });
      return false;
    }
    if (this.lid === "closed") this.lid = "open";
    this._powerOffAtRest = false;
    this._core.setPower(true);
    const mode = snap.arm.mode;
    const geo = this._core.geometry;
    if (mode === "tracking" || mode === "lowering") { /* already there */ }
    else if (mode === "hover" && geo.overRecord(snap.arm.angle)) this._core.lower();
    else if (mode === "runout") this._core.cueTo(0);
    else if (mode !== "held") this._core.cueTo(this._resumeAt != null && this._resumeAt < 0.98 ? this._resumeAt : 0);
    this._resumeAt = null;
    this._wake();
    return true;
  }

  /** Lift the needle; the platter keeps turning (like a cue lever). */
  pause() {
    const ok = this._core.lift();
    this._wake();
    return ok;
  }

  /** Lift the arm, bring it home and switch the motor off. */
  stop() {
    this._resumeAt = null;
    const mode = this._core.snapshot().arm.mode;
    if (mode === "rest") this._core.setPower(false);
    else { this._powerOffAtRest = true; this._core.returnHome(); }
    this._wake();
  }

  toggle() { return this.playing || this.state === "cueing" ? this.pause() : this.play(); }

  /**
   * Move to a point in the song. By default the arm lifts, swings and drops
   * like a person would; { instant: true } jumps without the choreography.
   */
  seek(value, { unit = "progress", instant = false } = {}) {
    const dur = this.duration;
    const p = clamp(unit === "seconds" ? (dur ? value / dur : 0) : value, 0, 1);
    if (!this.record) return false;
    if (instant && this._core.snapshot().arm.mode === "tracking") {
      this._audio.seekProgress(p);
      this._core.setProgress(p);
      this._seekGuard = { p, until: performance.now() + 600 };
    } else {
      this._audio.unlock();
      this._core.setPower(true);
      this._core.cueTo(p);
    }
    this._wake();
    return true;
  }

  /** Read files into records without loading them (fires "import"). */
  async importFiles(files) {
    const records = await createRecords(files);
    if (records.length) this._emit("import", { records });
    return records;
  }

  /* ---------------------------------------------------------------- build */

  _layout() {
    const P = createProjector(CAMERA);
    const pts = [];
    const zTop = 44, zBottom = GROUND_Z;
    for (const x of [0, DECK.width]) for (const y of [0, DECK.height]) for (const z of [zTop, zBottom]) pts.push(P.proj(x, y, z));
    if (this.lid !== "none") for (const p of this._lidCorners(PARTS.lid.open)) pts.push(P.proj(...p));
    const pad = 22;
    const minX = Math.min(...pts.map((p) => p.x)) - pad;
    const maxX = Math.max(...pts.map((p) => p.x)) + pad;
    const minY = Math.min(...pts.map((p) => p.y)) - pad;
    const maxY = Math.max(...pts.map((p) => p.y)) + pad + 10;
    P.origin.x = -minX;
    P.origin.y = -minY;
    this._P = P;
    this._W = Math.ceil(maxX - minX);
    this._H = Math.ceil(maxY - minY);
  }

  _build() {
    this._layout();
    const P = this._P;
    const d = DECK;
    const pc = d.platter;
    const pv = d.pivot;
    const label = this.getAttribute("label") ?? "TRINKET";
    this.style.setProperty("--_grain", `url("${woodGrainUrl()}")`);

    const plane = (cls, o, u, v, w, h, inner = "", attrs = "") =>
      `<div class="tt-plane ${cls}" style="width:${w}px;height:${h}px;transform:${P.plane(o, u, v)}" ${attrs}>${inner}</div>`;
    const flatAt = (cls, x, y, z, w, h, inner = "", attrs = "") => plane(cls, [x, y, z], [1, 0, 0], [0, 1, 0], w, h, inner, attrs);
    const cyl = (o) => cylinderSvg(P, o);

    const zGround = GROUND_Z;
    const { bevel: B, body: BH, base: BB, baseInset: bi } = PLINTH;
    const W = d.width, H = d.height, s2 = Math.SQRT1_2;
    const zWall = -B, zBase = -(B + BH);
    const sides = [
      { key: "back", n: [0, -1, 0], len: W, base: [[bi, bi, zBase], [1, 0, 0]], wall: [[0, 0, zWall], [1, 0, 0]], bevel: [[0, B, 0], [1, 0, 0], [0, -s2, -s2]] },
      { key: "left", n: [-1, 0, 0], len: H, base: [[bi, bi, zBase], [0, 1, 0]], wall: [[0, 0, zWall], [0, 1, 0]], bevel: [[B, 0, 0], [0, 1, 0], [-s2, 0, -s2]] },
      { key: "right", n: [1, 0, 0], len: H, base: [[W - bi, bi, zBase], [0, 1, 0]], wall: [[W, 0, zWall], [0, 1, 0]], bevel: [[W - B, 0, 0], [0, 1, 0], [s2, 0, -s2]] },
      { key: "front", n: [0, 1, 0], len: W, base: [[bi, H - bi, zBase], [1, 0, 0]], wall: [[0, H, zWall], [1, 0, 0]], bevel: [[0, H - B, 0], [1, 0, 0], [0, s2, -s2]] },
    ];
    const bevelClip = (len) => `clip-path:polygon(${B}px 0, ${len - B}px 0, 100% 100%, 0 100%)`;
    const baseFaces = [], walls = [], bevels = [];
    for (const sd of sides) {
      if (P.facing(sd.n)) {
        baseFaces.push(plane(`tt-base tt-base-${sd.key}`, sd.base[0], sd.base[1], [0, 0, -1], sd.len - 2 * bi, BB));
        walls.push(plane(`tt-wood tt-face tt-${sd.key}`, sd.wall[0], sd.wall[1], [0, 0, -1], sd.len, BH,
          sd.key === "front" ? `<div class="tt-nameplate" part="nameplate">${esc(label)}</div>` : ""));
      }
      if (P.facing([sd.n[0], sd.n[1], 1])) {
        bevels.push(plane(`tt-wood tt-bevel tt-bevel-${sd.key}`, sd.bevel[0], sd.bevel[1], sd.bevel[2], sd.len, B * Math.SQRT2).replace('style="', `style="${bevelClip(sd.len)};`));
      }
    }

    const restA = rad(d.restAngle - 1.6);
    const rest = { x: pv.x + Math.cos(restA) * PARTS.rest.dist, y: pv.y + Math.sin(restA) * PARTS.rest.dist };
    const skate = { x: pv.x + 26, y: pv.y - 27 };
    const pw = PARTS.power, sp = PARTS.speed, cue = PARTS.cue, led = PARTS.led;
    const knob = (k, cls, label) =>
      cyl({ cx: k.x, cy: k.y, r: k.r, z0: 0, z1: k.h, side: METAL_SIDE }) +
      flatAt(`tt-knob ${cls}`, k.x - k.r, k.y - k.r, k.h, k.r * 2, k.r * 2,
        `<div class="tt-knob-face"></div><div class="tt-knob-ind"></div><button class="tt-hit tt-hit-round" style="inset:-12px" data-hit="${cls}" aria-label="${esc(label)}"></button>`);

    this._stage = document.createElement("div");
    this._stage.className = "tt-stage";
    this._stage.setAttribute("part", "stage");
    this._stage.style.aspectRatio = `${this._W} / ${this._H}`;
    this._stage.innerHTML = `
<div class="tt-scene" style="width:${this._W}px;height:${this._H}px">
  ${flatAt("tt-ground", 18, 26, zGround, d.width, d.height)}
  ${flatAt("tt-ground tt-contact", 4, 6, zGround, d.width, d.height)}
  <div class="tt-slot" data-slot="lid-back"></div>
  ${baseFaces.join("")}
  ${walls.join("")}
  ${bevels.join("")}
  ${flatAt("tt-wood tt-top", 0, 0, 0, d.width, d.height, topDetailsSvg(d, { label }))}

  ${cyl({ cx: pc.cx, cy: pc.cy, r: pc.r, z0: 0, z1: Z.platter, side: METAL_SIDE })}
  ${flatAt("tt-platter", pc.cx - pc.r, pc.cy - pc.r, Z.platter, pc.r * 2, pc.r * 2,
    `<div class="tt-rim"></div><div class="tt-rot" data-rot="platter"><div class="tt-strobe"></div><div class="tt-mat"></div></div><div class="tt-mat-sheen"></div>
     <button class="tt-hit tt-hit-round" style="inset:0" data-hit="platter"></button>`)}
  ${cyl({ cx: pc.cx, cy: pc.cy, r: 3.8, z0: Z.platter, z1: Z.record + 5, side: METAL_SIDE, top: "var(--_metal-hi)" })}

  <div class="tt-record-group" data-empty>
    ${cyl({ cx: pc.cx, cy: pc.cy, r: d.record.r, z0: Z.mat + 0.2, z1: Z.record, side: [[0, "#0b0b0c"], [0.3, "#2c2c2e"], [0.5, "#161618"], [1, "#050505"]] })}
    ${flatAt("tt-record", pc.cx - d.record.r, pc.cy - d.record.r, Z.record, d.record.r * 2, d.record.r * 2,
      `<div class="tt-vinyl" data-rot="record"></div><div class="tt-sheen"></div><div class="tt-gloss"></div>
       <button class="tt-hit tt-hit-round" style="inset:0" data-hit="record"></button>`)}
  </div>
  <div class="tt-spindle-top">${cyl({ cx: pc.cx, cy: pc.cy, r: 3.6, z0: Z.record, z1: Z.record + 5, side: METAL_SIDE, top: "var(--_metal-hi)" })}</div>

  ${cyl({ cx: pv.x, cy: pv.y, r: PARTS.towerBase.r, z0: 0, z1: 4, side: BLACK_METAL_SIDE, top: "#2e2b28", topStroke: "rgba(255,255,255,.25)" })}
  ${cyl({ cx: pv.x, cy: pv.y, r: PARTS.towerBase.r - 7, z0: 4, z1: 5, side: METAL_SIDE, top: "var(--_metal-mid)", topStroke: "rgba(255,255,255,.55)" })}
  ${cyl({ cx: skate.x, cy: skate.y, r: 6, z0: 3, z1: 9, side: BLACK_METAL_SIDE, top: "#3b3936" })}
  ${cyl({ cx: pv.x, cy: pv.y, r: PARTS.tower.r, z0: 3, z1: Z.tower, side: BLACK_METAL_SIDE })}
  ${cyl({ cx: pv.x, cy: pv.y, r: PARTS.tower.r + 3, z0: Z.tower - 2, z1: Z.tower, side: METAL_SIDE, top: "var(--_metal-mid)" })}

  ${cyl({ cx: rest.x, cy: rest.y, r: 10, z0: 0, z1: 2, side: METAL_SIDE, top: "var(--_metal)" })}
  ${cyl({ cx: rest.x, cy: rest.y, r: 4.2, z0: 2, z1: Z.arm - 5, side: METAL_SIDE })}
  ${cyl({ cx: rest.x, cy: rest.y, r: 7, z0: Z.arm - 6, z1: Z.arm - 4, side: BLACK_METAL_SIDE, top: "#2c2a28" })}

  ${cyl({ cx: cue.x, cy: cue.y + 8, r: 6, z0: 0, z1: cue.h, side: BLACK_METAL_SIDE, top: "#3a3836" })}
  ${flatAt("tt-cue", cue.x, cue.y + 8, cue.h, 0, 0,
    `<div class="tt-cue-lever"></div><button class="tt-hit" style="left:-14px;top:-30px;width:28px;height:44px;border-radius:6px" data-hit="cue" aria-label="${esc(this._labels.cue)}"></button>`)}

  ${flatAt("tt-led", led.x - 4.5, led.y - 4.5, 0.3, 9, 9)}
  ${knob(pw, "power", this._labels.power)}
  ${knob(sp, "speed", this._labels.speed)}

  <div class="tt-plane tt-arm-shadow" data-layer="arm-shadow"><div class="tt-arm-rot" style="left:${pv.x}px;top:${pv.y}px">${armSvg(d.armLength, { shadow: true })}</div></div>
  <svg class="tt-abs" data-layer="cartridge" style="width:${this._W}px;height:${this._H}px" viewBox="0 0 ${this._W} ${this._H}" aria-hidden="true"></svg>
  <div class="tt-plane tt-arm" data-layer="arm"><div class="tt-arm-rot" style="left:${pv.x}px;top:${pv.y}px">${armSvg(d.armLength)}
    <button class="tt-hit tt-hit-arm" data-hit="arm" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="${esc(this._labels.arm)}"
      style="left:-90px;top:-22px;width:${d.armLength + 106}px;height:44px"></button></div></div>
  <div class="tt-slot" data-slot="lid-front"></div>
</div>
<div class="tt-drop" part="drop"><span>${esc(this._labels.drop)}</span></div>
<p class="tt-sr" aria-live="polite"></p>`;
    this.shadowRoot.append(this._stage);

    const $ = (s) => this._stage.querySelector(s);
    this._scene = $(".tt-scene");
    this._top = $(".tt-top");
    this._nameplate = $(".tt-nameplate") || document.createElement("div");
    this._platterRot = $('[data-rot="platter"]');
    this._recordGroup = $(".tt-record-group");
    this._vinyl = $('[data-rot="record"]');
    this._spindleTop = $(".tt-spindle-top");
    this._armLayer = $('[data-layer="arm"]');
    this._armRot = this._armLayer.firstElementChild;
    this._shadowLayer = $('[data-layer="arm-shadow"]');
    this._shadowRot = this._shadowLayer.firstElementChild;
    this._cartridge = $('[data-layer="cartridge"]');
    this._powerInd = $(".power .tt-knob-ind");
    this._speedInd = $(".speed .tt-knob-ind");
    this._live = $(".tt-sr");
    this._hits = {};
    for (const b of this._stage.querySelectorAll("[data-hit]")) this._hits[b.dataset.hit] = b;
    this._lidSlots = { back: $('[data-slot="lid-back"]'), front: $('[data-slot="lid-front"]') };

    this._bindInput();
    this._buildLid();
    this._applyLabels();
    this._syncKnobs();
  }

  _rebuild() {
    const snapRecord = this._core.snapshot().record;
    const vinylCanvas = this._vinyl?.firstElementChild;
    this._stage.remove();
    this._resize?.disconnect();
    this._lidAngle = null;
    this._build();
    if (snapRecord) {
      this._recordGroup.removeAttribute("data-empty");
      if (vinylCanvas) this._vinyl.append(vinylCanvas);
    }
    if (this.isConnected) {
      this._resize = new ResizeObserver(() => this._measure());
      this._resize.observe(this._stage);
      this._measure();
    }
    this._render(true);
  }

  _applyLabels() {
    const L = this._labels;
    this._hits.arm?.setAttribute("aria-label", L.arm);
    this._hits.record?.setAttribute("aria-label", L.record);
    this._hits.platter?.setAttribute("aria-label", L.platter);
    this._hits.power?.setAttribute("aria-label", L.power);
    this._hits.speed?.setAttribute("aria-label", L.speed);
    this._hits.cue?.setAttribute("aria-label", L.cue);
    const drop = this._stage.querySelector(".tt-drop span");
    if (drop) drop.textContent = L.drop;
    for (const f of this._lidFaces || []) f.el.setAttribute("aria-label", L.lid);
  }

  _measure() {
    const w = this._stage.getBoundingClientRect().width || this._W;
    this._k = w / this._W;
    this.style.setProperty("--_k", String(this._k));
  }

  _textureSize() {
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    const px = d => Math.ceil(d / 128) * 128;
    return clamp(px(300 * (this._k || 1) * dpr * 1.1), 512, 1280);
  }

  /* --------------------------------------------------------------- input */

  _bindInput() {
    const h = this._hits;
    const unlock = () => this._audio.unlock();
    this._stage.addEventListener("pointerdown", unlock, { capture: true });

    h.power.addEventListener("click", () => { this._audio.click(true); this._core.setPower(!this.power); this._wake(); });
    h.speed.addEventListener("click", () => { this._audio.click(); this.speed = this.speed === 33 ? 45 : 33; });
    h.cue.addEventListener("click", () => this._tapCue());
    h.record.addEventListener("click", () => this.toggle());
    h.platter.addEventListener("click", () => this._emit("blocked", { reason: "empty" }));

    const arm = h.arm;
    arm.addEventListener("pointerdown", (e) => this._armDown(e));
    arm.addEventListener("pointermove", (e) => this._armMove(e));
    arm.addEventListener("pointerup", (e) => this._armUp(e));
    arm.addEventListener("pointercancel", (e) => this._armUp(e, true));
    arm.addEventListener("lostpointercapture", (e) => { if (this._armDrag?.id === e.pointerId) this._armUp(e, true); });
    arm.addEventListener("keydown", (e) => this._armKey(e));
    arm.addEventListener("click", (e) => { if (e.detail === 0) this._tapArm(); }); // keyboard activation
  }

  _armAngleAt(e) {
    const z = Z.arm + this._core.snapshot().arm.height * Z.armLift;
    const r = this._stage.getBoundingClientRect();
    const k = r.width / this._W;
    const p = this._P.unproject((e.clientX - r.left) / k, (e.clientY - r.top) / k, z);
    return deg(Math.atan2(p.y - DECK.pivot.y, p.x - DECK.pivot.x));
  }

  _armDown(e) {
    if (e.button > 0) return;
    e.preventDefault();
    this._hits.arm.setPointerCapture?.(e.pointerId);
    this._armDrag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      pointer: this._armAngleAt(e),
      arm: this._core.snapshot().arm.angle,
      moved: false,
    };
  }

  _armMove(e) {
    const g = this._armDrag;
    if (!g || g.id !== e.pointerId) return;
    if (!g.moved) {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 6) return;
      g.moved = true;
      this._resumeAt = null;
      this._core.grab();
    }
    const delta = wrap180(this._armAngleAt(e) - g.pointer);
    this._core.drag(g.arm + delta);
    this._wake();
  }

  _armUp(e, cancelled = false) {
    const g = this._armDrag;
    if (!g || g.id !== e.pointerId) return;
    this._armDrag = null;
    if (g.moved) {
      const result = this._core.release();
      if (result === "lower" && !this.power) {
        // needle down on a still record: it plays once the motor turns
      }
    } else if (!cancelled) this._tapArm();
    this._wake();
  }

  _tapArm() {
    const mode = this._core.snapshot().arm.mode;
    if (mode === "tracking" || mode === "lowering") this.pause();
    else if (mode === "runout") this.stop();
    else this.play();
  }

  _armKey(e) {
    const step = e.shiftKey ? 0.1 : 0.03;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { this.seek(this.progress + step, { instant: true }); e.preventDefault(); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { this.seek(this.progress - step, { instant: true }); e.preventDefault(); }
    else if (e.key === "Home") { this.seek(0); e.preventDefault(); }
    else if (e.key === "Escape") { this.stop(); e.preventDefault(); }
  }

  _tapCue() {
    this._audio.click();
    const s = this._core.snapshot();
    const m = s.arm.mode;
    if (m === "tracking" || m === "runout" || m === "lowering") this._core.lift();
    else if (m === "hover" && s.record && this._core.geometry.overRecord(s.arm.angle)) { this._core.setPower(true); this._core.lower(); }
    else this._emit("blocked", { reason: "cue" });
    this._wake();
  }

  _bindDrop(on) {
    const fn = on ? "addEventListener" : "removeEventListener";
    if (on && !this._dropHandlers) {
      const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
      this._dropHandlers = {
        dragenter: (e) => { if (this.getAttribute("drop") === "off" || !hasFiles(e)) return; e.preventDefault(); this._dragDepth++; this.dataset.dropping = ""; },
        dragover: (e) => { if (this.getAttribute("drop") === "off" || !hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; },
        dragleave: () => { if (--this._dragDepth <= 0) { this._dragDepth = 0; delete this.dataset.dropping; } },
        drop: async (e) => {
          if (this.getAttribute("drop") === "off" || !hasFiles(e)) return;
          e.preventDefault();
          this._dragDepth = 0;
          delete this.dataset.dropping;
          const records = await createRecords(e.dataTransfer.files);
          if (!records.length) { this._emit("blocked", { reason: "not-audio" }); return; }
          const ev = this._emit("import", { records, source: "drop" }, true);
          if (!ev.defaultPrevented) this.load(records[0], { autoplay: true });
        },
      };
    }
    if (this._dropHandlers) for (const [type, h] of Object.entries(this._dropHandlers)) this[fn](type, h);
  }

  /* ---------------------------------------------------------------- lid */

  _lidCorners(angle) {
    const L = PARTS.lid;
    const x0 = L.inset, x1 = DECK.width - L.inset, y0 = L.inset, y1 = DECK.height - L.inset;
    const zb = 1.5, zt = zb + L.height;
    const out = [];
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [zb, zt]) out.push(this._lidRotate([x, y, z], angle, y0));
    return out;
  }

  _lidRotate([x, y, z], angle, y0 = PARTS.lid.inset, isVector = false) {
    const a = rad(angle), c = Math.cos(a), s = Math.sin(a);
    const hz = PARTS.lid.hingeZ;
    if (isVector) return [x, y * c - z * s, y * s + z * c];
    const dy = y - y0, dz = z - hz;
    return [x, y0 + dy * c - dz * s, hz + dy * s + dz * c];
  }

  _buildLid() {
    for (const s of Object.values(this._lidSlots)) s.replaceChildren();
    this._lidFaces = [];
    if (this.lid === "none") return;
    const L = PARTS.lid;
    const w = DECK.width - 2 * L.inset, dpt = DECK.height - 2 * L.inset;
    const x0 = L.inset, y0 = L.inset, x1 = x0 + w, y1 = y0 + dpt, zt = 1.5 + L.height;
    const specs = [
      { key: "back", o: [x0, y0, zt], u: [1, 0, 0], v: [0, 0, -1], w, h: L.height, skirt: true },
      { key: "left", o: [x0, y0, zt], u: [0, 1, 0], v: [0, 0, -1], w: dpt, h: L.height, skirt: true },
      { key: "right", o: [x1, y0, zt], u: [0, 1, 0], v: [0, 0, -1], w: dpt, h: L.height, skirt: true },
      { key: "front", o: [x0, y1, zt], u: [1, 0, 0], v: [0, 0, -1], w, h: L.height, skirt: true },
      { key: "top", o: [x0, y0, zt], u: [1, 0, 0], v: [0, 1, 0], w, h: dpt },
    ];
    this._lidGroup = document.createElement("div");
    this._lidGroup.className = "tt-slot";
    for (const spec of specs) {
      const el = document.createElement("div");
      el.className = `tt-plane tt-lid-face tt-lid-${spec.key}` + (spec.skirt ? " tt-lid-skirt" : "");
      if (spec.key === "back") el.innerHTML = `<span class="tt-lid-hinge" style="left:70px"></span><span class="tt-lid-hinge" style="right:70px"></span>`;
      el.style.width = spec.w + "px";
      el.style.height = spec.h + "px";
      el.setAttribute("role", "button");
      el.tabIndex = spec.key === "top" ? 0 : -1;
      el.setAttribute("aria-label", this._labels.lid);
      el.addEventListener("click", () => { this._audio.click(); this.lid = this.lid === "closed" ? "open" : "closed"; this._emit("lid", { lid: this.lid }); });
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } });
      this._lidGroup.append(el);
      this._lidFaces.push({ ...spec, el });
    }
    this._lidAngle = this.lid === "closed" ? L.closed : L.open;
    this._placeLid();
  }

  _placeLid() {
    if (!this._lidFaces?.length) return;
    const P = this._P;
    const a = this._lidAngle;
    const order = this._lidFaces.map((f) => {
      const o = this._lidRotate(f.o, a);
      const u = this._lidRotate(f.u, a, 0, true), v = this._lidRotate(f.v, a, 0, true);
      f.el.style.transform = P.plane(o, u, v);
      const c = [o[0] + u[0] * f.w / 2 + v[0] * f.h / 2, o[1] + u[1] * f.w / 2 + v[1] * f.h / 2, o[2] + u[2] * f.w / 2 + v[2] * f.h / 2];
      return { f, depth: P.depth(...c) };
    }).sort((p, q) => p.depth - q.depth);
    order.forEach(({ f }, i) => { f.el.style.zIndex = String(i + 1); });
    const slot = a > 80 ? this._lidSlots.back : this._lidSlots.front;
    if (this._lidGroup.parentNode !== slot) slot.append(this._lidGroup);
  }

  /* --------------------------------------------------------- record art */

  async _renderRecordArt(record) {
    const img = record.cover ? await loadImage(record.coverBlob || record.cover) : null;
    if (this.record !== record) return;
    const draw = () => {
      const canvas = renderRecord(record, { size: this._textureSize(), image: img });
      canvas.setAttribute("aria-hidden", "true");
      this._vinyl.replaceChildren(canvas);
    };
    draw();
    if (!record.envelope && this.getAttribute("grooves") !== "plain") {
      const env = await analyzeEnvelope(record);
      if (env && this.record === record) {
        record.envelope = env;
        draw();
      }
    }
  }

  _animateRecord(dir) {
    const g = this._recordGroup;
    const lift = 120 * this._P.sinTilt;
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this._spindleTop.hidden = true;
    this._anims++;
    const frames = dir === "in"
      ? [
          { transform: `translateY(${-lift}px)`, opacity: 0, easing: "cubic-bezier(.5,0,.9,.5)" },
          { opacity: 1, offset: 0.3 },
          { transform: "translateY(0)", offset: 0.72, easing: "ease-out" },
          { transform: `translateY(${-lift * 0.04}px)`, offset: 0.85, easing: "ease-in" },
          { transform: "translateY(0)", opacity: 1 },
        ]
      : [
          { transform: "translateY(0)", opacity: 1, easing: "cubic-bezier(.3,0,.4,1)" },
          { transform: `translateY(${-lift}px)`, opacity: 0 },
        ];
    const anim = g.animate(frames, { duration: reduced ? 1 : dir === "in" ? 720 : 480, fill: "forwards" });
    if (dir === "in" && !reduced) setTimeout(() => this._audio.plop(), 500);
    return anim.finished.catch(() => {}).then(() => {
      anim.cancel();
      this._anims--;
      if (dir === "out") g.setAttribute("data-empty", "");
      this._spindleTop.hidden = g.hasAttribute("data-empty");
    });
  }

  async _clearPlatter(token) {
    const core = this._core;
    if (!core.armClear()) {
      this._audio.setActive(false);
      core.returnHome();
      this._wake();
      await this._until(() => core.armClear(), 5000);
      if (token !== this._loadToken) return;
    }
    const old = core.snapshot().record;
    if (!old) return;
    this._audio.unload();
    await this._animateRecord("out");
    core.setRecord(null);
    this._vinyl.replaceChildren();
    this._releaseOwned(old);
  }

  _until(test, timeout = 4000) {
    if (test()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const w = { test, resolve, until: performance.now() + timeout };
      this._waiters.push(w);
      this._wake();
    });
  }

  /* ---------------------------------------------------------- core / audio */

  _onCore(event, snap, detail) {
    switch (event) {
      case "power":
        this.toggleAttribute("data-power", detail.on);
        this._audio.motor(detail.on);
        this._syncKnobs();
        this._emit("power", { on: detail.on });
        break;
      case "speed":
        this._syncKnobs();
        this._emit("speed", { speed: detail.speed });
        break;
      case "arm":
        this.dataset.arm = detail.mode;
        break;
      case "lift":
        this._audio.lift();
        this._audio.setActive(false);
        this._resumeAt = snap.arm.mode === "runout" || detail.progress >= 0.98 ? null : detail.progress;
        break;
      case "cue":
        this._emit("cue", { progress: detail.progress });
        break;
      case "needledown":
        this._audio.seekProgress(detail.progress);
        this._seekGuard = { p: detail.progress, until: performance.now() + 700 };
        this._audio.needleDrop();
        this._emit("needledown", { progress: detail.progress });
        break;
      case "rest":
        this._resumeAt = null;
        this._audio.seek(0);
        this._emit("timeupdate", { currentTime: 0, duration: this._audio.duration, progress: 0 });
        this._audio.clack();
        if (this._powerOffAtRest) { this._powerOffAtRest = false; this._core.setPower(false); }
        this._emit("rest");
        break;
      case "ended":
        this._emit("ended", { record: snap.record });
        break;
      case "load":
        this._emit("load", { record: detail.record });
        this._announce(detail.record);
        break;
      case "unload":
        this._emit("unload");
        break;
    }
    this._wake();
  }

  _onAudio(type, detail) {
    if (type === "ended") this._core.ended();
    else if (type === "duration") {
      const r = this.record;
      if (r) r.duration = detail.duration;
      this._emit("durationchange", { duration: detail.duration });
    } else if (type === "blocked") this._emit("blocked", detail);
    else if (type === "error") this._emit("error", detail);
    this._wake();
  }

  _announce(record) {
    if (!record || !this._live) return;
    this._live.textContent = [record.title, record.artist].filter(Boolean).join(" — ");
  }

  _syncKnobs() {
    const s = this._core.snapshot();
    if (this._powerInd) this._powerInd.style.transform = `rotate(${s.power ? 220 : 140}deg)`;
    if (this._speedInd) this._speedInd.style.transform = `rotate(${s.speed === 45 ? 90 : -90}deg)`;
    this._hits.power?.setAttribute("aria-pressed", String(s.power));
    this._hits.speed?.setAttribute("aria-valuetext", s.speed === 45 ? "45 rpm" : "33 rpm");
  }

  /* ---------------------------------------------------------------- loop */

  _wake() {
    if (this._raf || !this.isConnected) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  _tick(now) {
    this._raf = 0;
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    const core = this._core;
    const prevAngle = core.snapshot().platterAngle;
    const snap = core.step(dt);

    // --- audio follows the platter
    const tracking = snap.arm.mode === "tracking" && snap.arm.height === 0 && !!snap.record;
    this._audio.setActive(tracking);
    this._audio.setRate(snap.rate);
    if (tracking) {
      const dur = this._audio.duration;
      if (dur > 0) {
        const p = this._audio.currentTime / dur;
        const guard = this._seekGuard;
        if (!guard || Math.abs(p - guard.p) < 0.01 || now > guard.until) {
          this._seekGuard = null;
          core.setProgress(p);
        }
      }
      if (now - this._lastTime > 250) {
        this._lastTime = now;
        this._emit("timeupdate", { currentTime: this._audio.currentTime, duration: dur, progress: snap.progress });
        this._hits.arm.setAttribute("aria-valuenow", String(Math.round(snap.progress * 100)));
      }
    }
    if (snap.arm.mode === "runout" && snap.omega > 0.1 && snap.platterAngle < prevAngle) this._audio.runoutTick();

    // --- state events
    const state = core.state;
    if (state !== this._lastState) {
      const prev = this._lastState;
      this._lastState = state;
      this.setAttribute("state", state);
      this._emit("statechange", { state, prev });
      if (state === "playing") this._emit("play", { record: snap.record });
      else if (prev === "playing" && state !== "ended") this._emit("pause", { reason: state });
    }

    // --- lid
    if (this._lidFaces?.length) {
      const target = this.lid === "closed" ? PARTS.lid.closed : PARTS.lid.open;
      if (Math.abs(this._lidAngle - target) > 0.05 || Math.abs(this._lidVel) > 0.05) {
        const k = 60, damp = 2 * Math.sqrt(k) * 0.82;
        this._lidVel += ((target - this._lidAngle) * k - this._lidVel * damp) * dt;
        this._lidAngle += this._lidVel * dt;
        if (this._lidAngle < -0.5) { this._lidAngle = -0.5; this._lidVel = Math.abs(this._lidVel) * 0.2; }
        this._placeLid();
        this._lidMoving = true;
      } else if (this._lidMoving) {
        this._lidAngle = target;
        this._lidVel = 0;
        this._placeLid();
        this._lidMoving = false;
      }
    }

    this._render();

    // --- waiters
    if (this._waiters.length) {
      this._waiters = this._waiters.filter((w) => {
        if (w.test() || now > w.until) { w.resolve(w.test()); return false; }
        return true;
      });
    }

    const busy = !core.idle() || this._audio.playing || this._lidMoving || this._waiters.length || this._anims > 0 || this._armDrag;
    if (busy) this._wake();
  }

  _render(force = false) {
    const s = this._core.snapshot();
    const P = this._P;
    const rot = `rotate(${s.platterAngle.toFixed(2)}deg)`;
    this._platterRot.style.transform = rot;
    this._vinyl.style.transform = rot;

    const arm = s.arm;
    const armZ = Z.arm + arm.height * Z.armLift;
    const key = arm.angle.toFixed(3) + "|" + armZ.toFixed(2);
    if (force || key !== this._armRenderKey) {
      this._armRenderKey = key;
      this._armLayer.style.transform = P.flat(armZ);
      this._armRot.style.transform = `rotate(${arm.angle.toFixed(3)}deg)`;
      // shadow falls on the record, the platter or the wood
      const r = stylusRadius(arm.angle);
      const target = s.record && r < DECK.record.r ? Z.record : r < DECK.platter.r ? Z.platter : 0;
      this._surfZ += (target - this._surfZ) * (force ? 1 : 0.35);
      const h = Math.max(1, armZ - this._surfZ);
      this._shadowLayer.style.transform = P.flat(this._surfZ + 0.2);
      this._shadowRot.style.transform = `translate(${(h * 0.42).toFixed(2)}px, ${(h * 0.5).toFixed(2)}px) rotate(${arm.angle.toFixed(3)}deg)`;
      this._shadowLayer.style.setProperty("--_sb", (1.2 + h * 0.12).toFixed(2) + "px");
      this._shadowLayer.style.setProperty("--_so", (0.42 - h * 0.006).toFixed(3));
      this._cartridge.innerHTML = cartridgeSvgInner(P, DECK, arm.angle, armZ - 3.2);
      this.toggleAttribute("data-lifted", arm.height > 0.5);
    }
  }

  _emit(type, detail = {}, cancelable = false) {
    const ev = new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable });
    this.dispatchEvent(ev);
    return ev;
  }
}

if (!customElements.get("trinket-turntable")) customElements.define("trinket-turntable", TrinketTurntable);
