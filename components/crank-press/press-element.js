import { createPress, PRESS_DEFAULTS, TAU } from "./press-core.js";
import {
  CAMERA, XC, BASE, FRAMES, ROLLER, LOWER, MAX_SHEET_W, GEARS, WHEEL, CRANK, HANDLE, CROSSBAR, TIE_ROD, GUIDE, TRAY,
  OUTFEED, INFEED, REACH, FRAME_BOX, CURL,
  pathSegments, pathPoint, createProjector, faceShade, latheX, vCylinder, hCylinder, BRASS, STEEL, WOOD,
  frameSvg, extrusionSvg, wearDash, wheelRimSvg, wheelSpokesSvg, gearSvg, crankArmSvg, plateSvg, stripeSvg, guideSvg, circlePathX, f, esc,
} from "./press-art.js";
import { PATTERNS, PATTERN_NAMES, PAPERS, bakeTiles, rgbOf, paperNoiseUrl, castNoiseUrl, castGrainUrl, deckle, patternPreview } from "./press-patterns.js";
import { createPressSound } from "./sound.js";
import { PRESS_CSS, FLAT_SHEET_CSS } from "./style.js";

export { createPress, PRESS_DEFAULTS, PATTERNS, PATTERN_NAMES, PAPERS, patternPreview };

/** Sheet content is laid out at 2 CSS px per sheet unit (crisp text, no minimum-font-size issues). */
export const SHEET_SCALE = 2;
const PX = SHEET_SCALE;
const SHEET_DEFAULTS = { width: 200, length: 440 };
const DEFAULT_LABELS = {
  crank: "Hand crank. Drag the wheel round, or hold the right arrow key to turn",
  sheet: "Pressed sheet. Tap to take it",
};
const INKS = { black: "#2c2622", red: "#a3262c", blue: "#27396e", brown: "#5a3820", green: "#26493a", gold: "#a8823c" };
const RPS = 1.15; // default motor speed, turns per second
const ROLLER_SHADE = [[0, "rgba(30,18,6,.7)"], [0.06, "rgba(30,18,6,.36)"], [0.14, "rgba(30,18,6,.06)"], [0.22, "rgba(255,248,232,.16)"], [0.28, "rgba(255,248,232,.34)"], [0.34, "rgba(255,248,232,.12)"], [0.46, "rgba(0,0,0,0)"], [0.7, "rgba(30,18,6,.14)"], [0.86, "rgba(30,18,6,.3)"], [0.93, "rgba(255,240,210,.08)"], [1, "rgba(30,18,6,.66)"]];
const STEEL_DIM = [[0, "#1d150d"], [0.3, "var(--_steel-dark)"], [0.48, "color-mix(in oklab, var(--_steel-mid), #1d150d 30%)"], [0.7, "var(--_steel-dark)"], [1, "#140d06"]];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (a, n) => ((a % n) + n) % n;
const wrapPi = (a) => mod(a + Math.PI, TAU) - Math.PI;
const now = () => performance.now() / 1000;

export class TrinketPress extends HTMLElement {
  static get observedAttributes() {
    return ["theme", "roller", "letter", "impression", "ink", "label", "sublabel", "sfx", "muted", "volume", "locked"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PRESS_CSS;
    this.shadowRoot.append(style);

    this._labels = { ...DEFAULT_LABELS };
    this._uid = "pr" + Math.random().toString(36).slice(2, 7);
    this._core = createPress();
    this._sound = createPressSound();
    this._pattern = null;
    this._spec = null;
    this._sheetDom = null;
    this._rec = null;          // the current sheet's pending promises: { grip: [], out: [] }
    this._arrive = new Map();  // motor id → resolve(crank promise)
    this._motorId = 0;
    this._raf = 0;
    this._lastT = 0;
    this._lastS = null;
    this._crunchAt = 0;
    this._drag = null;
    this._keyDrive = false;
    this._core.subscribe((type, d) => this._onCore(type, d));
    let resolve;
    this._ready = new Promise((r) => { resolve = r; });
    this._resolveReady = resolve;
  }

  /* ------------------------------------------------------------ lifecycle */

  connectedCallback() {
    if (!this._built) {
      this._built = true;
      this._adoptSheetStyles();
      this._build();
      this._applyAttributes();
      this._retexture();
      this._render(true);
      this._resolveReady(this);
      queueMicrotask(() => {
        this._emit("ready");
        if (this.hasAttribute("autoload")) this.load(this.getAttribute("autoload") || undefined);
      });
    }
    clearTimeout(this._detachTimer);
    this._resize?.disconnect();
    this._resize = new ResizeObserver(() => this._measure());
    this._resize.observe(this._stage);
    this._measure();
    this._render(true);
    this._wake(); // resume anything that was moving (a loading sheet, a crank in progress)
  }

  disconnectedCallback() {
    // pause at once; only give up if it is still detached after this task
    // (moving the element around the DOM detaches and re-attaches synchronously)
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._resize?.disconnect();
    this._sound.motion(0, false);
    clearTimeout(this._detachTimer);
    this._detachTimer = setTimeout(() => { if (!this.isConnected) this._suspend(); }, 0);
  }

  /** Removed for good: stop the motor (its crank() settles false), drop the hand, silence. */
  _suspend() {
    this._releaseHands();
    this._core.stop();
    this._sound.motion(0, false);
    this._sound.destroy();
  }

  _releaseHands() {
    if (this._drag) {
      this._drag = null;
      this._stage?.toggleAttribute("data-cranking", false);
      this._core.release();
    }
    if (this._keyDrive) { this._keyDrive = false; this._core.stop(); }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this._built || oldValue === newValue) return;
    if (name === "locked" && newValue !== null) { this._releaseHands(); this._core.stop(); }
    if (name === "label" || name === "sublabel") { this._rebuild(); return; }
    if (["theme", "roller", "letter", "impression", "ink"].includes(name)) {
      this._applyAttributes();
      requestAnimationFrame(() => { this._retexture(); this._render(true); });
      if (name === "roller") this._sound.swap();
      return;
    }
    this._applyAttributes();
  }

  _applyAttributes() {
    const ink = this.getAttribute("ink");
    if (ink) this.style.setProperty("--trinket-press-ink", INKS[ink] || ink);
    else this.style.removeProperty("--trinket-press-ink");
    this._sound.enabled = this.getAttribute("sfx") !== "off";
    this._sound.muted = this.hasAttribute("muted");
    if (this.hasAttribute("volume")) this._sound.volume = Number(this.getAttribute("volume"));
    this._stage?.setAttribute("aria-disabled", this.hasAttribute("locked") ? "true" : "false");
  }

  /* ----------------------------------------------------------- public API */

  whenReady() { return this._ready; }

  get labels() { return { ...this._labels }; }
  set labels(v) { this._labels = { ...DEFAULT_LABELS, ...(v || {}) }; if (this._built) this._applyLabels(); }

  /** A custom roller pattern { label, tile: number | "sheet", draw(ctx, w, h, opts) }; null for the `roller` attribute. */
  get pattern() { return this._pattern; }
  set pattern(p) { this._pattern = p || null; if (this._built) { this._retexture(); this._render(true); } }

  /** "empty" | "loading" | "gripped" | "released" | "out" */
  get state() { return this._core.state; }
  get progress() { return this._core.progress; }
  /** Crank turns so far. */
  get turns() { return this._core.turns; }
  /** Sheet length (content px) fed by one full crank turn. */
  get turnLength() { return this._core.turnLength * PX; }
  get sheet() { return this._spec ? { ...this._spec } : null; }
  get busy() { return this._core.active; }

