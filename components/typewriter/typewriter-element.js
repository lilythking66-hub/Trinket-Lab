import { createTypewriter, graphemes, charWidth, isRTL, PAGE_DEFAULTS } from "./typewriter-core.js";
import { QWERTY, ALIASES, compileLayout, keyForChar } from "./keyboard-layout.js";
import {
  CAMERA, BODY, WALL_PROFILE, PLATEN, UP, NORMAL, PAPER_BASE, PRINT, KEYS, SPOOLS, SPOOL, HOOD_FRONT,
  zDeck, sheetGeometry, carriageGeometry, carriageOffset, keyPositions,
  createProjector, vCylinder, hCylinder, CHROME, CHROME_V, RUBBER, BLACK_V,
  deckSvg, hoodTopSvg, fanSvg, apronSvg, spoolCapSvg, scaleSvg,
  leverSvgInner, ribbonSvgInner, cardHolderSvgInner, typebarSvgInner, paperNoiseUrl, esc,
} from "./typewriter-art.js";
import { createTypewriterSound } from "./sound.js";
import { TYPEWRITER_CSS } from "./style.js";

export { createTypewriter, graphemes, charWidth, isRTL, PAGE_DEFAULTS, QWERTY, compileLayout, keyForChar };

const DEFAULT_LABELS = {
  machine: "Typewriter. Type to print on the paper",
  lever: "Carriage return",
  knob: "Platen knob: feed one line",
  paper: "Sheet of paper",
  space: "Space bar",
};
const INKS = { black: "#1f1c1a", red: "#b3262e", blue: "#25376f", brown: "#4b301d", green: "#24493a" };

