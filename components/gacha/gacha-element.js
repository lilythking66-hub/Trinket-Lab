import { createGacha, knobStep, detentFeel, mulberry32, normalizePrize, availablePrizes, remainingStock } from "./gacha-core.js";
import { createGlobeSim } from "./capsule-physics.js";
import { drawCapsule, capsuleTones, capsuleSvg, isImageThumb, onThumbLoad } from "./capsule-art.js";
import { GEOM, backSvg, frontSvg, flapSvg, knobRotorSvg, knobGlossSvg, coinSvg } from "./machine-art.js";
import { sounds } from "./sound.js";
import { GACHA_CSS } from "./style.js";

export const DEFAULT_CAPSULE_COLORS = ["#e2574c", "#f2c14e", "#4f86c6", "#f19bb2", "#62c0a0", "#f1ece2", "#9b7fd1"];

/** Neutral out-of-the-box prizes. Real content always comes from the host. */
export const DEFAULT_PRIZES = [
  { id: "capsule-1", color: "#e2574c", title: "Capsule No. 1", description: "Replace me with your own prize." },
  { id: "capsule-2", color: "#f2c14e", title: "Capsule No. 2", description: "Replace me with your own prize." },
  { id: "capsule-3", color: "#4f86c6", title: "Capsule No. 3", description: "Replace me with your own prize." },
  { id: "capsule-4", color: "#f19bb2", title: "Capsule No. 4", description: "Replace me with your own prize." },
];

const DEFAULT_LABELS = {
  knob: "Turn the knob",
  coin: "Insert a coin",
  tray: "Take the capsule",
  capsule: "Open the capsule",
  keep: "Keep",
  dialog: "Your capsule",
  hintIdle: "Grab the knob and turn it clockwise",
  hintLocked: "Insert a coin first",
  hintBusy: "One capsule at a time",
  hintEmpty: "Sold out",
  hintTake: "Tap the capsule to take it out",
  hintOpen: "Pull the halves apart — or tap",
  hintRevealed: "",
};