  /**
   * Put a sheet on the infeed. spec: { width, length, paper, content, id, data, lead }
   * or the name of a <template data-sheet="name"> child. Resolves when the rollers grip it.
   */
  load(spec) {
    // synchronous once ready, so load(); clear(); behaves in call order
    if (!this._built) return this._ready.then(() => this._load(spec));
    return this._load(spec);
  }

  _load(spec) {
    const s = this._resolveSpec(spec);
    if (this._sheetDom) this._dropSheet(true);
    this._settle();                     // an earlier load()/feedAll() for a replaced sheet resolves null
    const rec = (this._rec = { grip: [], out: [] });
    this._spec = s;
    this._mountSheet(s);
    this._core.load(s.length / PX, { lead: s.lead ?? PRESS_DEFAULTS.lead });
    this._sound.slide();
    this._emit("load", { sheet: { ...s } });
    this._wake();
    if (this._core.state === "gripped") return Promise.resolve(this.sheet);
    return new Promise((res) => rec.grip.push(res));
  }

  /**
   * Turn the crank by `turns` (animated). Resolves true when it gets there,
   * false if it was stopped first (another crank(), the user's hand or keys,
   * `locked`, removal from the page).
   */
  crank(turns = 1, { speed = RPS } = {}) {
    if (this.hasAttribute("locked") || this._drag || this._core.held) return Promise.resolve(false);
    const id = ++this._motorId;
    const p = new Promise((res) => this._arrive.set(id, res));
    this._sound.unlock();
    if (!this._core.drive(speed * TAU, this._core.angle + Math.max(0, turns) * TAU, id)) this._resolveArrive(id, false);
    this._wake();
    return p;
  }

  /** Crank until the current sheet is out on the table. Resolves with the sheet, or null if interrupted. */
  async feedAll({ speed = RPS } = {}) {
    const rec = this._rec;
    if (!this._spec || !rec) return null;
    if (this._core.state === "loading" && !(await new Promise((res) => rec.grip.push(res)))) return null;
    if (rec !== this._rec) return null;
    if (this._core.state === "gripped") {
      const turns = (this._core.releaseAngle() - this._core.angle) / TAU + 0.04;
      const run = this.crank(turns, { speed });
      rec.motor = this._motorId; // stopped if this sheet is cleared or replaced
      if (!(await run) || rec !== this._rec) return null;
    }
    if (this._core.state === "released" && !(await new Promise((res) => rec.out.push(res)))) return null;
    return rec === this._rec ? this.sheet : null;
  }

  /** Take the finished sheet off the table. Resolves with { sheet, node } (null if nothing to take). */
  take() {
    const st = this._core.state;
    if (st !== "out" && st !== "released") return Promise.resolve(null);
    const spec = this._spec;
    const node = this._flatSheet(spec);
    this._core.take();
    this._settle();
    this._sound.take();
    const dom = this._sheetDom;
    this._sheetDom = null;
    this._spec = null;
    dom.layer.classList.add("pr-taking");
    for (const el of dom.infeed) el.remove();
    const detail = { sheet: { ...spec }, node };
    return new Promise((res) => {
      setTimeout(() => {
        dom.layer.remove();
        dom.shadowLayer?.remove();
        this._emit("take", detail);
        res(detail);
        if (this.hasAttribute("refill") && this.isConnected && !this._spec) this.load(spec.template ?? stripRuntime(spec));
      }, 460);
    });
  }

  /** Remove the sheet at once, wherever it is. Pending load()/feedAll() promises resolve null. */
  clear() {
    if (this._sheetDom) this._dropSheet(false);
    this._core.clear();
    this._settle();
    this._spec = null;
    this._render(true);
  }

  /** Settle the current sheet's pending promises (with `value`) and forget them. */
  _settle(value = null) {
    const rec = this._rec;
    this._rec = null;
    if (!rec) return;
    if (rec.motor && this._core.motorId === rec.motor) this._core.stop();
    for (const fn of rec.grip.splice(0)) fn(value);
    for (const fn of rec.out.splice(0)) fn(value);
  }

  _resolveArrive(id, ok) {
    const res = this._arrive.get(id);
    if (res) { this._arrive.delete(id); res(ok); }
  }

  /* --------------------------------------------------------------- sheets */

  /** <style data-sheet-style> children style sheet content inside the shadow root. */
  _adoptSheetStyles() {
    this._sheetStyle?.remove();
    const css = [...this.querySelectorAll(":scope > style[data-sheet-style]")].map((s) => s.textContent).join("\n");
    if (!css) return;
    this._sheetStyle = document.createElement("style");
    this._sheetStyle.textContent = css;
    this.shadowRoot.append(this._sheetStyle);
  }

  _resolveSpec(spec) {
    let s = spec;
    if (s == null || typeof s === "string") {
      const name = s;
      const tpl = [...this.querySelectorAll("template[data-sheet]")].find((t) => name == null || t.dataset.sheet === name);
      if (tpl) {
        const num = (v) => (v != null && v !== "" ? Number(v) : undefined);
        s = { id: tpl.dataset.sheet, template: tpl.dataset.sheet, content: tpl, width: num(tpl.dataset.width), length: num(tpl.dataset.length), paper: tpl.dataset.paper };
      } else s = {};
    }
    const out = { ...s };
    out.width = clamp(Number(out.width) || SHEET_DEFAULTS.width, 40, MAX_SHEET_W * PX);
    out.length = clamp(Number(out.length) || SHEET_DEFAULTS.length, 40, 4000);
    out.paper = out.paper || this.getAttribute("paper") || "cream";
    return out;
  }

  _paperOf(name) {
    const p = PAPERS[name];
    if (p) return p;
    return { color: name, noise: 1 };
  }

  _contentNode(c) {
    if (c == null || c === "") return null;
    if (typeof c === "string") { const t = document.createElement("template"); t.innerHTML = c; return t.content; }
    if (c instanceof HTMLTemplateElement) return c.content;
    if (typeof c === "function") return this._contentNode(c());
    if (c instanceof Node) return c;
    return null;
  }