/* timing (seconds) */
const T = { keyDown: 0.026, keyUp: 0.07, autoRelease: 0.095, up: 0.052, back: 0.095, gap: 0.028 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeIn = (t) => t * t * t;
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const now = () => performance.now() / 1000;

export class TrinketTypewriter extends HTMLElement {
  static get observedAttributes() {
    return ["columns", "rows", "label", "ink", "line-end", "backspace", "page-end", "sfx", "muted", "volume"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = TYPEWRITER_CSS;
    this.shadowRoot.append(style);

    this._labels = { ...DEFAULT_LABELS };
    this._layoutSrc = QWERTY;
    this._layout = compileLayout(QWERTY);
    this._core = createTypewriter(this._pageConfig());
    this._sound = createTypewriterSound();
    this._queue = [];
    this._queueWaiters = [];
    this._busyUntil = 0;
    this._flights = [];
    this._keyState = new Map();
    this._glyphEls = new Map();
    this._raf = 0;
    this._lastT = 0;
    this._dx = 0; this._dxVel = 0; this._dxTarget = 0; this._carTween = null;
    this._feed = 0; this._feedVel = 0; this._feedTarget = 0; this._feedTween = null;
    this._lever = null;
    this._lift = 0;
    this._shiftV = 0;
    this._sheetOpacity = 1;
    this._lastCode = null;
    this._composing = false;
    this._changeQueued = false;
    this._life = 0;        // bumped by _halt(): work started in an earlier life stops
    this._sleepers = [];   // wake-ups for type()'s pauses, released by _halt()

    let resolve;
    this._ready = new Promise((res) => { resolve = res; });
    this._resolveReady = resolve;
  }

  /* ------------------------------------------------------------ lifecycle */

  connectedCallback() {
    if (!this._built) {
      this._built = true;
      this._build();
      this._applyAttributes();
      this._resetVisuals();
      if (this._pendingPrint) { const t = this._pendingPrint; this._pendingPrint = ""; this.print(t); }
      this._resolveReady(this);
      queueMicrotask(() => this._emit("ready"));
    }
    clearTimeout(this._releaseTimer);
    this._resize = new ResizeObserver(() => this._measure());
    this._resize.observe(this._stage);
    this._measure();
    this._blurHandler = () => this._releaseAllKeys();
    globalThis.addEventListener?.("blur", this._blurHandler);
    this._render(true);
    this._wake(); // a move (disconnect + connect in one task) resumes whatever was queued
    if (this.hasAttribute("autofocus")) requestAnimationFrame(() => this.focus());
  }

  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._resize?.disconnect();
    globalThis.removeEventListener?.("blur", this._blurHandler);
    clearTimeout(this._releaseTimer);
    // Deferred so that moving the element (disconnect + reconnect in the same
    // task) keeps typing. Once it has really left the page, everything stops.
    this._releaseTimer = setTimeout(() => { if (!this.isConnected) this._halt(); }, 0);
  }

  /**
   * The element has left the page: stop all work and settle every promise.
   * Pending keystrokes are dropped, strikes in flight land at once, a sheet
   * that is rolling out finishes leaving (its eject() resolves with the page),
   * running type() calls return. Re-attaching starts from a quiet machine.
   */
  _halt() {
    this._life++;
    const t = now();
    const pending = this._queue.splice(0);
    for (const fl of this._flights) if (!fl.struck) { fl.struck = true; fl.el.style.visibility = ""; }
    this._flights.length = 0;
    if (this._carTween) { this._dx = this._dxTarget = this._carTween.to; this._carTween = null; }
    this._dxVel = 0;
    if (this._feedTween) {
      const tw = this._feedTween;
      this._feedTween = null;
      this._feed = tw.to;
      this._sheetOpacity = 1;
      tw.done?.();
    }
    if (this._core.hasSheet) this._feed = this._feedTarget = this._sheet.baseline(this._core.line);
    this._feedVel = 0;
    this._lever = null; this._leverAngle = 0;
    for (const [code, st] of this._keyState) {
      if (this._layout.byCode.get(code)?.kind === "lock" && this._core.lock) continue;
      st.down = false; st.release = 0; st.v = 0; st.dirty = true;
    }
    if (this._core.shift) this._core.setShift(false);
    this._lift = 0;
    this._busyUntil = t;
    // API promises waiting in the queue: eject() gets null (nothing was taken), newSheet() just returns
    for (const op of pending) op.resolve?.(op.kind === "eject" ? null : undefined);
    for (const fn of this._queueWaiters.splice(0)) fn();
    for (const fn of this._sleepers.splice(0)) fn();
    this._sound.destroy();
    this._render(true);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this._built || oldValue === newValue) return;
    if (name === "columns" || name === "rows" || name === "label") {
      const text = this.text;
      const keep = this._core.hasSheet;
      this._core.configure(this._pageConfig());
      this._rebuild();
      this._core.insert();
      this._resetVisuals();
      if (keep && text) this.print(text);
      if (!keep) { this._core.eject(); this._sheetEl.style.visibility = "hidden"; }
    }
    this._applyAttributes();
  }

  _pageConfig() {
    const num = (name, d, lo, hi) => {
      const v = parseInt(this.getAttribute(name), 10);
      return Number.isFinite(v) ? clamp(v, lo, hi) : d;
    };
    return {
      columns: num("columns", PAGE_DEFAULTS.columns, 8, 80),
      rows: num("rows", PAGE_DEFAULTS.rows, 1, 60),
      lineEnd: this.getAttribute("line-end") === "lock" ? "lock" : "wrap",
      backspace: this.getAttribute("backspace") === "move" ? "move" : "erase",
    };
  }

  _applyAttributes() {
    this._core.configure(this._pageConfig());
    const ink = this.getAttribute("ink");
    if (ink) this.style.setProperty("--trinket-typewriter-ink", INKS[ink] || ink);
    else this.style.removeProperty("--trinket-typewriter-ink");
    this._sound.enabled = this.getAttribute("sfx") !== "off";
    this._sound.muted = this.hasAttribute("muted");
    if (this.hasAttribute("volume")) this._sound.volume = Number(this.getAttribute("volume"));
  }

  /* ----------------------------------------------------------- public API */

  whenReady() { return this._ready; }

  get text() { return this._core.text(); }
  get lines() { return this._core.page().lines; }
  get line() { return this._core.line; }
  get column() { return this._core.column; }
  get columns() { return this._core.config.columns; }
  get rows() { return this._core.config.rows; }
  get hasPaper() { return this._core.hasSheet; }
  get shift() { return this._core.shift || this._core.lock; }
  get busy() { return this._queue.length > 0 || now() < this._busyUntil || this._flights.length > 0; }

  get labels() { return { ...this._labels }; }
  set labels(v) {
    this._labels = { ...DEFAULT_LABELS, ...(v || {}) };
    if (this._built) this._applyLabels();
  }

  /** Key cap layout: { rows: [[{ code, kind, char, shift, legend }]], offsets }. */
  get layout() { return this._layoutSrc; }
  set layout(v) {
    this._layoutSrc = v || QWERTY;
    this._layout = compileLayout(this._layoutSrc);
    if (this._built) this._rebuild();
  }

  focus(options) { this._input?.focus({ preventScroll: true, ...(options || {}) }); }
  blur() { this._input?.blur(); }

  /**
   * Type text with the full mechanism: key, typebar, ink, carriage. Resolves
   * when the last character is on the paper. cps = characters per second.
   */
  async type(text, { cps = 14, humanize = true, signal } = {}) {
    await this._ready;
    const life = this._life;
    const stopped = () => signal?.aborted || life !== this._life || !this.isConnected;
    for (const g of graphemes(text)) {
      if (stopped()) break;
      await this._drain();
      if (stopped()) break;
      this._enqueueGrapheme(g, "api");
      const base = 1 / cps;
      let wait = humanize ? base * (0.55 + Math.random() * 0.9) : base;
      if (humanize && (g === " " || /[.,;:!?。，、！？]/u.test(g))) wait += base * (0.4 + Math.random() * 0.8);
      await this._sleep(wait * 1000, signal);
    }
    if (!stopped()) await this._drain();
    return this.text;
  }

  /** Put text on the paper instantly, without animation or sound. */
  print(text) {
    if (!this._built) { this._pendingPrint = (this._pendingPrint || "") + text; return this._core.text(); }
    for (const g of graphemes(text)) this._instant(g);
    this._dx = this._dxTarget = carriageOffset(this._sheet, this._core.column);
    this._dxVel = 0;
    this._feed = this._feedTarget = this._sheet.baseline(this._core.line);
    this._feedVel = 0;
    this._changed();
    this._render(true);
    return this.text;
  }

  /** Press a key cap by KeyboardEvent.code ("KeyA", "Space", "Enter", "Backspace"…). */
  press(code) {
    this._keyDown(code, "api");
    setTimeout(() => this._keyUp(code), T.autoRelease * 1000);
  }

  backspace() { this._enqueue({ kind: "back", source: "api" }); }
  tab() { this._enqueue({ kind: "tab", source: "api" }); }
  space() { this._enqueue({ kind: "space", source: "api" }); }
  carriageReturn() { this._enqueue({ kind: "return", source: "api" }); }
  lineFeed(n = 1) { for (let i = 0; i < n; i++) this._enqueue({ kind: "feed", source: "api" }); }

  /** Roll the sheet out. Resolves with { text, lines, glyphs, columns, rows }. */
  eject() {
    return new Promise((resolve) => this._enqueue({ kind: "eject", resolve }));
  }

  /** Feed a fresh sheet (ejecting the current one first). */
  async newSheet() {
    if (this._core.hasSheet) await this.eject();
    await new Promise((resolve) => this._enqueue({ kind: "insert", resolve }));
  }

  /** Blank sheet, instantly. */
  clear() {
    this._queue.length = 0;
    this._flights.length = 0;
    this._core.insert();
    this._resetVisuals();
    this._changed();
  }

  /* ---------------------------------------------------------------- build */

  _layoutScene() {
    const P = createProjector(CAMERA);
    this._sheet = sheetGeometry(this._core.config);
    this._car = carriageGeometry(this._sheet);
    const S = this._sheet, C = this._car;
    const pts = [];
    const b = BODY.base;
    for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [-BODY.foot.h, BODY.hood.z + 6]) pts.push(P.proj(x, y, z));
    const dxs = [carriageOffset(S, 0), carriageOffset(S, S.columns)];
    const topFeed = S.baseline(S.rows - 1);
    for (const dx of dxs) {
      for (const x of [C.x0 - 64, C.x1 + 22]) for (const z of [PLATEN.z - 22, PLATEN.z + 34]) pts.push(P.proj(x + dx, PLATEN.y + 44, z));
      const top = add(PRINT, UP, topFeed);
      for (const x of [C.sheetLeft, C.sheetLeft + S.w]) pts.push(P.proj(x + dx, top[1], top[2]));
      const table = add(add(PAPER_BASE, NORMAL, -3), UP, 108);
      for (const x of [C.sheetLeft - 6, C.sheetLeft + S.w + 6]) pts.push(P.proj(x + dx, table[1], table[2]));
    }
    const pad = 14;
    const minX = Math.min(...pts.map((p) => p.x)) - pad, maxX = Math.max(...pts.map((p) => p.x)) + pad;
    const minY = Math.min(...pts.map((p) => p.y)) - pad, maxY = Math.max(...pts.map((p) => p.y)) + pad + 12;
    P.origin.x = -minX;
    P.origin.y = -minY;
    this._P = P;
    this._W = Math.ceil(maxX - minX);
    this._H = Math.ceil(maxY - minY);
  }

  _build() {
    this._layoutScene();
    const P = this._P, S = this._sheet, C = this._car;
    const label = this.getAttribute("label") ?? "Trinket";
    this.style.setProperty("--_noise", `url("${paperNoiseUrl()}")`);

    const plane = (cls, o, u, v, w, h, inner = "", extra = "") =>
      `<div class="tw-plane ${cls}" style="width:${w}px;height:${h}px;transform:${P.plane(o, u, v)};${extra}">${inner}</div>`;
    const flat = (cls, x, y, z, w, h, inner = "", extra = "") => plane(cls, [x, y, z], [1, 0, 0], [0, 1, 0], w, h, inner, extra);
    const sceneSvg = (inner, attrs = "") => `<svg class="tw-abs" ${attrs} style="width:${this._W}px;height:${this._H}px" viewBox="0 0 ${this._W} ${this._H}" aria-hidden="true">${inner}</svg>`;
    const hc = (o) => { const r = hCylinder(P, o); return `<defs>${r.defs}</defs>${r.body}`; };

    /* --- body --- */
    const b = BODY.base, wall = BODY.wall, D = BODY.deck, hood = BODY.hood;
    const bw = b.x1 - b.x0, bd = b.y1 - b.y0;
    const parts = [];
    parts.push(flat("tw-ground", b.x0 + 16, b.y0 + 26, -BODY.foot.h, bw, bd));
    parts.push(flat("tw-ground tw-contact", b.x0 + 4, b.y0 + 6, -BODY.foot.h, bw, bd));
    for (const [x, y] of [[b.x0 + 18, b.y1 - 10], [b.x1 - 18, b.y1 - 10]]) {
      parts.push(vCylinder(P, { cx: x, cy: y, r: BODY.foot.r, z0: -BODY.foot.h, z1: 0, side: BLACK_V }));
    }
    parts.push(flat("tw-lac tw-base-top", b.x0, b.y0, b.z, bw, bd));
    if (P.facing([-1, 0, 0])) parts.push(plane("tw-lac tw-base-side", [b.x0, b.y0, b.z], [0, 1, 0], [0, 0, -1], bd, b.z));
    if (P.facing([1, 0, 0])) parts.push(plane("tw-lac tw-base-side", [b.x1, b.y0, b.z], [0, 1, 0], [0, 0, -1], bd, b.z));
    parts.push(plane("tw-lac tw-base-front", [b.x0, b.y1, b.z], [1, 0, 0], [0, 0, -1], bw, b.z,
      `<svg class="tw-fill" viewBox="0 0 ${bw} ${b.z}" aria-hidden="true"><path d="M8 3 H${bw - 8}" style="stroke:var(--_trim)" stroke-width=".55" opacity=".8"/></svg>`));

    const keys = keyPositions(this._layout);
    this._keyPos = keys;
    const deckLen = Math.hypot(D.yF - D.yB, D.zF - D.zB);
    parts.push(plane("tw-lac tw-deck", [D.x0, D.yB, D.zB], [1, 0, 0], [0, (D.yF - D.yB) / deckLen, (D.zF - D.zB) / deckLen], D.x1 - D.x0, deckLen, deckSvg(keys)));
    parts.push(flat("tw-lac tw-hood-top", D.x0, hood.yB, hood.z, D.x1 - D.x0, hood.yF - hood.yB, hoodTopSvg()));
    const printable = this._layout.printable;
    this._barOf = new Map();
    const sorted = keys.filter((k) => k.key.kind === "char").sort((a, b2) => a.x - b2.x || a.row - b2.row);
    sorted.forEach((k, i) => this._barOf.set(k.key.code, i));
    this._nBars = printable.length;
    parts.push(plane("tw-lac tw-hood-front", HOOD_FRONT.o, HOOD_FRONT.u, HOOD_FRONT.v, HOOD_FRONT.w, HOOD_FRONT.h, fanSvg(this._nBars)));

    // side frames: outer faces, the inner band above the deck, and the rims
    const wy0 = 26, wz0 = BODY.hood.z + 4;
    const loc = ([y, z]) => `${y - wy0}px ${wz0 - z}px`;
    const outline = [...WALL_PROFILE.map(loc), `0px ${wz0 - b.z}px`, `${WALL_PROFILE[0][0] - wy0}px ${wz0 - b.z}px`];
    const band = [...WALL_PROFILE.slice(0, 4).map(loc), ...WALL_PROFILE.slice(0, 4).reverse().map(([y, z]) => loc([y, z - 5]))];
    const wallFace = (x, cls, poly) => plane(`tw-lac ${cls}`, [x, wy0, wz0], [0, 1, 0], [0, 0, -1], WALL_PROFILE[0][0] - wy0, wz0 - b.z, "", `clip-path:polygon(${poly.join(",")})`);
    const sides = [
      { outer: wall.xL, inner: wall.xL + wall.t, n: -1 },
      { outer: wall.xR, inner: wall.xR - wall.t, n: 1 },
    ];
    for (const s of sides) {
      if (P.facing([s.n, 0, 0])) parts.push(wallFace(s.outer, "tw-wall-out", outline));
      else parts.push(wallFace(s.inner, "tw-wall-in", band));
    }
    for (const s of sides) {
      const x0 = Math.min(s.outer, s.inner);
      for (let i = 0; i < WALL_PROFILE.length - 1; i++) {
        const [ya, za] = WALL_PROFILE[i], [yb, zb] = WALL_PROFILE[i + 1];
        const len = Math.hypot(yb - ya, zb - za);
        const n = [0, zb - za, -(yb - ya)];
        if (!P.facing(n)) continue;
        parts.push(plane("tw-lac tw-rim", [x0, ya, za], [1, 0, 0], [0, (yb - ya) / len, (zb - za) / len], wall.t, len + 0.6));
      }
    }
    const apronH = WALL_PROFILE[0][1] - b.z;
    parts.push(plane("tw-lac tw-apron", [wall.xL, D.yF, WALL_PROFILE[0][1]], [1, 0, 0], [0, 0, -1], wall.xR - wall.xL, apronH, apronSvg(label, wall.xR - wall.xL, apronH)));

    /* --- carriage (drawn at dx = 0, moved as a whole) --- */
    const car = [];
    const table = add(add(PAPER_BASE, NORMAL, -3), UP, 108);
    car.push(plane("tw-table", [C.sheetLeft - 6, table[1], table[2]], [1, 0, 0], [-UP[0], -UP[1], -UP[2]], S.w + 12, 100));
    const endplate = (x) => plane("tw-endplate", [x, PLATEN.y - 15, PLATEN.z + 17], [0, 1, 0], [0, 0, -1], 30, 26);
    const knob = (xa, xb, near) => {
      const body = hc({ x0: xa, x1: xb, y: PLATEN.y, z: PLATEN.z, r: 19, side: [[0, "#2e2a27"], [0.2, "#6b655e"], [0.36, "#26231f"], [1, "#070706"]], cap: "#161412", capStroke: "var(--_trim)", knurl: 12, knurlColor: "rgba(255,255,255,.08)" });
      const collar = hc({ x0: near ? xb - 1 : xa - 2, x1: near ? xb + 2 : xa + 1, y: PLATEN.y, z: PLATEN.z, r: 9, side: CHROME });
      return near ? collar + body : body + collar;
    };
    // far end (right) first, near end (left) last: the camera looks from the front-left
    car.push(P.facing([1, 0, 0]) ? "" : endplate(C.x1 + 2));
    car.push(sceneSvg(knob(C.x1 + 3, C.x1 + 18, false)));
    car.push(sceneSvg(
      hc({ x0: C.x0, x1: C.x1, y: PLATEN.y - 8, z: BODY.hood.z + 5, r: 3, side: CHROME }) +
      hc({ x0: C.x0, x1: C.x1, y: PLATEN.y, z: PLATEN.z, r: PLATEN.r, side: RUBBER, cap: "#191716", capStroke: "rgba(255,255,255,.12)" })));
    car.push(`<div class="tw-plane tw-sheet" part="sheet" data-sheet style="width:${S.w}px;height:${S.h}px;--_ml:${S.mL}px;--_lh:${S.lh}px;--_gx:${S.cw * 2}px;--_lines-y:${S.baseline(0) + 1.6 - S.lh + 0.45}px;--_grid-y:${S.baseline(0) + 2}px">
      <div class="tw-guides"></div><div class="tw-text" aria-hidden="true"></div><span class="tw-ghost"></span><div class="tw-sheet-light"></div><div class="tw-sheet-shade"></div>
      <button class="tw-hit tw-hit-rect" data-hit="paper" tabindex="-1" style="inset:0;cursor:text"></button></div>`);
    const bail = add(add(PRINT, UP, 41), NORMAL, 3.4);
    const armEnds = [C.x0 + 6, C.x1 - 6];
    const rollerX = [BODY.xc - S.w / 2 + 34, BODY.xc + S.w / 2 - 34];
    const arms = armEnds.map((x) => {
      const a = P.proj(x, bail[1], bail[2]), c = P.proj(x, PLATEN.y + 6, PLATEN.z + 6);
      return `<path d="M${a.x} ${a.y} L${c.x} ${c.y}" style="stroke:var(--_metal-mid)" stroke-width="2.2" stroke-linecap="round"/><path d="M${a.x} ${a.y} L${c.x} ${c.y}" style="stroke:var(--_metal-hi)" stroke-width=".7" stroke-linecap="round"/>`;
    }).join("");
    car.push(sceneSvg(arms +
      hc({ x0: armEnds[0], x1: armEnds[1], y: bail[1], z: bail[2], r: 1.7, side: CHROME }) +
      rollerX.map((x) => hc({ x0: x - 6, x1: x + 6, y: bail[1] + 0.6, z: bail[2], r: 3.3, side: RUBBER, cap: "#2a2725" })).join("")));
    // the line scale rides on the front rail of the carriage, under the platen
    car.push(plane("tw-scale", [C.sheetLeft + S.mL, PLATEN.y + PLATEN.r + 1.5, PLATEN.z - 7], [1, 0, 0], [0, 0, -1], S.columns * S.cw, 6, scaleSvg(S.columns, S.cw)));
    car.push(endplate(C.x0 - 2));
    car.push(sceneSvg(knob(C.x0 - 18, C.x0 - 3, true)));
    car.push(sceneSvg("", 'data-layer="lever"'));
    const kL = P.proj(C.x0 - 11, PLATEN.y, PLATEN.z), kR = P.proj(C.x1 + 11, PLATEN.y, PLATEN.z);
    const pad0 = P.p3([C.x0 - 6 - 52, PLATEN.y + 12 + 29, PLATEN.z + 10 + 15]);
    car.push(`<button class="tw-hit" data-hit="knob" tabindex="-1" style="left:${kL.x - 20}px;top:${kL.y - 20}px;width:40px;height:40px"></button>`);
    car.push(`<button class="tw-hit" data-hit="knob" tabindex="-1" style="left:${kR.x - 20}px;top:${kR.y - 20}px;width:40px;height:40px"></button>`);
    car.push(`<button class="tw-hit" data-hit="lever" tabindex="-1" style="left:${pad0.x - 22}px;top:${pad0.y - 16}px;width:52px;height:34px"></button>`);

    /* --- fixed parts in front of the carriage --- */
    const front = [];
    for (const sp of [...SPOOLS].sort((a, c) => P.depth(a.x, a.y) - P.depth(c.x, c.y))) {
      front.push(vCylinder(P, { cx: sp.x, cy: sp.y, r: SPOOL.r, z0: SPOOL.z0, z1: SPOOL.z1, side: BLACK_V }));
      front.push(flat("tw-spool-cap", sp.x - SPOOL.r + 1, sp.y - SPOOL.r + 1, SPOOL.z1 + 0.2, (SPOOL.r - 1) * 2, (SPOOL.r - 1) * 2, spoolCapSvg()));
    }
    front.push(sceneSvg("", 'data-layer="ribbon"'));
    front.push(sceneSvg(cardHolderSvgInner(P, S.cw)));
    front.push(sceneSvg("", 'data-layer="bars"'));

    /* --- keys --- */
    const stems = keys.map((k) => {
      const a = P.proj(k.x, k.y, k.z - 2.5), c = P.proj(k.x, k.y, zDeck(k.y));
      return `<path d="M${a.x} ${a.y} L${c.x} ${c.y}" stroke="#0b0a09" stroke-width="2.6"/><path d="M${a.x - 0.5} ${a.y} L${c.x - 0.5} ${c.y}" style="stroke:var(--_metal-mid)" stroke-width=".55" opacity=".7"/>`;
    }).join("");
    const spaceZ = zDeck(KEYS.space) + 8, spaceX = [88, 252];
    const spaceArms = spaceX.map((x) => {
      const a = P.proj(x + 10, KEYS.space - 2, spaceZ - 2), c = P.proj(x + 10, KEYS.space - 14, zDeck(KEYS.space - 14));
      return `<path d="M${a.x} ${a.y} L${c.x} ${c.y}" stroke="#0b0a09" stroke-width="2.4"/>`;
    }).join("");
    const keyEls = keys.slice().sort((a, c) => P.depth(a.x, a.y, a.z) - P.depth(c.x, c.y, c.z)).map((k) => {
      const r = KEYS.r;
      const lg = String(k.key.legend ?? "");
      const size = k.key.kind !== "char" ? (lg.length > 2 ? "data-tiny" : "") : lg.includes("\n") || [...lg].length > 1 ? "data-small" : "";
      return `<div class="tw-key" data-code="${esc(k.key.code)}">
        ${vCylinder(P, { cx: k.x, cy: k.y, r, z0: k.z - 2.6, z1: k.z, side: CHROME_V })}
        ${flat("tw-cap", k.x - r, k.y - r, k.z, r * 2, r * 2, `<div class="tw-glass" ${size}>${esc(lg)}</div><button class="tw-hit" tabindex="-1" data-key="${esc(k.key.code)}" style="inset:-3px"></button>`)}
      </div>`;
    }).join("");
    const sp0 = P.proj(spaceX[0], KEYS.space, spaceZ), sp1 = P.proj(spaceX[1], KEYS.space, spaceZ);
    const spaceBar = `<div class="tw-key" data-code="Space">${sceneSvg(hc({ x0: spaceX[0], x1: spaceX[1], y: KEYS.space, z: spaceZ, r: 3.8, side: CHROME, cap: "var(--_metal-mid)" }))}
      <button class="tw-hit tw-hit-rect" tabindex="-1" data-key="Space" style="left:${Math.min(sp0.x, sp1.x) - 4}px;top:${Math.min(sp0.y, sp1.y) - 9}px;width:${Math.abs(sp1.x - sp0.x) + 8}px;height:${Math.abs(sp1.y - sp0.y) + 16}px"></button></div>`;

    const ip = P.p3(PRINT);
    this._stage = document.createElement("div");
    this._stage.className = "tw-stage";
    this._stage.setAttribute("part", "stage");
    this._stage.style.aspectRatio = `${this._W} / ${this._H}`;
    this._stage.innerHTML = `
<div class="tw-scene" style="width:${this._W}px;height:${this._H}px">
  ${parts.join("")}
  <div class="tw-carriage" data-layer="carriage">${car.join("")}</div>
  ${front.join("")}
  ${sceneSvg(stems + spaceArms)}
  ${keyEls}
  ${spaceBar}
  <textarea class="tw-input" style="left:${ip.x}px;top:${ip.y - 12}px" rows="1" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="enter"></textarea>
</div>
<pre class="tw-sr" aria-live="polite"></pre>`;
    this.shadowRoot.append(this._stage);

    const $ = (s) => this._stage.querySelector(s);
    this._scene = $(".tw-scene");
    this._carriageEl = $('[data-layer="carriage"]');
    this._sheetEl = $("[data-sheet]");
    this._textEl = this._sheetEl.querySelector(".tw-text");
    this._ghost = this._sheetEl.querySelector(".tw-ghost");
    this._shade = this._sheetEl.querySelector(".tw-sheet-shade");
    this._leverEl = $('[data-layer="lever"]');
    this._ribbonEl = $('[data-layer="ribbon"]');
    this._barsEl = $('[data-layer="bars"]');
    this._segment = $("[data-segment]");
    this._input = $(".tw-input");
    this._sr = $(".tw-sr");
    this._fanBars = new Map([...this._stage.querySelectorAll("[data-bar]")].map((g) => [Number(g.dataset.bar), g]));
    this._keyEls = new Map([...this._stage.querySelectorAll(".tw-key")].map((el) => [el.dataset.code, el]));
    this._keyState = new Map([...this._keyEls.keys()].map((code) => [code, { v: 0, down: false, release: 0, el: this._keyEls.get(code) }]));
    this._glyphEls = new Map();
    this._leverEl.innerHTML = leverSvgInner(P, C, 0);
    this._ribbonEl.innerHTML = ribbonSvgInner(P, 0);
    this._bindInput();
    this._applyLabels();
  }

  _rebuild() {
    this._stage?.remove();
    this._resize?.disconnect();
    this._flights.length = 0;
    this._build();
    this._resetVisuals();
    for (const row of this._core.lines) for (const g of row) this._addGlyph(g, false);
    if (this.isConnected) {
      this._resize = new ResizeObserver(() => this._measure());
      this._resize.observe(this._stage);
      this._measure();
    }
    this._render(true);
  }

  _applyLabels() {
    const L = this._labels;
    this._input?.setAttribute("aria-label", L.machine);
    for (const b of this._stage.querySelectorAll('[data-hit="lever"]')) b.setAttribute("aria-label", L.lever);
    for (const b of this._stage.querySelectorAll('[data-hit="knob"]')) b.setAttribute("aria-label", L.knob);
    this._stage.querySelector('[data-hit="paper"]')?.setAttribute("aria-label", L.paper);
    this._stage.querySelector('[data-key="Space"]')?.setAttribute("aria-label", L.space);
    for (const b of this._stage.querySelectorAll("[data-key]")) {
      if (b.dataset.key === "Space") continue;
      const key = this._layout.byCode.get(b.dataset.key);
      b.setAttribute("aria-label", key?.kind === "char" ? key.char : key?.legend || b.dataset.key);
    }
  }

  _measure() {
    const w = this._stage.getBoundingClientRect().width || this._W;
    this._k = w / this._W;
    this.style.setProperty("--_k", String(this._k));
  }

  _resetVisuals() {
    this._textEl.replaceChildren();
    this._glyphEls.clear();
    this._dx = this._dxTarget = carriageOffset(this._sheet, this._core.column);
    this._dxVel = 0;
    this._carTween = null;
    this._feed = this._feedTarget = this._sheet.baseline(this._core.line);
    this._feedVel = 0;
    this._feedTween = null;
    this._sheetOpacity = 1;
    this._sheetEl.style.visibility = this._core.hasSheet ? "" : "hidden";
    this._render(true);
  }

  /* --------------------------------------------------------------- input */

  _bindInput() {
    const st = this._stage;
    st.addEventListener("pointerdown", (e) => {
      this._sound.unlock();
      const keyBtn = e.target.closest?.("[data-key]");
      const hit = e.target.closest?.("[data-hit]");
      if (keyBtn) {
        e.preventDefault();
        if (e.pointerType === "mouse") this._focusInput();
        keyBtn.setPointerCapture?.(e.pointerId);
        this._pointerKey = { id: e.pointerId, code: keyBtn.dataset.key };
        this._keyDown(keyBtn.dataset.key, "pointer");
        return;
      }
      if (hit) {
        e.preventDefault();
        const what = hit.dataset.hit;
        if (what === "lever") { this._focusInput(e.pointerType === "mouse"); if (!this.hasAttribute("readonly")) this.carriageReturn(); }
        else if (what === "knob") { this._focusInput(e.pointerType === "mouse"); if (!this.hasAttribute("readonly")) this.lineFeed(1); }
        else if (what === "paper") this._focusInput(true);
        return;
      }
      if (e.pointerType === "mouse") { e.preventDefault(); this._focusInput(); }
    }, { capture: false });
    const upKey = (e) => {
      if (this._pointerKey?.id === e.pointerId) { this._keyUp(this._pointerKey.code); this._pointerKey = null; }
    };
    st.addEventListener("pointerup", upKey);
    st.addEventListener("pointercancel", upKey);
    st.addEventListener("lostpointercapture", upKey);

    const inp = this._input;
    const SENTINEL = "​";
    const resetInput = () => { inp.value = SENTINEL; try { inp.setSelectionRange(1, 1); } catch { /* not focused */ } };
    resetInput();
    inp.addEventListener("focus", () => { resetInput(); this.toggleAttribute("focused", true); this._emit("focus"); });
    inp.addEventListener("blur", () => { this.toggleAttribute("focused", false); this._releaseAllKeys(); this._setGhost(""); this._emit("blur"); });
    inp.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey && e.key.length !== 1 && e.key !== "Dead") return;
      this._sound.unlock();
      const code = e.code;
      if (e.isComposing || e.keyCode === 229) { if (code) this._keyDown(code, "keyboard-visual"); return; }
      if (code === "Tab") { e.preventDefault(); if (!e.repeat) this._keyDown(code, "keyboard-fn"); return; }
      if (code === "Escape") { inp.blur(); return; }
      if (!e.repeat || !this._keyState.get(code)?.down) this._keyDown(code, "keyboard");
      if (code === "ShiftLeft" || code === "ShiftRight") return;
      this._lastCode = { code, at: now() };
    });
    inp.addEventListener("keyup", (e) => {
      this._keyUp(e.code);
      if (e.key === "CapsLock" || e.code === "CapsLock") this._setLock(e.getModifierState?.("CapsLock"));
    });
    inp.addEventListener("beforeinput", (e) => {
      if (this.hasAttribute("readonly")) { e.preventDefault(); return; }
      const t = e.inputType;
      if (e.isComposing || t === "insertCompositionText" || t === "deleteCompositionText" || t === "insertFromComposition") return;
      e.preventDefault();
      if (t === "insertText" || t === "insertReplacementText") this._typeFromInput(e.data ?? e.dataTransfer?.getData("text/plain") ?? "");
      else if (t === "insertLineBreak" || t === "insertParagraph") this._enqueue({ kind: "return", source: "keyboard" });
      else if (t === "deleteContentBackward" || t === "deleteWordBackward") this._enqueue({ kind: "back", source: "keyboard" });
      else if (t === "insertFromPaste" || t === "insertFromDrop") this._typeFromInput(e.dataTransfer?.getData("text/plain") ?? e.data ?? "", { paste: true });
    });
    inp.addEventListener("input", (e) => {
      // fallback for browsers without beforeinput: whatever landed in the box gets typed
      if (this._composing || e.isComposing) return;
      const v = inp.value.replaceAll(SENTINEL, "");
      if (v) this._typeFromInput(v);
      resetInput();
    });
    inp.addEventListener("compositionstart", () => { this._composing = true; });
    inp.addEventListener("compositionupdate", (e) => this._setGhost(e.data || ""));
    inp.addEventListener("compositionend", (e) => {
      this._composing = false;
      this._setGhost("");
      if (!this.hasAttribute("readonly") && e.data) this._typeFromInput(e.data, { ime: true });
      setTimeout(resetInput, 0);
    });
  }

  _focusInput(force = true) {
    if (!force || this.getAttribute("keyboard") === "off") return;
    if (this.shadowRoot.activeElement !== this._input) this._input.focus({ preventScroll: true });
  }

  _typeFromInput(text, { paste = false, ime = false } = {}) {
    if (!text) return;
    const list = graphemes(text);
    const recent = this._lastCode && now() - this._lastCode.at < 0.5 && list.length === 1 && !ime ? this._lastCode.code : null;
    this._lastCode = null;
    for (const g of list) this._enqueueGrapheme(g, paste ? "paste" : "keyboard", recent);
  }

  _enqueueGrapheme(g, source, code = null) {
    if (g === "\n") return this._enqueue({ kind: "return", source });
    if (g === "\r") return;
    if (g === "\t") return this._enqueue({ kind: "tab", source });
    if (g === " " || g === "　") return this._enqueue({ kind: "space", source, wide: g === "　" });
    if (/^\p{Cc}$/u.test(g)) return;
    this._enqueue({ kind: "char", ch: g, source, code });
  }

  _setGhost(text) {
    this._ghost.textContent = text;
    if (!text) return;
    const S = this._sheet;
    this._ghost.style.left = `${S.cellX(this._core.column)}px`;
    this._ghost.style.top = `${S.baseline(this._core.line) - S.fs * 0.8}px`;
    this._ghost.style.fontSize = `${S.fs}px`;
  }

  _setLock(on) {
    on = !!on;
    if (on === this._core.lock) return;
    this._core.setLock(on);
    this._sound.shift(on);
    this._wake();
  }

  /* ------------------------------------------------------------- keys */

  _keyDown(code, source) {
    const alias = ALIASES[code];
    if (alias === "return") {
      if (source === "pointer" || source === "api") this.carriageReturn();
      return;
    }
    if (alias === "space" || code === "Space") {
      this._pressCap("Space");
      if (source === "pointer" || source === "api") this._enqueue({ kind: "space", source, visual: true });
      else this._sound.key(0.8);
      return;
    }
    const key = this._layout.byCode.get(alias || code);
    if (!key) return;
    if (key.kind === "shift") {
      if (!this._core.shift) { this._core.setShift(true); this._sound.shift(true); }
      this._pressCap(key.code);
      return;
    }
    if (key.kind === "lock") {
      this._pressCap(key.code);
      if (source === "pointer" || source === "api") this._setLock(!this._core.lock);
      return;
    }
    this._pressCap(key.code);
    if (source === "keyboard" || source === "keyboard-visual") { this._sound.key(source === "keyboard-visual" ? 0.6 : 0.85); return; }
    if (source === "keyboard-fn") {
      this._sound.key(0.8);
      if (key.kind === "tab") this._enqueue({ kind: "tab", source, visual: true });
      return;
    }
    // pointer / api: the cap itself decides what is typed
    if (this.hasAttribute("readonly")) return;
    if (key.kind === "char") {
      const upper = this._core.shift || this._core.lock;
      this._enqueue({ kind: "char", ch: upper ? key.shift : key.char, source, code: key.code, visual: true });
    } else if (key.kind === "back") this._enqueue({ kind: "back", source, visual: true });
    else if (key.kind === "tab") this._enqueue({ kind: "tab", source, visual: true });
  }

  _keyUp(code) {
    const alias = ALIASES[code];
    const c = alias === "space" ? "Space" : this._layout.byCode.get(alias || code)?.code || code;
    const st = this._keyState.get(c);
    const key = this._layout.byCode.get(c);
    if (key?.kind === "lock" && this._core.lock) return; // a locked shift lock stays down
    if (st) { st.down = false; this._wake(); }
    if (key?.kind === "shift") {
      const other = [...this._keyState.entries()].some(([k, s]) => k !== c && s.down && this._layout.byCode.get(k)?.kind === "shift");
      if (!other && this._core.shift) { this._core.setShift(false); this._sound.shift(false); }
    }
  }

  _pressCap(code, auto = false) {
    const st = this._keyState.get(code);
    if (!st) return;
    st.down = true;
    st.release = auto ? now() + T.autoRelease : 0;
    this._wake();
  }

  _releaseAllKeys() {
    for (const [code, st] of this._keyState) {
      if (this._layout.byCode.get(code)?.kind === "lock" && this._core.lock) continue;
      st.down = false;
    }
    if (this._core.shift) this._core.setShift(false);
    this._wake();
  }

  /* -------------------------------------------------------------- queue */

  _enqueue(op) {
    if (this.hasAttribute("readonly") && op.source !== "api" && !op.resolve) return;
    this._queue.push(op);
    this._wake();
  }

  _drain() {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => { this._queueWaiters.push(resolve); this._wake(); });
  }

  /** A pause that also ends when the element is taken off the page. */
  _sleep(ms, signal) {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(id);
        const i = this._sleepers.indexOf(done);
        if (i >= 0) this._sleepers.splice(i, 1);
        resolve();
      };
      const id = setTimeout(done, ms);
      this._sleepers.push(done);
      signal?.addEventListener?.("abort", done, { once: true });
    });
  }

  _pump(t) {
    let guard = 0;
    while (this._queue.length && t >= this._busyUntil && guard++ < 8) this._exec(this._queue.shift(), t);
    if (!this.busy && this._queueWaiters.length) {
      const w = this._queueWaiters.splice(0);
      for (const fn of w) fn();
    }
  }

  _exec(op, t) {
    const core = this._core;
    const S = this._sheet;
    if (!core.hasSheet && !["insert", "eject"].includes(op.kind)) {
      this._queue.unshift(op);
      this._exec({ kind: "insert", auto: true }, t);
      return;
    }
    switch (op.kind) {
      case "char": {
        const w = charWidth(op.ch);
        if (core.needsReturn(w)) {
          if (core.config.lineEnd === "wrap") {
            if (!core.canReturn()) return this._pageFull(op, t);
            this._queue.unshift(op);
            return this._exec({ kind: "return", auto: true }, t);
          }
          this._sound.jam();
          this._emit("lineend", { char: op.ch, line: core.line, column: core.column });
          this._busyUntil = t + 0.06;
          return;
        }
        const res = core.strike(op.ch);
        if (!res.glyph) return;
        const el = this._addGlyph(res.glyph, true);
        const hint = op.code ? this._layout.byCode.get(op.code) : null;
        const key = hint?.kind === "char" ? hint : keyForChar(this._layout, op.ch)?.key;
        if (key && (op.source === "api" || op.source === "paste" || (op.source === "keyboard" && !op.code))) {
          this._pressCap(key.code, true);
          this._sound.key(0.7);
        }
        const bar = key ? this._barOf.get(key.code) ?? 0 : 0;
        this._flights.push({ bar, t0: t, el, glyph: res.glyph, dx: carriageOffset(S, res.column), bell: res.bell, struck: false });
        this._busyUntil = t + T.gap;
        return;
      }
      case "space": {
        // a full-width space 「　」 is one keystroke that takes two cells
        if (core.needsReturn(op.wide ? 2 : 1)) {
          if (core.config.lineEnd === "wrap" && core.canReturn()) return this._exec({ kind: "return", auto: true }, t);
          if (core.config.lineEnd === "lock") { this._sound.jam(); this._emit("lineend", { char: op.wide ? IDEO_SPACE : " ", line: core.line, column: core.column }); }
          return;
        }
        if (!op.visual && op.source !== "keyboard") this._pressCap("Space", true);
        const res = op.wide ? this._wideSpace() : core.space();
        this._dxTarget = carriageOffset(S, res.column);
        this._sound.space();
        if (res.bell) this._bell();
        this._emit("space", { line: res.line, column: res.column, wide: !!op.wide });
        if (op.wide) this._changed();
        this._busyUntil = t + T.gap;
        return;
      }
      case "tab": {
        if (op.source !== "keyboard-fn" && !op.visual) this._pressCap("Tab", true);
        const res = core.tab();
        this._dxTarget = carriageOffset(S, res.column);
        this._sound.escape();
        if (res.bell) this._bell();
        this._busyUntil = t + 0.08;
        return;
      }
      case "back": {
        if (!op.visual && op.source !== "keyboard") this._pressCap("Backspace", true);
        const res = core.backspace();
        if (res.erased) {
          const el = this._glyphEls.get(res.erased.id);
          if (el) {
            this._glyphEls.delete(res.erased.id);
            el.classList.remove("tw-fresh");
            el.classList.add("tw-erased");
            setTimeout(() => el.remove(), 320);
          }
          this._sound.erase();
        } else if (res.moved) this._sound.escape();
        if (res.lineUp) { this._feedTarget = S.baseline(res.line); this._sound.lineFeed(); }
        this._dxTarget = carriageOffset(S, res.column);
        this._emit("backspace", { line: res.line, column: res.column, erased: res.erased?.ch ?? null });
        this._changed();
        this._busyUntil = t + 0.05;
        return;
      }
      case "return": {
        if (!core.canReturn()) return this._pageFull(op, t);
        const res = core.carriageReturn();
        const to = carriageOffset(S, 0);
        const dist = Math.abs(to - this._dx);
        const dur = clamp(0.12 + dist * 0.0021, 0.14, 0.6);
        this._carTween = { from: this._dx, to, t0: t + 0.06, dur };
        this._lever = { t0: t, dur: 0.34 };
        this._feedTarget = S.baseline(res.line);
        this._sound.carriageReturn(dur);
        this._emit("return", { line: res.line, auto: !!op.auto });
        this._changed();
        this._busyUntil = t + 0.06 + dur * 0.92;
        return;
      }
      case "feed": {
        const res = core.lineFeed(1);
        if (!res.fed) return this._pageFull(op, t);
        this._feedTarget = S.baseline(res.line);
        this._sound.lineFeed();
        this._emit("linefeed", { line: res.line });
        this._changed();
        this._busyUntil = t + 0.09;
        return;
      }
      case "eject": {
        if (!core.hasSheet) { op.resolve?.(null); return; }
        const { page } = core.eject();
        this._feedTween = { from: this._feed, to: S.h + 40, t0: t, dur: 0.75, fade: true, done: () => {
          this._sheetEl.style.visibility = "hidden";
          this._textEl.replaceChildren();
          this._glyphEls.clear();
          this._emit("eject", { page });
          op.resolve?.(page);
        } };
        this._sound.paper(0.7);
        this._busyUntil = t + 0.8;
        return;
      }
      case "insert": {
        core.insert();
        this._textEl.replaceChildren();
        this._glyphEls.clear();
        this._sheetEl.style.visibility = "";
        this._sheetOpacity = 1;
        this._feed = -16;
        this._feedTween = { from: -16, to: S.baseline(0), t0: t, dur: 0.6, done: () => { this._emit("sheet"); op.resolve?.(); } };
        this._carTween = { from: this._dx, to: carriageOffset(S, 0), t0: t, dur: 0.4 };
        this._sound.paper(0.55);
        this._changed();
        this._busyUntil = t + 0.65;
        return;
      }
    }
  }

  _pageFull(op, t) {
    if (this.getAttribute("page-end") === "new") {
      // Roll this sheet out, feed a new one, then carry on with the character
      // that did not fit and everything queued behind it. A return / line feed
      // that hit the bottom is used up by the fresh sheet starting at line 1.
      const carry = op.kind === "return" || op.kind === "feed" ? [] : [op];
      this._queue.unshift({ kind: "eject" }, { kind: "insert" }, ...carry);
      this._busyUntil = t;
      this._emit("pagefull", { line: this._core.line, auto: true, dropped: "" });
      return;
    }
    // Stop at the bottom: the keystrokes that were on their way are dropped
    // (and reported), but sheet operations someone is awaiting still run.
    const rest = this._queue.splice(0);
    const dropped = [op, ...rest].map(opText).join("");
    this._queue.push(...rest.filter((o) => o.kind === "eject" || o.kind === "insert"));
    this._sound.jam();
    this._emit("pagefull", { line: this._core.line, dropped });
    this._busyUntil = t + 0.1;
  }

  /** 「　」: recorded as a blank two-cell glyph so text, wrapping and correction treat it as one character. */
  _wideSpace() {
    const res = this._core.strike(IDEO_SPACE);
    if (res.glyph) this._addGlyph(res.glyph, false);
    return res;
  }

  /** print() reached the bottom of the sheet. With page-end="new", swap sheets instantly; returns false to stop. */
  _instantPageEnd() {
    if (this.getAttribute("page-end") !== "new") return false;
    const { page } = this._core.eject();
    this._emit("pagefull", { line: this._core.line, auto: true, dropped: "" });
    this._emit("eject", { page });
    this._core.insert();
    this._textEl.replaceChildren();
    this._glyphEls.clear();
    this._emit("sheet");
    return true;
  }

  _bell() {
    this._sound.bell();
    this._emit("bell", { line: this._core.line, column: this._core.column });
  }

  _instant(g) {
    const core = this._core;
    if (!core.hasSheet) { core.insert(); this._sheetEl.style.visibility = ""; }
    if (g === "\r") return;
    if (g === "\n") {
      if (core.canReturn()) core.carriageReturn();
      else this._instantPageEnd(); // the new sheet already starts at the top
      return;
    }
    if (g === "\t") { core.tab(); return; }
    if (g === " " || g === IDEO_SPACE) {
      const wide = g === IDEO_SPACE;
      if (core.needsReturn(wide ? 2 : 1)) {
        if (core.config.lineEnd === "wrap" && core.canReturn()) core.carriageReturn();
        return; // like a real margin, a space at the end of a line (or of the page) is swallowed
      }
      if (wide) this._wideSpace(); else core.space();
      return;
    }
    if (/^\p{Cc}$/u.test(g)) return;
    const w = charWidth(g);
    if (core.needsReturn(w)) {
      if (core.config.lineEnd !== "wrap") return;
      if (core.canReturn()) core.carriageReturn();
      else if (!this._instantPageEnd()) return;
    }
    const res = core.strike(g);
    if (res.glyph) this._addGlyph(res.glyph, false);
  }

  _addGlyph(g, pending) {
    const S = this._sheet;
    const el = document.createElement("span");
    el.className = "tw-g";
    el.textContent = g.ch;
    const wide = g.w === 2;
    el.style.left = `${S.cellX(g.col) + (g.w * S.cw) / 2 + g.jx}px`;
    el.style.top = `${S.baseline(g.line) - S.fs * (wide ? 0.84 : 0.8) + g.jy}px`;
    el.style.fontSize = `${wide ? S.fs * 0.98 : S.fs}px`;
    el.style.setProperty("--r", `${g.rot.toFixed(2)}deg`);
    el.style.setProperty("--o", g.ink.toFixed(3));
    el.style.setProperty("--a", `${g.tilt}deg`);
    el.style.setProperty("--f", g.fade.toFixed(2));
    if (g.rtl) el.dataset.rtl = "";
    if (pending) el.style.visibility = "hidden";
    this._textEl.append(el);
    this._glyphEls.set(g.id, el);
    return el;
  }

  _changed() {
    if (this._changeQueued) return;
    this._changeQueued = true;
    queueMicrotask(() => {
      this._changeQueued = false;
      const text = this.text;
      if (this._sr) this._sr.textContent = text;
      this._emit("change", { text, line: this._core.line, column: this._core.column });
    });
  }

  /* ---------------------------------------------------------------- loop */

  _wake() {
    if (this._raf || !this.isConnected) return;
    this._lastT = now();
    this._raf = requestAnimationFrame(() => this._frame());
  }

  _frame() {
    this._raf = 0;
    const t = now();
    const dt = clamp(t - this._lastT, 0, 1 / 30);
    this._lastT = t;
    this._pump(t);
    const active = this._step(t, dt);
    this._render(false);
    if (active || this._queue.length || this._queueWaiters.length) this._raf = requestAnimationFrame(() => this._frame());
  }

  _step(t, dt) {
    let active = false;
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // key caps
    for (const st of this._keyState.values()) {
      if (st.down && st.release && t >= st.release) { st.down = false; st.release = 0; }
      const target = st.down ? 1 : 0;
      if (st.v !== target) {
        const sp = dt / (target ? T.keyDown : T.keyUp);
        st.v = target ? Math.min(1, st.v + sp) : Math.max(0, st.v - sp);
        st.dirty = true;
        active = true;
      }
      if (st.down) active = true;
    }

    // typebars
    let lift = 0;
    for (const fl of this._flights) {
      const e = t - fl.t0;
      if (!fl.struck && e >= T.up) {
        fl.struck = true;
        fl.el.style.visibility = "";
        if (!reduce) fl.el.classList.add("tw-fresh");
        this._sound.strike(0.85 + Math.random() * 0.25);
        this._dxTarget = fl.dx;
        this._emit("type", { char: fl.glyph.ch, line: fl.glyph.line, column: fl.glyph.col });
        if (fl.bell) this._bell();
        this._changed();
      }
      const p = e < T.up ? easeIn(e / T.up) : Math.max(0, 1 - (e - T.up) / T.back);
      fl.p = p;
      lift = Math.max(lift, p);
    }
    this._flights = this._flights.filter((fl) => t - fl.t0 < T.up + T.back);
    if (this._flights.length) active = true;
    const liftChanged = Math.abs(lift - this._lift) > 1e-3;
    this._lift = lift;
    this._liftDirty = liftChanged || this._flights.length > 0 || this._barsShown;

    // carriage
    if (this._carTween) {
      const tw = this._carTween;
      const u = clamp((t - tw.t0) / tw.dur, 0, 1);
      if (t >= tw.t0) this._dx = tw.from + (tw.to - tw.from) * easeInOut(u);
      if (u >= 1) {
        this._carTween = null;
        this._dxTarget = tw.to;
        this._dxVel = (tw.to - tw.from) > 0 ? 40 : -40; // a little bounce at the stop
      }
      active = true;
    } else {
      const k = 2600, c = 2 * Math.sqrt(k) * 0.5;
      const a = -k * (this._dx - this._dxTarget) - c * this._dxVel;
      this._dxVel += a * dt;
      this._dx += this._dxVel * dt;
      if (Math.abs(this._dx - this._dxTarget) < 0.01 && Math.abs(this._dxVel) < 0.05) { this._dx = this._dxTarget; this._dxVel = 0; }
      else active = true;
    }

    // paper feed
    if (this._feedTween) {
      const tw = this._feedTween;
      const u = clamp((t - tw.t0) / tw.dur, 0, 1);
      this._feed = tw.from + (tw.to - tw.from) * easeInOut(u);
      if (tw.fade) this._sheetOpacity = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      if (u >= 1) {
        this._feedTween = null;
        this._feedTarget = this._core.hasSheet ? this._feed : this._sheet.baseline(0);
        if (!this._core.hasSheet) this._feed = this._feedTarget;
        this._sheetOpacity = 1;
        tw.done?.();
      }
      active = true;
    } else {
      const k = 700, c = 2 * Math.sqrt(k) * 0.82;
      const a = -k * (this._feed - this._feedTarget) - c * this._feedVel;
      this._feedVel += a * dt;
      this._feed += this._feedVel * dt;
      if (Math.abs(this._feed - this._feedTarget) < 0.01 && Math.abs(this._feedVel) < 0.05) { this._feed = this._feedTarget; this._feedVel = 0; }
      else active = true;
    }

    // lever
    if (this._lever) {
      const u = (t - this._lever.t0) / this._lever.dur;
      this._leverAngle = u >= 1 ? 0 : Math.sin(Math.min(1, u) * Math.PI) * 26;
      if (u >= 1) this._lever = null;
      this._leverDirty = true;
      active = true;
    }

    // segment shift
    const shiftT = this._core.shift || this._core.lock ? 1 : 0;
    if (this._shiftV !== shiftT) {
      const sp = dt / 0.06;
      this._shiftV = shiftT ? Math.min(1, this._shiftV + sp) : Math.max(0, this._shiftV - sp);
      this._shiftDirty = true;
      active = true;
    }
    return active;
  }

  _render(force) {
    if (!this._built) return;
    const P = this._P, S = this._sheet;
    const sa = P.sinTilt;
    for (const st of this._keyState.values()) {
      if (!st.dirty && !force) continue;
      st.dirty = false;
      st.el.style.transform = st.v ? `translateY(${(st.v * KEYS.travel * sa).toFixed(3)}px)` : "";
    }
    const sh = P.shiftX(this._dx);
    this._carriageEl.style.transform = `translate(${sh.x.toFixed(3)}px, ${sh.y.toFixed(3)}px)`;

    // sheet: the line at the print point is at "feed"
    const o = add(PRINT, UP, this._feed);
    this._sheetEl.style.transform = P.plane([this._car.sheetLeft, o[1], o[2]], [1, 0, 0], [-UP[0], -UP[1], -UP[2]]);
    const below = S.h - (this._feed + 12);
    this._sheetEl.style.clipPath = below > 0 ? `inset(0 0 ${below.toFixed(2)}px 0)` : "";
    this._shade.style.top = `${(this._feed + 12 - 18).toFixed(2)}px`;
    this._shade.style.opacity = below > 0 ? "1" : "0";
    this._sheetEl.style.opacity = this._sheetOpacity < 1 ? this._sheetOpacity.toFixed(3) : "";

    if (this._leverDirty || force) {
      this._leverDirty = false;
      this._leverEl.innerHTML = leverSvgInner(P, this._car, this._leverAngle || 0);
    }
    if (this._liftDirty || force) {
      this._liftDirty = false;
      this._ribbonEl.innerHTML = ribbonSvgInner(P, this._lift);
      const shown = new Set();
      let html = "";
      for (const fl of this._flights) {
        shown.add(fl.bar);
        html += typebarSvgInner(P, fl.bar, this._nBars, fl.p ?? 0);
      }
      this._barsEl.innerHTML = html;
      for (const [i, g] of this._fanBars) g.style.visibility = shown.has(i) ? "hidden" : "";
      this._barsShown = shown.size > 0;
    }
    if (this._shiftDirty || force) {
      this._shiftDirty = false;
      this._segment.style.transform = this._shiftV ? `translateY(${(this._shiftV * 2.2).toFixed(2)}px)` : "";
    }
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

const IDEO_SPACE = "\u3000";

/** The text a queued keystroke would have printed (for pagefull's `dropped`). */
function opText(o) {
  if (o.kind === "char") return o.ch;
  if (o.kind === "space") return o.wide ? IDEO_SPACE : " ";
  if (o.kind === "tab") return "\t";
  if (o.kind === "return") return "\n";
  return "";
}

if (!customElements.get("trinket-typewriter")) customElements.define("trinket-typewriter", TrinketTypewriter);