const pctX = (v) => (v / GEOM.width) * 100 + "%";
const pctY = (v) => (v / GEOM.height) * 100 + "%";
const place = (el, x, y, w, h) => {
  el.style.left = pctX(x);
  el.style.top = pctY(y);
  el.style.width = pctX(w);
  el.style.height = pctY(h);
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const DETENT = 90;
const SVG_SPAN = 112 / 92; // capsule svg viewBox / capsule diameter
let uidCounter = 0;

export class TrinketGacha extends HTMLElement {
  static get observedAttributes() {
    return ["require-coin", "label", "price", "capsules", "turns", "seed"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = GACHA_CSS;
    this.shadowRoot.append(style);

    this._labels = { ...DEFAULT_LABELS };
    this._explicitPrizes = null;
    this.renderPrize = null;
    this.resolvePrize = null;

    this._raf = 0;
    this._last = 0;
    this._turn = 0;
    this._knobBase = 0;
    this._knobAngle = 0;
    this._knobVel = 0;
    this._auto = null;
    this._drag = null;
    this._sinking = [];
    this._forced = undefined;
    this._needsDraw = true;
    this._timers = new Set();
    this._anims = new Set();

    let resolve;
    this._ready = new Promise((res) => { resolve = res; });
    this._resolveReady = resolve;
  }

  /* ---------------- lifecycle ---------------- */

  connectedCallback() {
    if (!this._built) {
      this._built = true;
      this._rng = this.hasAttribute("seed") ? mulberry32(Number(this.getAttribute("seed")) || 1) : Math.random;
      this._build();
      this._core = createGacha({
        prizes: this._sourcePrizes(),
        requireCoin: this.hasAttribute("require-coin"),
        rng: this._rng,
      });
      this._core.subscribe((event, snap, detail) => this._onCore(event, snap, detail));
      this._sim = createGlobeSim({
        cx: GEOM.globe.cx,
        cy: GEOM.globe.cy,
        radius: GEOM.globe.r - 4,
        floorY: GEOM.floorY,
        ceilingY: GEOM.lidY + 8,
        ballRadius: GEOM.capsuleR,
        rng: this._rng,
      });
      this._populate(false);
      this._templateObserver = new MutationObserver(() => {
        if (!this._explicitPrizes) this._applyPrizes(this._readTemplates() ?? DEFAULT_PRIZES);
      });
      this._reflect();
      this._resolveReady(this);
      queueMicrotask(() => this.dispatchEvent(new CustomEvent("ready", { bubbles: true, composed: true })));
    }
    this._templateObserver.observe(this, { childList: true });
    this._offThumb = onThumbLoad(() => { this._needsDraw = true; this._wake(); });
    this._resize = new ResizeObserver(() => this._sizeCanvas());
    this._resize.observe(this._stage);
    this._motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    this._sizeCanvas();
    this._wake();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._cancelAll();
    this._auto = null;
    this._drag = null;
    this._forced = undefined;
    this._wobble?.cancel();
    this._wobble = null;
    this._closeOverlay(true);
    this._trayCapsule?.classList.remove("show");
    this._flap?.classList.remove("open");
    if (this._core) {
      if (this._core.state === "turning") this._core.cancelTurn();
      else if (!["idle", "locked", "empty"].includes(this._core.state)) this._core.reset();
      this._knobBase += this._turn;
      this._turn = 0;
    }
    this._resize?.disconnect();
    this._templateObserver?.disconnect();
    this._offThumb?.();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this._built || oldValue === newValue) return;
    if (name === "require-coin") this._core.setRequireCoin(newValue !== null);
    if (name === "label" || name === "price") {
      const tpl = document.createElement("template");
      tpl.innerHTML = frontSvg(this._artOptions()).replace('class="tg-layer"', 'class="tg-layer tg-front"');
      const next = tpl.content.firstElementChild;
      this._front.replaceWith(next);
      this._front = next;
    }
    if (name === "capsules") this._syncBallCount(true);
  }

  /* ---------------- public API ---------------- */

  whenReady() { return this._ready; }

  get state() { return this._core?.state ?? "loading"; }
  get credits() { return this._core?.getState().credits ?? 0; }
  get prize() { return this._core?.getState().prize ?? null; }
  get history() { return this._core?.getState().history ?? []; }
  get remaining() { return this._core?.getState().remaining ?? 0; }

  get labels() { return { ...this._labels }; }
  set labels(value) {
    this._labels = { ...DEFAULT_LABELS, ...(value || {}) };
    if (this._built) this._applyLabels();
  }

  get prizes() { return this._core ? this._core.prizes : (this._explicitPrizes ?? []); }
  set prizes(list) {
    this._explicitPrizes = Array.isArray(list) ? list.slice() : null;
    if (this._built) this._applyPrizes(this._sourcePrizes());
  }

  insertCoin(count = 1) {
    if (!this._core) return 0;
    const n = Math.max(1, Math.floor(Number(count) || 1));
    this._animateCoin();
    const credit = () => this._core.insertCoin(n);
    if (this._reduced()) credit();
    else this._later(credit, 520);
    return this.credits + n;
  }

  /**
   * Turn the knob automatically. Optionally force the result:
   * gacha.turn({ prize: "cat" }) — useful when a server decides the outcome.
   */
  async turn({ prize } = {}) {
    await this._ready;
    if (prize !== undefined) this._forced = prize;
    if (this.state !== "idle" && this.state !== "turning") {
      this._refuse();
      return false;
    }
    if (this.state === "idle" && !this._core.beginTurn()) return false;
    this._autoTo(this._total());
    return true;
  }

  take() {
    if (this.state !== "waiting") return false;
    this._takeOut();
    return true;
  }

  open() {
    if (this.state !== "presenting") return false;
    this._openCapsule_(false);
    return true;
  }

  collect() {
    if (this.state !== "revealed") return false;
    this._collect();
    return true;
  }

  /** Clear any capsule in flight and close the overlay (no refunds). */
  reset() {
    if (!this._core) return;
    this._cancelAll();
    this._closeOverlay(true);
    this._trayCapsule.classList.remove("show");
    this._flap.classList.remove("open");
    this._knobBase += this._turn;
    this._turn = 0;
    this._auto = null;
    this._drag = null;
    this._core.reset();
    this._syncBallCount(true);
  }

  /** Restore every prize's original stock and top up the globe. */
  refill() {
    if (!this._core) return;
    this._applyPrizes(this._sourcePrizes());
  }

  /* ---------------- prizes ---------------- */

  _sourcePrizes() {
    return (this._explicitPrizes ?? this._readTemplates() ?? DEFAULT_PRIZES).map((p) => ({ ...p }));
  }

  _readTemplates() {
    const templates = [...this.querySelectorAll(":scope > template[data-prize]")];
    if (!templates.length) return null;
    return templates.map((template, i) => {
      const d = template.dataset;
      return {
        id: d.prize || "prize-" + (i + 1),
        weight: d.weight,
        stock: d.stock,
        color: d.color,
        thumb: d.thumb,
        title: d.title,
        template,
      };
    });
  }

  _applyPrizes(list) {
    this._core.setPrizes(list.map((p) => ({ ...p })));
    this._syncBallCount(true);
  }

  _prizeColor(prize) {
    if (prize?.color) return prize.color;
    const list = this._core.prizes;
    const index = Math.max(0, list.findIndex((p) => p.id === prize?.id));
    return DEFAULT_CAPSULE_COLORS[index % DEFAULT_CAPSULE_COLORS.length];
  }

  _randomLook() {
    const pool = availablePrizes(this._core.prizes);
    const list = pool.length ? pool : this._core.prizes;
    if (!list.length) return { color: DEFAULT_CAPSULE_COLORS[0], thumb: null, prizeId: null };
    const total = list.reduce((s, p) => s + (p.weight || 1), 0);
    let roll = this._rng() * total;
    let prize = list[list.length - 1];
    for (const p of list) { roll -= p.weight || 1; if (roll < 0) { prize = p; break; } }
    const color = this._prizeColor(prize);
    return { color, tone: capsuleTones(color), thumb: prize.thumb ?? null, prizeId: prize.id };
  }

  _targetBallCount() {
    const attr = Number(this.getAttribute("capsules") ?? 24);
    const wanted = Math.max(0, Math.min(40, Math.floor(Number.isFinite(attr) ? attr : 24)));
    return Math.min(wanted, remainingStock(this._core.prizes));
  }

  _populate(fromTop) {
    this._sim.clear();
    const n = this._targetBallCount();
    const cx = GEOM.globe.cx, floorY = GEOM.floorY;
    for (let i = 0; i < n; i++) {
      const look = this._randomLook();
      if (fromTop) this._sim.add(look, "top");
      else this._sim.add(look, { x: cx + (this._rng() - 0.5) * 180, y: floorY - 30 - this._rng() * 200 });
    }
    if (!fromTop) this._sim.settle(4);
    this._needsDraw = true;
    this._wake();
  }

  /** Match the globe to the remaining stock, re-tinting to the current prize set. */
  _syncBallCount(retint, fill = true) {
    if (!this._sim) return;
    const n = this._targetBallCount();
    const balls = this._sim.balls;
    while (balls.length > n) this._sim.remove(balls[balls.length - 1]);
    if (retint) for (const ball of balls) Object.assign(ball, this._randomLook());
    while (fill && balls.length < n) this._sim.add(this._randomLook(), "top");
    this._sim.wake();
    this._needsDraw = true;
    this._wake();
  }

  /* ---------------- DOM ---------------- */

  _artOptions() {
    return { label: this.getAttribute("label") ?? "GACHA", price: this.getAttribute("price") ?? "100" };
  }

  _build() {
    const root = this.shadowRoot;
    const stage = document.createElement("div");
    stage.className = "tg-stage";
    stage.setAttribute("part", "stage");

    const machine = document.createElement("div");
    machine.className = "tg-machine";
    machine.setAttribute("part", "machine");
    machine.innerHTML = backSvg().replace('class="tg-layer"', 'class="tg-layer tg-back"');

    const canvas = document.createElement("canvas");
    canvas.className = "tg-globe";
    place(canvas, GEOM.canvas.x, GEOM.canvas.y, GEOM.canvas.w, GEOM.canvas.h);
    machine.append(canvas);

    machine.insertAdjacentHTML("beforeend", frontSvg(this._artOptions()).replace('class="tg-layer"', 'class="tg-layer tg-front"'));

    const light = document.createElement("span");
    light.className = "tg-light";
    place(light, GEOM.coin.slotX - 4, GEOM.coin.y + GEOM.coin.h - 14, 8, 8);

    const coin = document.createElement("div");
    coin.className = "tg-coin";
    coin.innerHTML = coinSvg();
    place(coin, GEOM.coin.slotX - 18, GEOM.coin.slotY + GEOM.coin.slotH / 2 - 18, 36, 36);

    const k = GEOM.knob;
    const knob = document.createElement("div");
    knob.className = "tg-knob";
    knob.innerHTML = '<div class="tg-knob-rotor" part="knob">' + knobRotorSvg() + '</div><div class="tg-knob-gloss">' + knobGlossSvg() + "</div>";
    place(knob, k.cx - k.r, k.cy - k.r, k.r * 2, k.r * 2);

    const t = GEOM.tray;
    const trayClip = document.createElement("div");
    trayClip.className = "tg-tray-clip";
    place(trayClip, t.x, t.y, t.w, t.h);
    const trayCapsule = document.createElement("div");
    trayCapsule.className = "tg-tray-capsule";
    const d = GEOM.capsuleR * 2 * SVG_SPAN;
    trayCapsule.style.width = (d / t.w) * 100 + "%";
    trayCapsule.style.height = (d / t.h) * 100 + "%";
    trayCapsule.style.left = ((t.w / 2 - d / 2) / t.w) * 100 + "%";
    trayCapsule.style.top = ((t.h - GEOM.capsuleR - 1 - d / 2) / t.h) * 100 + "%";
    trayClip.append(trayCapsule);

    const flap = document.createElement("div");
    flap.className = "tg-flap";
    flap.innerHTML = flapSvg();
    place(flap, t.x - 6, t.y - 2, t.w + 12, t.h + 6);

    const hitKnob = this._hit("tg-hit-knob", k.cx - k.r - 12, k.cy - k.r - 12, (k.r + 12) * 2, (k.r + 12) * 2);
    const hitCoin = this._hit("tg-hit-coin", GEOM.coin.x - 6, GEOM.coin.y - 6, GEOM.coin.w + 12, GEOM.coin.h + 44);
    const hitTray = this._hit("tg-hit-tray", t.x - 16, t.y - 14, t.w + 32, t.h + 24);

    machine.append(light, coin, knob, trayClip, flap, hitKnob, hitCoin, hitTray);
    stage.append(machine);

    const live = document.createElement("p");
    live.className = "tg-sr";
    live.setAttribute("aria-live", "polite");

    const overlay = document.createElement("div");
    overlay.className = "tg-overlay";
    overlay.setAttribute("part", "overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="tg-backdrop" part="backdrop"></div>
      <div class="tg-present">
        <div class="tg-open-wrap">
          <button class="tg-open-capsule" type="button" part="capsule"></button>
          <div class="tg-card-wrap">
            <div class="tg-card" part="prize"><slot name="prize"><div class="tg-default-prize"></div></slot></div>
          </div>
          <div class="tg-sparks"></div>
        </div>
        <p class="tg-caption" part="caption"></p>
        <div class="tg-actions" part="actions"><slot name="actions"></slot><button class="tg-keep" type="button" part="keep"></button></div>
      </div>`;

    root.append(stage, live, overlay);

    Object.assign(this, {
      _stage: stage, _machine: machine, _canvas: canvas, _ctx: canvas.getContext("2d"),
      _front: machine.querySelector(".tg-front"), _light: light, _coin: coin,
      _knob: knob, _rotor: knob.querySelector(".tg-knob-rotor"),
      _trayClip: trayClip, _trayCapsule: trayCapsule, _flap: flap,
      _hitKnob: hitKnob, _hitCoin: hitCoin, _hitTray: hitTray, _live: live,
      _overlay: overlay, _backdrop: overlay.querySelector(".tg-backdrop"),
      _present: overlay.querySelector(".tg-present"),
      _openWrap: overlay.querySelector(".tg-open-wrap"),
      _openCapsule: overlay.querySelector(".tg-open-capsule"),
      _cardWrap: overlay.querySelector(".tg-card-wrap"),
      _defaultPrize: overlay.querySelector(".tg-default-prize"),
      _sparks: overlay.querySelector(".tg-sparks"),
      _caption: overlay.querySelector(".tg-caption"),
      _actions: overlay.querySelector(".tg-actions"),
      _keep: overlay.querySelector(".tg-keep"),
    });

    // remember the input modality so pointer users don't get focus rings
    root.addEventListener("keydown", () => { this._keyboardUsed = true; }, true);
    root.addEventListener("pointerdown", () => { this._keyboardUsed = false; }, true);
    this._bindKnob();
    hitCoin.addEventListener("click", () => {
      if (this.getAttribute("coin-input") === "none" || !this._core.getState().requireCoin) return;
      this.insertCoin(1);
    });
    hitTray.addEventListener("click", () => {
      if (this.state === "waiting") this.take();
      else if (this.state === "dispensing") this._pendingTake = true;
    });
    this._bindOpening();
    this._keep.addEventListener("click", () => this.collect());
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.state === "revealed") { event.preventDefault(); this.collect(); }
      if (event.key === "Tab") this._trapFocus(event);
    });
    this._applyLabels();
  }

  _hit(cls, x, y, w, h) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tg-hit " + cls;
    place(button, x, y, w, h);
    return button;
  }

  _applyLabels() {
    const L = this._labels;
    this._hitKnob.setAttribute("aria-label", L.knob);
    this._hitCoin.setAttribute("aria-label", L.coin);
    this._hitTray.setAttribute("aria-label", L.tray);
    this._openCapsule.setAttribute("aria-label", L.capsule);
    this._overlay.setAttribute("aria-label", L.dialog);
    this._keep.textContent = L.keep;
    this._reflect();
  }

  _sizeCanvas() {
    const width = this._stage.clientWidth;
    if (!width) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const scale = width / GEOM.width;
    const w = Math.round(GEOM.canvas.w * scale * dpr);
    const h = Math.round(GEOM.canvas.h * scale * dpr);
    if (this._canvas.width !== w || this._canvas.height !== h) {
      this._canvas.width = w;
      this._canvas.height = h;
      this._needsDraw = true;
      this._wake();
    }
  }

  /* ---------------- state reflection ---------------- */

  _onCore(event, snap, detail) {
    if (event === "statechange") {
      this.setAttribute("state", snap.state);
      this._reflect();
    }
    if (event === "coin") this._reflect();
    const map = {
      statechange: "statechange", coin: "coin", turnstart: "turnstart", turncancel: "turncancel",
      dispense: "dispense", land: "land", take: "take", reveal: "reveal", collect: "collect",
      empty: "empty", reset: "reset",
    };
    if (!map[event]) return;
    const payload = { ...detail, state: snap.state, credits: snap.credits, remaining: snap.remaining };
    if (event === "reveal") payload.element = this._prizeHolder ?? null;
    this.dispatchEvent(new CustomEvent(map[event], { detail: payload, bubbles: true, composed: true }));
  }

  _reflect() {
    if (!this._core) return;
    const snap = this._core.getState();
    const state = snap.state;
    if (!this.hasAttribute("state") || this.getAttribute("state") !== state) this.setAttribute("state", state);
    if (snap.credits > 0) this.setAttribute("credits", String(snap.credits));
    else this.removeAttribute("credits");
    const cue = (el, on) => (on ? el.setAttribute("data-cue", "") : el.removeAttribute("data-cue"));
    const coinTap = snap.requireCoin && this.getAttribute("coin-input") !== "none";
    cue(this._hitKnob, state === "idle");
    cue(this._hitCoin, state === "locked" && coinTap);
    cue(this._hitTray, state === "waiting");
    this._hitCoin.disabled = !coinTap;
    this._hitCoin.hidden = !coinTap;
    this._hitTray.disabled = !(state === "waiting" || state === "dispensing");
    const L = this._labels;
    const hint = {
      idle: L.hintIdle, turning: L.hintIdle, locked: L.hintLocked, empty: L.hintEmpty,
      dispensing: "", waiting: L.hintTake, presenting: L.hintOpen, revealed: L.hintRevealed,
    }[state] ?? "";
    this._hitKnob.title = state === "locked" ? L.hintLocked : state === "empty" ? L.hintEmpty : L.knob;
    if (hint && this._live.textContent !== hint) this._live.textContent = hint;
    if (state === "presenting") this._caption.textContent = L.hintOpen;
    else if (state === "revealed") this._caption.textContent = L.hintRevealed;
  }

  /* ---------------- knob ---------------- */

  _total() {
    const turns = Number(this.getAttribute("turns"));
    return (Number.isFinite(turns) && turns > 0 ? turns : 1) * 360;
  }

  _knobCenter() {
    const r = this._knob.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.width };
  }

  _bindKnob() {
    const el = this._hitKnob;
    el.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      event.preventDefault();
      if (this.state !== "idle" && this.state !== "turning") {
        this._refuse();
        return;
      }
      const c = this._knobCenter();
      this._drag = {
        id: event.pointerId,
        last: Math.atan2(event.clientY - c.y, event.clientX - c.x),
        x: event.clientX, y: event.clientY, t: performance.now(), moved: false, center: c,
      };
      this._auto = null;
      el.setPointerCapture?.(event.pointerId);
    });
    el.addEventListener("pointermove", (event) => {
      const drag = this._drag;
      if (!drag || drag.id !== event.pointerId) return;
      const c = drag.center;
      const dx = event.clientX - c.x, dy = event.clientY - c.y;
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6) drag.moved = true;
      if (Math.hypot(dx, dy) < c.size * 0.12) return;
      const angle = Math.atan2(dy, dx);
      let delta = angle - drag.last;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      drag.last = angle;
      if (delta > 0) this._advance((delta * 180) / Math.PI);
      else if (delta < -0.02) this._knobVel -= 30; // ratchet pushes back
    });
    const end = (event) => {
      const drag = this._drag;
      if (!drag || drag.id !== event.pointerId) return;
      this._drag = null;
      if (!drag.moved && performance.now() - drag.t < 450) this.turn();
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", (event) => { if (this._drag?.id === event.pointerId) this._drag = null; });
    el.addEventListener("click", (event) => {
      if (event.detail === 0) this.turn(); // keyboard activation
    });
    el.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        if (this.state === "idle") this._core.beginTurn();
        if (this.state !== "turning") return this._refuse();
        const next = Math.min(this._total(), (Math.floor(this._turn / DETENT + 1e-6) + 1) * DETENT);
        this._autoTo(next, 1);
      }
    });
  }

  _refuse() {
    sounds.thud(this._volume());
    this._anim(this._rotor, [
      { transform: `rotate(${this._knobAngle}deg)` },
      { transform: `rotate(${this._knobAngle + 5}deg)` },
      { transform: `rotate(${this._knobAngle - 2}deg)` },
      { transform: `rotate(${this._knobAngle}deg)` },
    ], { duration: 260, easing: "ease-out" });
    if (this.state === "locked") this._anim(this._light, [{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 600 });
    const reason = { locked: "locked", empty: "empty" }[this.state] ?? "busy";
    this.dispatchEvent(new CustomEvent("blocked", { detail: { reason, state: this.state }, bubbles: true, composed: true }));
    this._live.textContent = { locked: this._labels.hintLocked, empty: this._labels.hintEmpty }[this.state] ?? this._labels.hintBusy;
  }

  _advance(delta) {
    if (this.state === "idle" && !this._core.beginTurn()) return;
    if (this.state !== "turning" || this._completing) return;
    const result = knobStep(this._turn, delta, { detentDeg: DETENT, totalDeg: this._total() });
    this._turn = result.progress;
    for (const index of result.passed) this._detent(index);
    this._wake();
    if (result.complete) this._completeTurn();
  }

  _autoTo(target, detents) {
    const from = this._turn;
    const segments = Math.max(1, detents ?? Math.ceil((target - from) / DETENT - 1e-6));
    const per = this._reduced() ? 60 : 330;
    this._auto = { from, to: target, start: performance.now(), dur: segments * per, segments };
    this._wake();
  }

  _detent(index) {
    const v = this._volume();
    sounds.tick(v);
    if (!this._reduced()) {
      this._sim.kick(0.9);
      for (let i = 0; i < 2; i++) this._later(() => sounds.clack(v * 0.8), 30 + i * 70);
      this._anim(this._machine, [
        { transform: "translate(0,0) rotate(0)" },
        { transform: "translate(0.6px,-0.8px) rotate(0.35deg)" },
        { transform: "translate(-0.4px,0) rotate(-0.2deg)" },
        { transform: "translate(0,0) rotate(0)" },
      ], { duration: 180, easing: "ease-out" });
    }
    this.dispatchEvent(new CustomEvent("detent", {
      detail: { index, of: this._total() / DETENT }, bubbles: true, composed: true,
    }));
  }

  async _completeTurn() {
    this._completing = true;
    this._drag = null;
    this._auto = null;
    let wanted = this._forced;
    this._forced = undefined;
    try {
      if (wanted === undefined && typeof this.resolvePrize === "function") {
        const snap = this._core.getState();
        wanted = await this.resolvePrize({ prizes: this._core.prizes, history: snap.history, rng: this._rng });
      }
    } catch (error) {
      this.dispatchEvent(new CustomEvent("error", { detail: { error }, bubbles: true, composed: true }));
      wanted = undefined;
    }
    let prize = null;
    try {
      prize = this._core.completeTurn(wanted ?? undefined);
    } catch (error) {
      this.dispatchEvent(new CustomEvent("error", { detail: { error }, bubbles: true, composed: true }));
      this._core.cancelTurn();
    }
    this._knobBase += this._turn;
    this._turn = 0;
    this._completing = false;
    if (prize) this._dispense(prize);
  }

  /* ---------------- dispensing ---------------- */

  _dispense(prize) {
    const color = this._prizeColor(prize);
    const exit = GEOM.exit;
    const look = { color, tone: capsuleTones(color), thumb: prize.thumb ?? null, prizeId: prize.id };
    let ball = this._sim.nearest(exit.x, GEOM.floorY, (b) => b.prizeId === prize.id && b.y > GEOM.floorY - 90);
    ball ||= this._sim.nearest(exit.x, GEOM.floorY);
    const fast = this._reduced();
    if (ball) {
      Object.assign(ball, look);
      this._sim.remove(ball);
      this._sinking.push({ ball, x0: ball.x, y0: ball.y, t0: performance.now(), dur: fast ? 60 : 460 });
      if (!fast) this._sim.kick(0.6);
    }
    // keep the globe count honest when stock is limited
    this._later(() => this._syncBallCount(false, false), fast ? 80 : 520);
    this._later(() => this._rollIn(prize, look), fast ? 60 : 420);
    this._wake();
  }

  _rollIn(prize, look) {
    const uid = "tc" + ++uidCounter;
    this._trayCapsule.innerHTML = capsuleSvg(look.color, look.thumb, uid);
    this._trayCapsule.classList.add("show");
    const v = this._volume();
    const finish = () => {
      this._core.landed();
      if (this._pendingTake) {
        this._pendingTake = false;
        this.take();
      }
    };
    if (this._reduced()) {
      sounds.thunk(v);
      finish();
      return;
    }
    const anim = this._anim(this._trayCapsule, [
      { transform: "translate(-150%, -120%) rotate(-260deg)", offset: 0, easing: "cubic-bezier(.5,0,.9,.6)" },
      { transform: "translate(-62%, 0%) rotate(-120deg)", offset: 0.34, easing: "cubic-bezier(.2,.6,.4,1)" },
      { transform: "translate(-32%, -20%) rotate(-62deg)", offset: 0.5, easing: "cubic-bezier(.6,0,.9,.5)" },
      { transform: "translate(-8%, 0%) rotate(-16deg)", offset: 0.66, easing: "ease-out" },
      { transform: "translate(5%, -3%) rotate(5deg)", offset: 0.82, easing: "ease-in-out" },
      { transform: "translate(0, 0) rotate(0deg)", offset: 1 },
    ], { duration: 980 });
    this._later(() => sounds.thunk(v), 330);
    this._later(() => sounds.thunk(v * 0.35), 640);
    this._later(() => this._anim(this._machine, [
      { transform: "translateY(0)" }, { transform: "translateY(1.2px)" }, { transform: "translateY(0)" },
    ], { duration: 160 }), 330);
    anim.finished.then(finish, () => {});
  }

  /* ---------------- presentation ---------------- */

  _takeOut() {
    const prize = this._core.getState().prize;
    const color = this._prizeColor(prize);
    this._core.take();
    this._flap.classList.add("open");
    sounds.clack(this._volume());

    this._mountPrize(prize);
    const uid = "oc" + ++uidCounter;
    this._openCapsule.innerHTML = capsuleSvg(color, prize.thumb ?? null, uid);
    this._openCapsule.style.visibility = "visible";
    this._openCapsule.style.pointerEvents = "";
    this._capTop = this._openCapsule.querySelector(".tg-cap-top");
    this._capBottom = this._openCapsule.querySelector(".tg-cap-bottom");
    this._capRim = this._openCapsule.querySelector(".tg-cap-rim");
    this._cardWrap.classList.remove("show");
    this._cardWrap.style.opacity = "0";
    this._actions.classList.remove("show");
    this._openWrap.style.height = "";
    this._present.style.opacity = "";
    this._caption.textContent = this._labels.hintOpen;
    this._caption.style.opacity = "0";

    const from = this._trayCapsule.getBoundingClientRect();
    this._overlay.classList.add("open");
    const to = this._openCapsule.getBoundingClientRect();
    this._trayCapsule.classList.remove("show");
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const s = from.width / to.width || 0.2;
    const fast = this._reduced();
    const anim = this._anim(this._openCapsule, [
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(0deg)` },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) scale(${(s + 1) / 2}) rotate(-8deg)`, offset: 0.5 },
      { transform: "translate(0,0) scale(1) rotate(0deg)" },
    ], { duration: fast ? 10 : 720, easing: "cubic-bezier(.3,.7,.3,1)" });
    anim.finished.then(() => {
      this._caption.style.opacity = "1";
      this._openCapsule.focus({ preventScroll: true, focusVisible: this._keyboardUsed });
      this._idleWobble();
    }, () => {});
    this._later(() => this._flap.classList.remove("open"), fast ? 10 : 650);
  }

  _idleWobble() {
    if (this.state !== "presenting" || this._reduced()) return;
    this._wobble = this._anim(this._openCapsule, [
      { transform: "rotate(0deg)" }, { transform: "rotate(-4deg)" }, { transform: "rotate(3deg)" }, { transform: "rotate(0deg)" },
    ], { duration: 900, delay: 1400, iterations: Infinity, endDelay: 0, easing: "ease-in-out" });
  }

  _bindOpening() {
    const el = this._openCapsule;
    let drag = null;
    const svgUnits = () => 112 / (el.getBoundingClientRect().width || 1);
    const setPull = (pull, tilt = 0) => {
      const u = pull * svgUnits();
      if (this._capTop) this._capTop.style.transform = `translate(${tilt * 0.3}px, ${-u}px) rotate(${-tilt * 0.4}deg)`;
      const b = `translate(0, ${u * 0.14}px)`;
      if (this._capBottom) this._capBottom.style.transform = b;
      if (this._capRim) this._capRim.style.transform = b;
    };
    el.addEventListener("pointerdown", (event) => {
      if (this.state !== "presenting") return;
      event.preventDefault();
      this._wobble?.cancel();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now(), moved: false, pull: 0 };
      el.setPointerCapture?.(event.pointerId);
    });
    el.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = drag.y - event.clientY;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      const size = el.getBoundingClientRect().width;
      // resist like a snug snap-fit: the first bit is stiff, then it gives
      const raw = Math.max(0, dy);
      drag.pull = raw < size * 0.08 ? raw * 0.35 : size * 0.028 + (raw - size * 0.08) * 0.8;
      setPull(drag.pull, Math.max(-14, Math.min(14, dx * 0.15)));
      if (drag.pull > size * 0.17) {
        drag = null;
        this._openCapsule_(true);
      }
    });
    const end = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const d = drag;
      drag = null;
      if (!d.moved && performance.now() - d.t < 500) { this._openCapsule_(false); return; }
      // snap back
      for (const part of [this._capTop, this._capBottom, this._capRim]) {
        if (!part) continue;
        const current = part.style.transform || "none";
        part.style.transform = "";
        this._anim(part, [{ transform: current }, { transform: "translate(0,0)" }], { duration: 260, easing: "cubic-bezier(.3,1.6,.5,1)" });
      }
      this._idleWobble();
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("click", (event) => { if (event.detail === 0) this.open(); });
  }

  _openCapsule_(pulled) {
    if (this.state !== "presenting") return;
    this._wobble?.cancel();
    this._core.open();
    sounds.pop(this._volume());
    const fast = this._reduced();
    const dur = fast ? 10 : 640;
    const twist = pulled ? [] : [{ transform: "translate(0,0) rotate(0deg)" }, { transform: "translate(0,-4px) rotate(-14deg)", offset: 0.22 }];
    for (const [part, end] of [
      [this._capTop, "translate(-14px,-120px) rotate(-34deg)"],
      [this._capBottom, "translate(8px,96px) rotate(16deg)"],
      [this._capRim, "translate(8px,96px) rotate(16deg)"],
    ]) {
      if (!part) continue;
      const current = part.style.transform || "translate(0,0) rotate(0deg)";
      part.style.transform = "";
      const frames = part === this._capTop && twist.length ? [...twist, { transform: end, opacity: 0 }] : [{ transform: current }, { transform: end, opacity: 0 }];
      this._anim(part, frames, { duration: dur, easing: "cubic-bezier(.25,.6,.35,1)", fill: "forwards" });
    }
    this._openCapsule.style.pointerEvents = "none";

    // grow the stage to fit the prize, then reveal it
    const size = this._openWrap.getBoundingClientRect().width;
    const cardHeight = this._cardWrap.getBoundingClientRect().height;
    this._openWrap.style.transition = fast ? "none" : "height .45s cubic-bezier(.3,.8,.3,1)";
    this._openWrap.style.height = Math.max(size, cardHeight + 8) + "px";
    this._cardWrap.classList.add("show");
    const card = this._anim(this._cardWrap, [
      { opacity: 0, transform: "translate(-50%,-38%) scale(.22)" },
      { opacity: 1, transform: "translate(-50%,-52%) scale(1.05)", offset: 0.7 },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1)" },
    ], { duration: fast ? 10 : 620, delay: fast ? 0 : 230, easing: "cubic-bezier(.3,.8,.3,1)", fill: "forwards" });
    if (!fast) this._burst();
    this._caption.style.opacity = this._labels.hintRevealed ? "1" : "0";
    card.finished.then(() => {
      this._cardWrap.style.opacity = "1";
      this._actions.classList.add("show");
      this._keep.focus({ preventScroll: true, focusVisible: this._keyboardUsed });
      this._openCapsule.style.visibility = "hidden";
    }, () => {});
  }

  _burst() {
    this._sparks.textContent = "";
    const n = 12;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.className = "tg-spark";
      const a = (i / n) * Math.PI * 2 + this._rng() * 0.4;
      const dist = 80 + this._rng() * 70;
      const size = 0.5 + this._rng() * 0.8;
      this._sparks.append(s);
      this._anim(s, [
        { opacity: 0, transform: "translate(0,0) scale(.4)" },
        { opacity: 1, transform: `translate(${Math.cos(a) * dist * 0.5}px, ${Math.sin(a) * dist * 0.5}px) scale(${size})`, offset: 0.3 },
        { opacity: 0, transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist + 20}px) scale(.2)` },
      ], { duration: 820 + this._rng() * 300, delay: 120, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
    }
  }

  _mountPrize(prize) {
    this._clearPrize();
    this._defaultPrize.textContent = "";
    const holder = document.createElement("div");
    holder.slot = "prize";
    holder.className = "trinket-gacha-prize";
    holder.dataset.prize = prize.id;
    let node = null;
    let custom = true;
    try {
      if (typeof this.renderPrize === "function") node = this.renderPrize(prize, holder);
      else if (typeof prize.render === "function") node = prize.render(prize, holder);
      else if (prize.template instanceof HTMLTemplateElement) node = prize.template.content.cloneNode(true);
      else if (prize.content instanceof HTMLTemplateElement) node = prize.content.content.cloneNode(true);
      else if (prize.content instanceof Node) node = prize.content.cloneNode(true);
      else if (typeof prize.content === "string") holder.innerHTML = prize.content;
      else custom = false;
    } catch (error) {
      custom = false;
      this.dispatchEvent(new CustomEvent("error", { detail: { error }, bubbles: true, composed: true }));
    }
    if (node && node !== holder && !holder.contains(node)) holder.append(node);
    if (custom && holder.childNodes.length) {
      this.append(holder);
      this._prizeHolder = holder;
    } else {
      this._renderDefaultPrize(prize);
      this._prizeHolder = null;
    }
  }

  _renderDefaultPrize(prize) {
    const box = this._defaultPrize;
    const thumb = prize.image || prize.thumb;
    if (thumb && isImageThumb(thumb)) {
      const img = document.createElement("img");
      img.src = thumb;
      img.alt = prize.title || "";
      box.append(img);
    } else if (thumb) {
      const span = document.createElement("span");
      span.className = "tg-dp-thumb";
      span.textContent = thumb;
      box.append(span);
    }
    const title = document.createElement("strong");
    title.textContent = prize.title || prize.id;
    box.append(title);
    if (prize.description) {
      const p = document.createElement("p");
      p.textContent = prize.description;
      box.append(p);
    }
  }

  _clearPrize() {
    this._prizeHolder?.remove();
    this._prizeHolder = null;
  }

  _collect() {
    const done = () => {
      this._closeOverlay(false);
      this._core.collect();
      this._syncBallCount(false);
      if (this._keyboardUsed) this._hitKnob.focus({ preventScroll: true });
    };
    if (this._reduced()) return done();
    this._overlay.querySelector(".tg-backdrop").style.opacity = "0";
    this._anim(this._present, [{ opacity: 1, transform: "translateY(0) scale(1)" }, { opacity: 0, transform: "translateY(10px) scale(.97)" }], { duration: 260, easing: "ease-in", fill: "forwards" })
      .finished.then(done, done);
  }

  _closeOverlay(immediate) {
    this._overlay.classList.remove("open");
    this._overlay.querySelector(".tg-backdrop").style.opacity = "";
    for (const el of [this._present, this._cardWrap, this._openCapsule, this._capTop, this._capBottom, this._capRim]) {
      el?.getAnimations?.().forEach((a) => a.cancel());
      if (el && el !== this._cardWrap) el.style.transform = "";
    }
    this._cardWrap.classList.remove("show");
    this._cardWrap.style.opacity = "0";
    this._actions.classList.remove("show");
    this._openWrap.style.transition = "none";
    this._openWrap.style.height = "";
    this._sparks.textContent = "";
    this._clearPrize();
    this._defaultPrize.textContent = "";
    if (immediate) this._openCapsule.innerHTML = "";
  }

  _trapFocus(event) {
    const focusables = [this._openCapsule, ...this.querySelectorAll('[slot="actions"]'), this._keep]
      .filter((el) => el && el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden");
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    const active = this.shadowRoot.activeElement || document.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  _animateCoin() {
    if (this._reduced()) return;
    this._anim(this._coin, [
      { opacity: 0, transform: "translate(90%, 30%) rotate(30deg) scale(1)" },
      { opacity: 1, transform: "translate(0, 0) rotate(0deg) scale(1)", offset: 0.35, easing: "ease-in-out" },
      { opacity: 1, transform: "translate(0, 0) scaleX(.16)", offset: 0.62, easing: "ease-in" },
      { opacity: 0, transform: "translate(0, -12%) scaleX(.12) scaleY(.5)" },
    ], { duration: 640, easing: "ease-out" });
    this._later(() => sounds.clink(this._volume()), 380);
  }

  /* ---------------- frame loop ---------------- */

  _wake() {
    if (!this._raf && this.isConnected) {
      this._last = performance.now();
      this._raf = requestAnimationFrame(this._tick);
    }
  }

  _tick = (now) => {
    this._raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - this._last) / 1000));
    this._last = now;
    let active = false;

    if (this._auto) {
      const a = this._auto;
      const p = clamp01((now - a.start) / a.dur);
      const k = p * a.segments;
      const whole = Math.min(a.segments - 1, Math.floor(k));
      const value = Math.min(a.to, a.from + DETENT * (whole + easeInOut(clamp01(k - whole))));
      if (p >= 1) this._auto = null;
      const delta = (p >= 1 ? a.to : value) - this._turn;
      if (delta > 0) this._advance(delta);
      active = true;
    }

    // knob spring towards the ratcheted target, with detent feel
    const target = this._knobBase + detentFeel(this._turn, DETENT);
    const before = this._knobAngle;
    const stiffness = 320, damping = 30;
    this._knobVel += ((target - this._knobAngle) * stiffness - this._knobVel * damping) * dt;
    this._knobAngle += this._knobVel * dt;
    if (Math.abs(target - this._knobAngle) < 0.01 && Math.abs(this._knobVel) < 0.05) {
      this._knobAngle = target;
      this._knobVel = 0;
    } else active = true;
    this._rotor.style.transform = `rotate(${this._knobAngle.toFixed(3)}deg)`;
    const stir = this._reduced() ? 0 : ((this._knobAngle - before) / dt) * (Math.PI / 180);

    if (this._drag) active = true;

    if (!this._sim.asleep || Math.abs(stir) > 0.05) {
      this._sim.step(dt, { stir: Math.max(-12, Math.min(12, stir)) });
      this._needsDraw = true;
      active = true;
    }
    if (this._sinking.length) {
      this._needsDraw = true;
      active = true;
    }
    if (this._needsDraw) this._draw(now);
    if (this._sinking.length) active = true;
    if (active) this._wake();
  };

  _draw(now) {
    const ctx = this._ctx;
    const cw = this._canvas.width, ch = this._canvas.height;
    if (!cw || !ch) return;
    this._needsDraw = false;
    const scale = cw / GEOM.canvas.w;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.setTransform(scale, 0, 0, scale, -GEOM.canvas.x * scale, -GEOM.canvas.y * scale);
    ctx.save();
    ctx.beginPath();
    ctx.arc(GEOM.globe.cx, GEOM.globe.cy, GEOM.globe.r - 2, 0, Math.PI * 2);
    ctx.clip();

    // sinking capsule disappears through the exit hole
    this._sinking = this._sinking.filter((s) => {
      const p = clamp01((now - s.t0) / s.dur);
      const e = p * p;
      const x = s.x0 + (GEOM.exit.x - s.x0) * Math.min(1, p * 1.6);
      const y = s.y0 + e * 90;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, GEOM.width, GEOM.exit.y + 2);
      ctx.clip();
      drawCapsule(ctx, x, y, s.ball.r, s.ball.angle + p * 1.5, s.ball.tone || s.ball.color, s.ball.thumb);
      ctx.restore();
      return p < 1;
    });

    const balls = this._sim.balls;
    for (const ball of balls) {
      ball.tone ||= capsuleTones(ball.color);
      drawCapsule(ctx, ball.x, ball.y, ball.r, ball.angle, ball.tone, ball.thumb);
    }
    ctx.restore();
  }

  /* ---------------- helpers ---------------- */

  _reduced() { return this._motionQuery?.matches ?? false; }
  _volume() { return this.hasAttribute("muted") ? 0 : 1; }

  _later(fn, ms) {
    const id = setTimeout(() => { this._timers.delete(id); fn(); }, ms);
    this._timers.add(id);
    return id;
  }

  _anim(el, frames, options) {
    const anim = el.animate(frames, options);
    this._anims.add(anim);
    const drop = () => this._anims.delete(anim);
    anim.finished.then(drop, drop);
    return anim;
  }

  _cancelAll() {
    for (const id of this._timers) clearTimeout(id);
    this._timers.clear();
    for (const anim of this._anims) anim.cancel();
    this._anims.clear();
    this._sinking = [];
    this._pendingTake = false;
    this._completing = false;
  }
}

if (!customElements.get("trinket-gacha")) {
  customElements.define("trinket-gacha", TrinketGacha);
}