  _mountSheet(spec) {
    const P = this._P;
    const Wu = spec.width / PX, Lu = spec.length / PX;
    const paper = this._paperOf(spec.paper);
    const tiles = this._retexture(Wu);
    const content = this._contentNode(spec.content);
    const noise = `url('${paperNoiseUrl(paper.noise ?? 1, !!paper.fibre)}')`;
    const clip = paper.deckle ? deckle(Wu, Lu, (spec.length + spec.width) % 97) : "";
    const x0 = XC - Wu / 2;

    const layer = document.createElement("div");
    layer.className = "pr-layer pr-sheets";
    const shadowLayer = document.createElement("div");
    shadowLayer.className = "pr-layer";
    const segs = pathSegments(OUTFEED, REACH + 60);
    const sheets = [];
    const embossBg = tiles.paper ? `background-image:url('${tiles.paper}');background-size:${f(tiles.tileW)}px ${f(tiles.tileH)}px;background-repeat:${tiles.repeatX ? "repeat" : "repeat-y"};background-position-x:${f((Wu - tiles.tileW) / 2)}px;` : "";
    const sheetHtml = `<div class="pr-sheet${paper.deckle ? "" : " pr-edge"}" style="width:${f(Wu)}px;height:${f(Lu)}px;--_paper:${esc(paper.color)};--_paper-noise:${noise};${clip ? `clip-path:${clip};` : ""}">
      ${embossBg ? `<div class="pr-emboss" style="${embossBg}"></div>` : ""}
      <div class="pr-content"><div class="pr-content-in" style="width:${spec.width}px;height:${spec.length}px"></div></div></div>`;
    segs.forEach((seg, i) => {
      const el = document.createElement("div");
      el.className = "pr-plane pr-seg";
      el.dataset.seg = String(i);
      el.style.cssText = `width:${f(Wu)}px;height:${f(seg.len + 0.6)}px;transform:${P.plane([x0, seg.o[0], seg.o[1]], [1, 0, 0], seg.dir)};--_shade:${segShade(seg.dir)}`;
      el.innerHTML = sheetHtml;
      const sheetEl = el.firstElementChild;
      if (content) sheetEl.querySelector(".pr-content-in").append(content.cloneNode(true));
      el.setAttribute("aria-hidden", "true");
      layer.append(el);
      sheets.push({ el, sheet: sheetEl, emboss: sheetEl.querySelector(".pr-emboss"), seg, shown: true });
    });
    // the leading edge lifts a little off the table
    const curl = paper.deckle ? [] : CURL.map((c) => {
      const el = document.createElement("div");
      el.className = "pr-plane pr-seg";
      el.style.cssText = `width:${f(Wu)}px;height:${f(c.len + 0.4)}px;visibility:hidden;--_shade:rgba(255,252,244,${(c.angle / 120).toFixed(3)})`;
      el.innerHTML = sheetHtml;
      const sheetEl = el.firstElementChild;
      if (content) sheetEl.querySelector(".pr-content-in").append(content.cloneNode(true));
      el.setAttribute("aria-hidden", "true");
      layer.append(el);
      return { el, sheet: sheetEl, emboss: sheetEl.querySelector(".pr-emboss"), ...c, shown: false };
    });
    // shadow under the part lying on the table
    const last = segs[segs.length - 1];
    const bd = BASE.body;
    const drapeShade = document.createElement("div");
    drapeShade.className = "pr-plane pr-drape-shade";
    drapeShade.style.cssText = `width:${f(Wu + 3)}px;height:${f(bd.z - BASE.plinth.z + 0.5)}px;transform:${P.plane([x0 + 1.5, bd.y1 + 0.15, bd.z], [1, 0, 0], [0, 0, -1])};visibility:hidden`;
    shadowLayer.append(drapeShade);
    const sp = document.createElement("div");
    sp.className = "pr-plane";
    sp.style.cssText = `width:${f(Wu)}px;height:${f(last.len)}px;transform:${P.plane([x0 + 1.2, last.o[0] + 1.6, 0], [1, 0, 0], [0, 1, 0])}`;
    sp.innerHTML = `<div class="pr-sheet-shadow"></div>`;
    shadowLayer.append(sp);
    const shadowEl = sp.firstElementChild;

    // infeed: the blank part still waiting behind the rollers
    const inSegs = pathSegments(INFEED, 400);
    const infeed = inSegs.map((seg) => {
      const el = document.createElement("div");
      el.className = "pr-plane pr-seg";
      el.style.cssText = `width:${f(Wu)}px;height:${f(seg.len + 0.6)}px;transform:${P.plane([x0, seg.o[0], seg.o[1]], [1, 0, 0], seg.dir)};--_paper:${esc(paper.color)};--_paper-noise:${noise};--_shade:${segShade(seg.dir, true)}`;
      el.innerHTML = `<div class="pr-blank"></div>`;
      el.setAttribute("aria-hidden", "true");
      return el;
    });
    this._infeedLayer.replaceChildren(...infeed);
    this._sheetsSlot.replaceChildren(shadowLayer, layer);

    this._sr.textContent = "";
    this._sheetDom = { layer, shadowLayer, sheets, curl, drapeShade, lipArc: segs[2].a, x0, infeed: infeed, infeedSegs: inSegs, blanks: infeed.map((e) => e.firstElementChild), shadowEl, lastSeg: last, Wu, Lu, tiles, content };
    layer.addEventListener("pointerdown", (e) => {
      if (this._core.state !== "out" && this._core.state !== "released") return;
      e.preventDefault();
      e.stopPropagation();
      this.take();
    });
    layer.setAttribute("role", "button");
    layer.setAttribute("aria-label", this._labels.sheet);
    this._lastS = null;
  }

  _dropSheet(fade) {
    const dom = this._sheetDom;
    this._sheetDom = null;
    if (!dom) return;
    for (const el of dom.infeed) el.remove();
    if (fade) {
      dom.layer.classList.add("pr-fading");
      dom.shadowLayer.remove();
      setTimeout(() => dom.layer.remove(), 260);
    } else { dom.layer.remove(); dom.shadowLayer.remove(); }
  }

  /** A standalone copy of the pressed sheet for the host page (inline styles only). */
  _flatSheet(spec) {
    const dom = this._sheetDom;
    const paper = this._paperOf(spec.paper);
    const node = document.createElement("div");
    node.className = "trinket-press-sheet";
    const t = dom.tiles;
    const emY = dom.embossY ?? 0;
    const noise = paperNoiseUrl(paper.noise ?? 1, !!paper.fibre);
    node.style.cssText = `${FLAT_SHEET_CSS};width:${spec.width}px;height:${spec.length}px;background-color:${paper.color};background-image:url("${noise}");background-size:192px 192px;${paper.deckle ? `clip-path:${deckle(spec.width, spec.length, (spec.length + spec.width) % 97)};` : ""}`;
    if (t.paper) {
      const em = document.createElement("div");
      em.style.cssText = `position:absolute;inset:0;pointer-events:none;background-image:url("${t.paper}");background-size:${t.tileW * PX}px ${t.tileH * PX}px;background-repeat:${t.repeatX ? "repeat" : "repeat-y"};background-position:${((dom.Wu - t.tileW) / 2) * PX}px ${emY * PX}px`;
      node.append(em);
    }
    if (dom.content) {
      const c = document.createElement("div");
      c.style.cssText = `position:absolute;inset:0;color:${getComputedStyle(this).getPropertyValue("--trinket-press-ink") || "#2c2622"}`;
      c.append(dom.content.cloneNode(true));
      node.append(c);
    }
    return node;
  }

  /* ------------------------------------------------------------- textures */

  _retexture(widthUnits) {
    const name = this.getAttribute("roller") || "vine";
    const pattern = this._pattern || PATTERNS[name] || PATTERNS.vine;
    const cs = getComputedStyle(this);
    const brass = rgbOf(cs.getPropertyValue("--trinket-press-brass") || "#c9a05a");
    const inkName = this.getAttribute("ink");
    const ink = rgbOf(INKS[inkName] || inkName || cs.getPropertyValue("--trinket-press-ink") || "#2c2622");
    const impression = ["emboss", "deboss", "ink", "none"].includes(this.getAttribute("impression")) ? this.getAttribute("impression") : "emboss";
    const W = widthUnits ?? this._sheetDom?.Wu ?? SHEET_DEFAULTS.width / PX;
    const tiles = bakeTiles(pattern, { width: W, height: this._core.turnLength, ppu: 5, impression, ink, brass, letter: this.getAttribute("letter") || "A" });
    this._tiles = tiles;
    const posX = tiles.repeatX ? mod(XC - tiles.tileW / 2 - ROLLER.x0, tiles.tileW) : XC - tiles.tileW / 2 - ROLLER.x0;
    this._facetPosX = posX;
    for (const fc of this._facets) {
      fc.el.style.backgroundImage = `url("${tiles.roller}"), url("${tiles.base}")`;
      fc.el.style.backgroundSize = `${f(tiles.tileW)}px ${f(tiles.tileH)}px, 32px ${f(tiles.tileH)}px`;
      fc.el.classList.toggle("pr-tiled", tiles.repeatX);
    }
    return tiles;
  }

  /* ---------------------------------------------------------------- build */

  _layoutScene() {
    const P = createProjector(CAMERA);
    const pts = [];
    const pl = BASE.plinth;
    for (const x of [pl.x0, pl.x1]) for (const y of [pl.y0, pl.y1]) for (const z of [0, BASE.top.z]) pts.push(P.proj(x, y, z));
    for (const x of [FRAMES.left.x0, FRAMES.right.x1]) for (const y of [86, 104]) pts.push(P.proj(x, y, 148));
    pts.push(P.proj(XC, ROLLER.y, CROSSBAR.z1 + 14));
    for (const x of [TRAY.x0, TRAY.x1]) pts.push(P.proj(x, TRAY.b[0], TRAY.b[1]));
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * TAU;
      pts.push(P.proj(WHEEL.x, ROLLER.y + Math.cos(t) * (WHEEL.r + 2), ROLLER.z + Math.sin(t) * (WHEEL.r + 2)));
      const py = ROLLER.y + Math.cos(t) * CRANK.r, pz = ROLLER.z + Math.sin(t) * CRANK.r;
      for (const dx of [0, 36]) for (const [oy, oz] of [[9, 0], [-9, 0], [0, 9], [0, -9]]) pts.push(P.proj(CRANK.x + dx, py + oy, pz + oz));
    }
    const out = OUTFEED[OUTFEED.length - 1];
    for (const x of [XC - MAX_SHEET_W / 2 * 0.75, XC + MAX_SHEET_W / 2 * 0.75]) pts.push(P.proj(x, out[0] + REACH, 0));
    const pad = 10;
    const minX = Math.min(...pts.map((p) => p.x)) - pad, maxX = Math.max(...pts.map((p) => p.x)) + pad;
    const minY = Math.min(...pts.map((p) => p.y)) - pad, maxY = Math.max(...pts.map((p) => p.y)) + pad;
    P.origin.x = -minX;
    P.origin.y = -minY;
    this._P = P;
    this._W = Math.ceil(maxX - minX);
    this._H = Math.ceil(maxY - minY);
  }

  _build() {
    this._layoutScene();
    const cast = castNoiseUrl();
    if (cast) this.style.setProperty("--_cast", `url("${cast}")`);
    this._grain = castGrainUrl();
    const P = this._P;
    const label = this.getAttribute("label") ?? "TRINKET";
    const sublabel = this.getAttribute("sublabel") ?? "PAPER WORKS";
    const plane = (cls, o, u, v, w, h, inner = "", style = "") =>
      `<div class="pr-plane ${cls}" style="width:${f(w)}px;height:${f(h)}px;transform:${P.plane(o, u, v)};${style}">${inner}</div>`;
    const flat = (cls, x, y, z, w, h, inner = "", style = "") => plane(cls, [x, y, z], [1, 0, 0], [0, 1, 0], w, h, inner, style);
    const sceneSvg = (inner, attrs = "") => `<svg class="pr-abs" ${attrs} style="width:${this._W}px;height:${this._H}px" viewBox="0 0 ${this._W} ${this._H}" aria-hidden="true">${inner}</svg>`;
    const lx = (o) => { const r = latheX(P, o); return `<defs>${r.defs}</defs>${r.body}`; };
    const shade = (n, o) => `--_shade:${faceShade(n, P, o).color}`;
    const X = [1, 0, 0], Y = [0, 1, 0], Zd = [0, 0, -1];

    const parts = [];
    /* --- ground --- */
    const pl = BASE.plinth, bd = BASE.body, tp = BASE.top;
    const gw = pl.x1 - pl.x0, gd = pl.y1 - pl.y0;
    parts.push(flat("pr-ground", pl.x0 + 4, pl.y0 - 4, 0, gw + 22, gd + 18, "", "opacity:.26;filter:blur(26px);border-radius:60px"));
    parts.push(flat("pr-ground", pl.x0 + 2, pl.y0, 0, gw + 8, gd + 6, "", "opacity:.34;filter:blur(9px);border-radius:22px"));
    parts.push(flat("pr-ground", pl.x0 + 0.5, pl.y0 + 0.5, 0, gw, gd, "", "opacity:.62;filter:blur(2.2px);border-radius:4px"));

    /* --- base --- */
    parts.push(flat("pr-face pr-plinth pr-top", pl.x0, pl.y0, pl.z, pl.x1 - pl.x0, pl.y1 - pl.y0,
      `<svg class="pr-fill" viewBox="0 0 ${pl.x1 - pl.x0} ${pl.y1 - pl.y0}" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="prAo1" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.4"/></filter></defs>
        <path d="M${bd.x0 - pl.x0 - 1} ${bd.y1 - pl.y0 + 0.6} H${bd.x1 - pl.x0 + 0.6} V${bd.y0 - pl.y0 - 1}" fill="none" stroke="#140a02" stroke-opacity=".55" stroke-width="2.4" filter="url(#prAo1)"/>
        <path d="M2 ${pl.y1 - pl.y0 - 0.5} H${pl.x1 - pl.x0 - 0.5} V2" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".7"/>
        <path d="M2 ${pl.y1 - pl.y0 - 0.6} H${pl.x1 - pl.x0 - 0.6} V2" fill="none" style="stroke:var(--_brass)" stroke-opacity=".45" stroke-width=".7" stroke-linecap="round" stroke-dasharray="${wearDash(400)}"/></svg>`, shade([0, 0, 1])));
    parts.push(plane("pr-face pr-plinth pr-front", [pl.x0, pl.y1, pl.z], X, Zd, pl.x1 - pl.x0, pl.z, "", shade([0, 1, 0])));
    parts.push(plane("pr-face pr-plinth pr-side", [pl.x1, pl.y0, pl.z], Y, Zd, pl.y1 - pl.y0, pl.z, "", shade([1, 0, 0])));
    parts.push(plane("pr-face pr-front", [bd.x0, bd.y1, bd.z], X, Zd, bd.x1 - bd.x0, bd.z - pl.z, stripeSvg(bd.x1 - bd.x0, bd.z - pl.z, { top: 2.6, bottom: 2.4 }), shade([0, 1, 0])));
    const plateW = 104, plateH = 16.5, plateY = (bd.y0 + bd.y1) / 2 - plateW / 2;
    parts.push(plane("pr-face pr-side", [bd.x1, bd.y1, bd.z], [0, -1, 0], Zd, bd.y1 - bd.y0, bd.z - pl.z,
      stripeSvg(bd.y1 - bd.y0, bd.z - pl.z, { top: 2.6, bottom: 2.4 }) +
      `<div style="position:absolute;left:${bd.y1 - plateY - plateW}px;top:${(bd.z - pl.z - plateH) / 2}px;width:${plateW}px;height:${plateH}px">${plateSvg(label, sublabel, plateW, plateH)}</div>`, shade([1, 0, 0])));
    const bevelLen = Math.hypot(4, 4);
    const bevelWear = (w) => `<svg class="pr-fill" viewBox="0 0 ${w} ${f(bevelLen)}" preserveAspectRatio="none" aria-hidden="true"><path d="M4 .5 H${w - 4}" stroke="#fff" stroke-opacity=".45" stroke-width=".7"/><path d="M4 .6 H${w - 4}" style="stroke:var(--_brass)" stroke-opacity=".5" stroke-width=".9" stroke-linecap="round" stroke-dasharray="${wearDash(w)}"/></svg>`;
    parts.push(plane("pr-face pr-bevel", [bd.x0, tp.y1, tp.z], X, [0, 4 / bevelLen, -4 / bevelLen], bd.x1 - bd.x0, bevelLen, bevelWear(bd.x1 - bd.x0),
      `clip-path:polygon(4px 0, ${bd.x1 - bd.x0 - 4}px 0, 100% 100%, 0 100%);${shade([0, 1, 1])}`));
    parts.push(plane("pr-face pr-bevel", [tp.x1, bd.y0, tp.z], Y, [4 / bevelLen, 0, -4 / bevelLen], bd.y1 - bd.y0, bevelLen, bevelWear(bd.y1 - bd.y0),
      `clip-path:polygon(4px 0, ${bd.y1 - bd.y0 - 4}px 0, 100% 100%, 0 100%);${shade([1, 0, 1])}`));
    parts.push(flat("pr-face pr-top", tp.x0, tp.y0, tp.z, tp.x1 - tp.x0, tp.y1 - tp.y0,
      `<svg class="pr-fill" viewBox="0 0 ${tp.x1 - tp.x0} ${tp.y1 - tp.y0}" preserveAspectRatio="none" aria-hidden="true"><rect x="4" y="4" width="${tp.x1 - tp.x0 - 8}" height="${tp.y1 - tp.y0 - 8}" rx="3" fill="none" style="stroke:var(--_brass)" stroke-width=".6" opacity=".7"/></svg>`, shade([0, 0, 1])));
    // frame feet shadows on the base top
    for (const fr of [FRAMES.left, FRAMES.right]) {
      parts.push(flat("pr-ground", fr.x0 - 1, 33, tp.z + 0.1, fr.x1 - fr.x0 + 14, 124, "", "opacity:.42;filter:blur(5px);border-radius:12px;background:linear-gradient(90deg,var(--_shadow),color-mix(in oklab,var(--_shadow),transparent 60%) 60%,transparent)"));
      parts.push(flat("pr-ground", fr.x0 - 0.6, 35, tp.z + 0.12, fr.x1 - fr.x0 + 2.4, 120, "", "opacity:.7;filter:blur(1.2px);border-radius:3px"));
    }
    // under the rollers it is dark
    parts.push(flat("pr-ground", ROLLER.x0, 64, tp.z + 0.1, ROLLER.x1 - ROLLER.x0, 60, "", "opacity:.45;filter:blur(8px);border-radius:30px"));

    /* --- left frame (we see its inner face) --- */
    const frameLayer = (x, svg) => plane("", [x, FRAME_BOX.y0, FRAME_BOX.zTop], Y, Zd, FRAME_BOX.w, FRAME_BOX.h, svg);
    parts.push(sceneSvg(extrusionSvg(P, FRAMES.left.x0, FRAMES.left.x1)));
    parts.push(frameLayer(FRAMES.left.x1, frameSvg({ face: true, grain: this._grain })));

    /* --- infeed tray & the waiting sheet --- */
    const tl = Math.hypot(TRAY.b[0] - TRAY.a[0], TRAY.b[1] - TRAY.a[1]);
    const tdir = [0, (TRAY.b[0] - TRAY.a[0]) / tl, (TRAY.b[1] - TRAY.a[1]) / tl];
    parts.push(plane("pr-tray", [TRAY.x0, TRAY.a[0], TRAY.a[1] - 0.6], X, tdir, TRAY.x1 - TRAY.x0, tl));
    parts.push(`<div class="pr-layer" data-layer="infeed"></div>`);

    /* --- tie rod, counter roller, guide plate --- */
    parts.push(sceneSvg(lx({ x0: TIE_ROD.x0, y: TIE_ROD.y, z: TIE_ROD.z, profile: [[0, TIE_ROD.r], [TIE_ROD.x1 - TIE_ROD.x0, TIE_ROD.r]], side: STEEL })));
    parts.push(sceneSvg(lx({ x0: LOWER.x0, y: LOWER.y, z: LOWER.z, profile: [[0, LOWER.r], [LOWER.x1 - LOWER.x0, LOWER.r]], side: STEEL_DIM })));
    const gl = Math.hypot(GUIDE.b[0] - GUIDE.a[0], GUIDE.b[1] - GUIDE.a[1]);
    const gdir = [0, (GUIDE.b[0] - GUIDE.a[0]) / gl, (GUIDE.b[1] - GUIDE.a[1]) / gl];
    parts.push(plane("", [GUIDE.x0, GUIDE.a[0], GUIDE.a[1]], X, gdir, GUIDE.x1 - GUIDE.x0, gl, guideSvg(GUIDE.x1 - GUIDE.x0, gl)));

    /* --- the sheet on its way out --- */
    parts.push(`<div class="pr-layer" data-layer="sheets"></div>`);
    const nipShade = Math.hypot(GUIDE.a[0] - 95, GUIDE.a[1] - 71);
    parts.push(plane("pr-nip-shade", [ROLLER.x0, 95, 71.2], X, [0, (GUIDE.a[0] - 95) / nipShade, (GUIDE.a[1] - 71) / nipShade], ROLLER.x1 - ROLLER.x0, nipShade + 0.5, "", "background:rgba(22,11,2,.55)"));
    parts.push(plane("pr-nip-shade", [ROLLER.x0, GUIDE.a[0], GUIDE.a[1] + 0.25], X, gdir, ROLLER.x1 - ROLLER.x0, 24, "", "background:linear-gradient(rgba(22,11,2,.5),rgba(22,11,2,.18) 35%,rgba(22,11,2,0))"));

    /* --- pattern roller: facets sorted back to front --- */
    const N = ROLLER.facets, dA = TAU / N, r = ROLLER.r;
    const facets = [];
    for (let i = 0; i < N; i++) {
      const a0 = i * dA, am = a0 + dA / 2;
      const n = [0, Math.sin(am), -Math.cos(am)];
      if (!P.facing(n)) continue;
      const o = [ROLLER.x0, ROLLER.y + r * Math.sin(a0), ROLLER.z - r * Math.cos(a0)];
      const v = [0, Math.cos(am), Math.sin(am)];
      const h = 2 * r * Math.sin(dA / 2) + 0.32;
      facets.push({ a0, depth: P.depth(XC, o[1], o[2]), html: `<div class="pr-plane pr-facet" data-facet="${i}" style="width:${f(ROLLER.x1 - ROLLER.x0)}px;height:${f(h)}px;transform:${P.plane(o, X, v)}"></div>` });
    }
    facets.sort((a, b) => a.depth - b.depth);
    parts.push(`<div class="pr-layer" data-layer="roller">${facets.map((x) => x.html).join("")}</div>`);
    // one smooth light/shade pass over the whole cylinder
    parts.push(sceneSvg(lx({ x0: ROLLER.x0, y: ROLLER.y, z: ROLLER.z, profile: [[0, ROLLER.r + 0.15], [ROLLER.x1 - ROLLER.x0, ROLLER.r + 0.15]], side: ROLLER_SHADE })));
    // turned brass flanges at both ends, with grooves
    for (const [x0, flip] of [[ROLLER.x0, false], [ROLLER.x1 - 6.5, true]]) {
      const prof = [[0, ROLLER.r + 1.6], [1.6, ROLLER.r + 1.6], [2, ROLLER.r + 0.9], [3, ROLLER.r + 0.9], [3.4, ROLLER.r + 1.4], [5.6, ROLLER.r + 1.4], [6.5, ROLLER.r + 0.4]];
      const pr = flip ? prof.map(([dx, rr]) => [6.5 - dx, rr]).reverse() : prof;
      parts.push(sceneSvg(lx({ x0, y: ROLLER.y, z: ROLLER.z, profile: pr, side: BRASS })));
    }

    /* --- crossbar and the pressure knob --- */
    const cb = CROSSBAR;
    const cw = cb.x1 - cb.x0, cd = cb.y1 - cb.y0, rx = XC - cb.x0, ry = ROLLER.y - cb.y0;
    const petals = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return `<ellipse cx="${f(rx + Math.cos(a) * 9.3)}" cy="${f(ry + Math.sin(a) * 9.3)}" rx="2.3" ry="1.25" transform="rotate(${f((a * 180) / Math.PI)} ${f(rx + Math.cos(a) * 9.3)} ${f(ry + Math.sin(a) * 9.3)})"/>`; }).join("");
    parts.push(flat("pr-face pr-top", cb.x0, cb.y0, cb.z1, cw, cd,
      `<svg class="pr-fill" viewBox="0 0 ${cw} ${cd}" aria-hidden="true">
        <rect x="2.2" y="2.2" width="${cw - 4.4}" height="${cd - 4.4}" rx="2" fill="none" style="stroke:var(--_body-deep)" stroke-opacity=".55" stroke-width="1.1" transform="translate(.35 .35)"/>
        <rect x="2.2" y="2.2" width="${cw - 4.4}" height="${cd - 4.4}" rx="2" fill="none" style="stroke:var(--_brass)" stroke-width=".55"/>
        <circle cx="${f(rx)}" cy="${f(ry)}" r="12.6" style="fill:var(--_body-deep)" opacity=".35" transform="translate(.6 .6)"/>
        <g style="fill:var(--_brass-mid)">${petals}</g>
        <circle cx="${f(rx)}" cy="${f(ry)}" r="7.6" style="fill:var(--_brass)" stroke="#fffaf0" stroke-opacity=".35" stroke-width=".4"/>
        <circle cx="${f(rx)}" cy="${f(ry)}" r="6.4" fill="none" style="stroke:var(--_brass-dark)" stroke-opacity=".6" stroke-width=".45"/>
        ${[22, cw - 22].map((x) => `<path d="M${x - 9} ${f(cd / 2)} H${x + 9}" style="stroke:var(--_brass)" stroke-width=".5" opacity=".8"/><path d="M${x} ${f(cd / 2 - 2.4)} L${x + 1.8} ${f(cd / 2)} L${x} ${f(cd / 2 + 2.4)} L${x - 1.8} ${f(cd / 2)} Z" style="fill:var(--_brass)"/>`).join("")}
      </svg>`, shade([0, 0, 1])));
    parts.push(plane("pr-face pr-crossbar-front", [cb.x0, cb.y1, cb.z1], X, Zd, cb.x1 - cb.x0, cb.z1 - cb.z0, stripeSvg(cb.x1 - cb.x0, cb.z1 - cb.z0, { top: 2.4, bottom: 2.2 }) +
      `<svg class="pr-fill" viewBox="0 0 ${cb.x1 - cb.x0} ${cb.z1 - cb.z0}" preserveAspectRatio="none" aria-hidden="true"><path d="M0 .4 H${cb.x1 - cb.x0}" stroke="#fff" stroke-opacity=".5" stroke-width=".8"/><path d="M0 .5 H${cb.x1 - cb.x0}" style="stroke:var(--_brass)" stroke-opacity=".5" stroke-width=".9" stroke-linecap="round" stroke-dasharray="${wearDash(cb.x1 - cb.x0)}"/><path d="M0 ${cb.z1 - cb.z0 - 0.3} H${cb.x1 - cb.x0}" stroke="#140a02" stroke-opacity=".5" stroke-width=".8"/></svg>`, shade([0, 1, 0])));
    // turned brass finials at both ends of the crossbar
    for (const fx of [cb.x0 + 8, cb.x1 - 8]) {
      parts.push(vCylinder(P, { cx: fx, cy: ROLLER.y, r: 4.2, z0: cb.z1, z1: cb.z1 + 1.4, side: BRASS, top: "var(--_brass)" }));
      parts.push(vCylinder(P, { cx: fx, cy: ROLLER.y, r: 1.7, z0: cb.z1 + 1.2, z1: cb.z1 + 3.6, side: BRASS }));
      parts.push(vCylinder(P, { cx: fx, cy: ROLLER.y, r: 3, z0: cb.z1 + 3.4, z1: cb.z1 + 5.6, side: BRASS, top: "var(--_brass-light)" }));
      parts.push(vCylinder(P, { cx: fx, cy: ROLLER.y, r: 1.1, z0: cb.z1 + 5.5, z1: cb.z1 + 7.2, side: BRASS, top: "var(--_brass-hi)" }));
    }
    parts.push(vCylinder(P, { cx: XC, cy: ROLLER.y, r: 4.2, z0: cb.z1, z1: cb.z1 + 4, side: STEEL }));
    parts.push(vCylinder(P, { cx: XC, cy: ROLLER.y, r: 9.5, z0: cb.z1 + 3.5, z1: cb.z1 + 11, side: BRASS, top: "var(--_brass)", topStroke: "var(--_brass-hi)", knurl: 18 }));
    parts.push(vCylinder(P, { cx: XC, cy: ROLLER.y, r: 3.4, z0: cb.z1 + 11, z1: cb.z1 + 13, side: BRASS, top: "var(--_brass-hi)" }));

    /* --- right frame (outer face) --- */
    parts.push(sceneSvg(extrusionSvg(P, FRAMES.right.x0, FRAMES.right.x1)));
    parts.push(frameLayer(FRAMES.right.x1, frameSvg({ face: true, outer: true, grain: this._grain })));

    /* --- axles, gears, wheel, crank --- */
    parts.push(sceneSvg(
      lx({ x0: FRAMES.right.x1, y: LOWER.y, z: LOWER.z, profile: [[0, 4], [7, 4]], side: STEEL }) +
      lx({ x0: FRAMES.right.x1, y: ROLLER.y, z: ROLLER.z, profile: [[0, 4.6], [14, 4.6]], side: STEEL })));
    const gearPlane = (x, yc, zc, rr, svg, rot) => {
      const s = rr + 4;
      return plane("", [x, yc - s, zc + s], Y, Zd, 2 * s, 2 * s, rot ? `<div class="pr-rot" data-rot="${rot}">${svg}</div>` : svg);
    };
    const G = GEARS;
    for (const [gr, gy, gz, kind] of [[G.lower, LOWER.y, LOWER.z, "lower"], [G.upper, ROLLER.y, ROLLER.z, "upper"]]) {
      for (let k = 4; k >= 1; k--) parts.push(gearPlane(G.x - k * 0.8, gy, gz, gr.r, gearSvg(gr.r, gr.teeth, k), kind));
      parts.push(gearPlane(G.x, gy, gz, gr.r, gearSvg(gr.r, gr.teeth), kind));
    }
    const wheelPlane = (x, inner) => plane("", [x, ROLLER.y - 50, ROLLER.z + 50], Y, Zd, 100, 100, inner);
    WHEEL.layers.forEach((x, i) => parts.push(wheelPlane(x, wheelRimSvg(WHEEL.layers.length - i))));
    parts.push(wheelPlane(WHEEL.x - 2.4, `<div class="pr-rot" data-rot="wheel">${wheelSpokesSvg(true)}</div>`));
    parts.push(wheelPlane(WHEEL.x - 0.8, `<div class="pr-rot" data-rot="wheel">${wheelSpokesSvg()}</div>`));
    parts.push(wheelPlane(WHEEL.x, wheelRimSvg(0)));
    parts.push(sceneSvg(lx({ x0: WHEEL.x - 1, y: ROLLER.y, z: ROLLER.z, profile: [[0, 10.8], [1.6, 10.8], [2.4, 9.2], [CRANK.x - WHEEL.x, 8.6]], side: BRASS, cap: "var(--_brass)" })));
    parts.push(wheelPlane(CRANK.x - 3, `<div class="pr-rot pr-cast" data-rot="crank">${crankArmSvg(true)}</div>`));
    parts.push(wheelPlane(CRANK.x - 1.3, `<div class="pr-rot" data-rot="crank">${crankArmSvg(true)}</div>`));
    parts.push(wheelPlane(CRANK.x, `<div class="pr-rot" data-rot="crank">${crankArmSvg(false)}</div>`));
    parts.push(sceneSvg(lx({ x0: CRANK.x, y: ROLLER.y, z: ROLLER.z, profile: [[0, 5.6], [2.6, 5.6], [3.3, 4.6], [4.6, 4], [5.6, 2.6], [6, 1]], side: BRASS, cap: "var(--_brass-hi)" })));
    parts.push(sceneSvg("", 'data-layer="handle"'));

    /* --- hit areas --- */
    const ring = [];
    for (let i = 0; i < 36; i++) {
      const t = (i / 36) * TAU;
      ring.push(P.proj(WHEEL.x + 2, ROLLER.y + Math.cos(t) * (WHEEL.r + 10), ROLLER.z + Math.sin(t) * (WHEEL.r + 10)));
    }
    const hx0 = Math.min(...ring.map((p) => p.x)), hy0 = Math.min(...ring.map((p) => p.y));
    const hw = Math.max(...ring.map((p) => p.x)) - hx0, hh = Math.max(...ring.map((p) => p.y)) - hy0;
    const clip = ring.map((p) => `${f(p.x - hx0)}px ${f(p.y - hy0)}px`).join(",");
    const hit = `<div class="pr-hit" data-hit="crank" style="left:${f(hx0)}px;top:${f(hy0)}px;width:${f(hw)}px;height:${f(hh)}px;clip-path:polygon(${clip})"></div>
      <div class="pr-hit pr-hit-handle" data-hit="crank" data-handle></div>`;

    this._stage = document.createElement("div");
    this._stage.className = "pr-stage";
    this._stage.setAttribute("part", "stage");
    this._stage.tabIndex = 0;
    this._stage.setAttribute("role", "button");
    this._stage.style.aspectRatio = `${this._W} / ${this._H}`;
    this._stage.innerHTML = `<div class="pr-scene" style="width:${this._W}px;height:${this._H}px">${parts.join("")}${hit}</div><div class="pr-sr" aria-live="polite"></div>`;
    this.shadowRoot.append(this._stage);

    const $ = (s) => this._stage.querySelector(s);
    this._infeedLayer = $('[data-layer="infeed"]');
    this._sheetsSlot = $('[data-layer="sheets"]');
    this._handleEl = $('[data-layer="handle"]');
    this._handleHit = $("[data-handle]");
    this._sr = $(".pr-sr");
    this._facets = [...this._stage.querySelectorAll("[data-facet]")].map((el) => ({ el, a0: Number(el.dataset.facet) * dA }));
    this._rots = [...this._stage.querySelectorAll("[data-rot]")].map((el) => ({ el, kind: el.dataset.rot }));
    this._bindInput();
    this._applyLabels();
  }

  _rebuild() {
    const spec = this._spec, state = this._core.state;
    this._stage?.remove();
    this._resize?.disconnect();
    this._build();
    this._retexture();
    if (spec) {
      this._mountSheet(spec);
      if (state !== "loading") this._setEmbossY();
    }
    if (this.isConnected) {
      this._resize = new ResizeObserver(() => this._measure());
      this._resize.observe(this._stage);
      this._measure();
    }
    this._render(true);
  }

  _applyLabels() {
    this._stage.setAttribute("aria-label", this._labels.crank);
    this._sheetDom?.layer.setAttribute("aria-label", this._labels.sheet);
  }

  _measure() {
    const w = this._stage.getBoundingClientRect().width || this._W;
    this._k = w / this._W;
    this.style.setProperty("--_k", String(this._k));
  }

  /* --------------------------------------------------------------- input */

  _scenePoint(e) {
    const rect = this._stage.getBoundingClientRect();
    const k = rect.width / this._W || 1;
    return [(e.clientX - rect.left) / k, (e.clientY - rect.top) / k];
  }

  _crankAngleAt(e) {
    const [sx, sy] = this._scenePoint(e);
    const [y, z] = this._P.onPlaneX(sx, sy, CRANK.x);
    const dy = y - ROLLER.y, dz = z - ROLLER.z;
    return { a: Math.atan2(dz, dy), r: Math.hypot(dy, dz) };
  }

  _bindInput() {
    const st = this._stage;
    st.addEventListener("pointerdown", (e) => {
      this._sound.unlock();
      const hit = e.target.closest?.('[data-hit="crank"]');
      if (!hit) return;
      e.preventDefault();
      if (this.hasAttribute("locked")) return;
      const { a } = this._crankAngleAt(e);
      this._drag = { id: e.pointerId, a, t: now(), touch: e.pointerType !== "mouse" };
      st.setPointerCapture?.(e.pointerId);
      st.toggleAttribute("data-cranking", true);
      this._core.grab();
      this._wake();
    });
    const move = (e) => {
      const d = this._drag;
      if (!d || d.id !== e.pointerId) return;
      e.preventDefault();
      const { a, r } = this._crankAngleAt(e);
      if (r < 6) return;
      const t = now();
      const delta = wrapPi(a - d.a);
      d.a = a;
      this._core.drag(delta, t - d.t);
      d.t = t;
      this._wake();
    };
    const up = (e) => {
      const d = this._drag;
      if (!d || d.id !== e.pointerId) return;
      this._drag = null;
      st.toggleAttribute("data-cranking", false);
      this._core.release();
      this._wake();
    };
    st.addEventListener("pointermove", move);
    st.addEventListener("pointerup", up);
    st.addEventListener("pointercancel", up);
    st.addEventListener("lostpointercapture", up);

    st.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const fwd = ["ArrowRight", "ArrowDown", "ArrowUp", " ", "Spacebar"].includes(e.key);
      if (fwd) {
        e.preventDefault();
        if (this.hasAttribute("locked")) return;
        this._sound.unlock();
        if (!e.repeat && !this._keyDrive) {
          this._keyDrive = this._core.drive(RPS * TAU, null, ++this._motorId);
          this._wake();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        this._sound.unlock();
        if (this._core.state === "out" || this._core.state === "released") this.take();
        else this.feedAll();
      } else if (e.key === "Escape") st.blur();
    });
    st.addEventListener("keyup", (e) => {
      if (!["ArrowRight", "ArrowDown", "ArrowUp", " ", "Spacebar"].includes(e.key)) return;
      if (this._keyDrive) { this._keyDrive = false; this._core.stop(); this._wake(); }
    });
    st.addEventListener("blur", () => { if (this._keyDrive) { this._keyDrive = false; this._core.stop(); } });
  }

  /* ------------------------------------------------------------ mechanics */

  _onCore(type, d) {
    switch (type) {
      case "tick":
        this._sound.tick(Math.abs(this._core.omega) / TAU);
        if (this._drag?.touch && this.getAttribute("haptics") !== "off") navigator.vibrate?.(3);
        this._emit("tick", { count: d.count, turns: this._core.turns });
        break;
      case "pawl":
        this._sound.pawl();
        this._emit("pawl");
        break;
      case "grip":
        this._sound.grip();
        this._setEmbossY();
        if (this._rec) for (const fn of this._rec.grip.splice(0)) fn(this.sheet);
        this._emit("grip", { sheet: this.sheet });
        break;
      case "release":
        this._sound.release();
        if (this._sheetDom?.content) this._sr.textContent = this._sheetDom.content.textContent?.trim() || "";
        this._emit("complete", { sheet: this.sheet });
        break;
      case "out":
        if (this._rec) for (const fn of this._rec.out.splice(0)) fn(this.sheet);
        this._emit("out", { sheet: this.sheet });
        break;
      case "arrive":
        this._resolveArrive(d.id, !d.stopped);
        break;
    }
  }

  /** Align the paper impression with where the roller was when it gripped. */
  _setEmbossY() {
    const dom = this._sheetDom;
    if (!dom || !dom.tiles.paper) return;
    const sheet = this._core.sheet;
    const ga = sheet?.gripAngle ?? this._core.angle;
    let y = mod(ROLLER.r * ga + dom.Lu, dom.tiles.tileH);
    // a sheet-sized die (border, monogram) is indexed so it starts at the sheet's top edge
    this._phase = 0;
    if (!dom.tiles.repeatX) { this._phase = y; y = 0; this._render(); }
    dom.embossY = y;
    for (const s of [...dom.sheets, ...dom.curl]) if (s.emboss) s.emboss.style.backgroundPositionY = `${f(y)}px`;
  }

  _wake() {
    if (this._raf || !this.isConnected) return;
    this._lastT = performance.now();
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  _tick(t) {
    this._raf = 0;
    const dt = Math.min(0.05, (t - this._lastT) / 1000);
    this._lastT = t;
    const active = this._core.step(dt);
    const sp = this._core.omega / TAU;
    const pressing = this._core.state === "gripped";
    this._sound.motion(sp, pressing);
    const sheet = this._core.sheet;
    if (sheet && pressing && sheet.s > 0 && sheet.s - this._crunchAt > 6) { this._crunchAt = sheet.s; if (this._tiles?.paper) this._sound.crunch(); }
    if (sheet && sheet.s < this._crunchAt) this._crunchAt = sheet.s;
    this._render(false);
    if (sheet && sheet.s !== this._lastS && sheet.s > 0) {
      this._lastS = sheet.s;
      this._emit("feed", { progress: this._core.progress, fed: Math.min(sheet.s, sheet.length) * PX, length: sheet.length * PX });
    }
    // handlers above may have detached us, or woken a loop of their own
    if (!this.isConnected || this._raf) return;
    if (active || this._drag || this._keyDrive) this._raf = requestAnimationFrame((tt) => this._tick(tt));
    else this._sound.motion(0, false);
  }

  _render() {
    if (!this._built) return;
    const P = this._P, phi = this._core.angle;
    const H = this._core.turnLength;
    const px = f(this._facetPosX ?? 0);
    for (const fc of this._facets) {
      const y = f(mod(ROLLER.r * (phi - fc.a0) - (this._phase || 0), H));
      fc.el.style.backgroundPosition = `${px}px ${y}px, 0px ${y}px`;
    }
    const deg = (phi * 180) / Math.PI;
    for (const r of this._rots) {
      const a = r.kind === "lower" ? deg * (GEARS.upper.r / GEARS.lower.r) : -deg;
      r.el.style.transform = `rotate(${a.toFixed(3)}deg)`;
    }
    // handle on the crank pin
    const py = ROLLER.y + Math.cos(phi) * CRANK.r, pz = ROLLER.z + Math.sin(phi) * CRANK.r;
    const x0 = CRANK.x + 0.4;
    const fer = latheX(P, { x0, y: py, z: pz, profile: HANDLE.ferrule, side: BRASS });
    const wood = latheX(P, { x0, y: py, z: pz, profile: HANDLE.wood, side: WOOD, cap: "var(--_wood)" });
    const shadowOf = (body) => body.replace(/fill="url\(#[^)]+\)"/g, 'fill="#1a0c02"').replace(/style="fill:[^"]*"/g, 'fill="#1a0c02"');
    const sh = P.proj(x0 - 7, py - 1.5, pz - 3.5), at = P.proj(x0, py, pz);
    this._handleEl.innerHTML = `<defs>${fer.defs}${wood.defs}<filter id="${this._uid}hs" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2"/></filter></defs>` +
      `<g opacity=".38" filter="url(#${this._uid}hs)" transform="translate(${f(sh.x - at.x)} ${f(sh.y - at.y)})">${shadowOf(fer.body + wood.body)}</g>${fer.body}${wood.body}`;
    const hm = P.proj(x0 + 19, py, pz);
    this._handleHit.style.transform = `translate(${f(hm.x - 22)}px, ${f(hm.y - 22)}px)`;

    // sheet
    const dom = this._sheetDom, sheet = this._core.sheet;
    if (dom && sheet) {
      const s = sheet.s, Lu = dom.Lu;
      for (const it of dom.sheets) {
        const top = s - Lu - it.seg.a;
        const vis = s > it.seg.a && top < it.seg.len;
        if (vis !== it.shown) { it.el.style.visibility = vis ? "" : "hidden"; it.shown = vis; }
        if (vis) it.sheet.style.transform = `translateY(${f(top)}px)`;
      }
      const b0 = Math.max(0, -s), b1 = Lu - s;
      dom.infeedSegs.forEach((seg, i) => {
        const a = Math.max(b0, seg.a) - seg.a, b = Math.min(b1, seg.a + seg.len) - seg.a;
        const el = dom.blanks[i];
        if (b <= a) { el.style.display = "none"; return; }
        el.style.display = "";
        el.style.top = `${f(a)}px`;
        el.style.height = `${f(b - a)}px`;
      });
      // leading-edge curl once it lies on the table
      const curlLen = CURL.reduce((a, c) => a + c.len, 0);
      const curling = dom.curl.length && s - curlLen > dom.lastSeg.a + 2 && Lu > curlLen * 3;
      const flat = dom.sheets[dom.sheets.length - 1];
      if (curling !== dom.curling) {
        dom.curling = curling;
        flat.sheet.style.clipPath = curling ? `inset(0 0 ${f(curlLen - 0.6)}px 0)` : "";
        for (const c of dom.curl) { c.el.style.visibility = curling ? "" : "hidden"; }
      }
      if (curling) {
        let y = dom.lastSeg.o[0] + (s - curlLen - dom.lastSeg.a), z = dom.lastSeg.o[1], used = 0;
        for (const c of dom.curl) {
          const a = (c.angle * Math.PI) / 180, dir = [0, Math.cos(a), Math.sin(a)];
          c.el.style.transform = P.plane([dom.x0, y, z], [1, 0, 0], dir);
          c.sheet.style.transform = `translateY(${f(-(Lu - curlLen + used))}px)`;
          y += dir[1] * c.len; z += dir[2] * c.len; used += c.len;
        }
      }
      if (dom.drapeShade) dom.drapeShade.style.visibility = s > dom.lipArc + 3 ? "" : "hidden";
      const ls = dom.lastSeg, top = s - Lu - ls.a;
      const a = Math.max(0, top), b = Math.min(ls.len, top + Lu);
      if (b > a) { dom.shadowEl.style.display = ""; dom.shadowEl.style.top = `${f(a)}px`; dom.shadowEl.style.height = `${f(b - a)}px`; }
      else dom.shadowEl.style.display = "none";
      if (dom.layer.dataset.state !== sheet.state) dom.layer.dataset.state = sheet.state;
    }
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

/** Shade for a paper segment by its slope (paper is lighter flat, darker on the drape). */
function segShade(dir, back = false) {
  if (back) return "rgba(40,25,10,.12)";
  // continuous: compare the segment's light with the flat table's
  const d = -dir[2] * 0.38 + dir[1] * 0.82 - 0.82;
  if (Math.abs(d) < 0.005) return "transparent";
  return d > 0 ? `rgba(255,252,244,${Math.min(0.2, d * 1.6).toFixed(3)})` : `rgba(40,25,10,${Math.min(0.32, -d * 0.75).toFixed(3)})`;
}

function stripRuntime(spec) {
  const { template, ...rest } = spec;
  return template ?? rest;
}

if (!customElements.get("trinket-press")) customElements.define("trinket-press", TrinketPress);
